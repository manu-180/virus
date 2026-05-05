/**
 * generate-visual-assets — Inngest function for the cinematic-AI-assets pipeline.
 *
 * Trigger: `virus/script.generated`
 * Payload: { videoId: string }
 *
 * Flow (each external effect lives in its own `step.run()` so Inngest memoises
 * the result and retries don't double-call Luma/Gemini or re-upload bytes):
 *
 *   1. load-context        — load video + project + idea + brand
 *   2. check-spend-cap     — sum_visual_spend_last_24h_user / _global; if over cap →
 *                            emit assets.generated with all-NULL ids and return early
 *   3. build-prompts       — buildPrompts(...) + computePromptHash() per slot
 *   4. For each slot of [hook, reveal, cta] in PARALLEL:
 *        a. resolve-slot   — read video_ideas.metadata.asset_choices (Zod) and
 *                            decide manual/reuse/fresh
 *        b. claim-row      — claimRow() inserts/upserts visual_assets pending row
 *        c. call-provider  — Luma or Gemini depending on pickProvider(category)
 *                            (90s timeout)
 *        d. upload-storage — upload bytes to bucket `visual-assets`
 *        e. finalize-row   — UPDATE visual_assets SET status=ready, storage_path...
 *        f. log-spend      — INSERT INTO usage_records
 *        g. link           — INSERT INTO video_assets_used (idempotent ON CONFLICT)
 *   5. update-video-metadata — best-effort UPDATE videos.metadata.assets (if column exists)
 *   6. log-event           — job_events row
 *   7. ALWAYS emit virus/assets.generated with the resolved ids (some may be null)
 *
 * Resilience: per-slot failures are caught locally, the failing slot resolves to
 * `null`, a virus/assets.failed event is emitted, and the other slots continue.
 * The onFailure handler ALSO emits virus/assets.generated with all-NULL ids so
 * the downstream synthesize-audio function always fires.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { logJobEvent } from '../utils/index.js';
import type { VideoRow } from '../utils/index.js';
import type { ScriptOutput } from '@virus/shared/ai';
import {
  AssetChoicesSchema,
  buildPrompts,
  claimRow,
  computePromptHash,
  findReusableAsset,
  providers as visualsProviders,
  seedFromVideoId,
  type AssetCategory,
  type AssetChoices,
  type VisualAssetRow,
} from '@virus/shared/visuals';

const { generateVideoLuma, generateImageGemini, pickProvider, defaultDurationFor } =
  visualsProviders;
type LumaGenOutput = Awaited<ReturnType<typeof generateVideoLuma>>;
type GeminiGenOutput = Awaited<ReturnType<typeof generateImageGemini>>;

// ---------------------------------------------------------------------------
// Constants / config
// ---------------------------------------------------------------------------

const ASSET_BUCKET = process.env['VISUAL_ASSETS_BUCKET'] ?? 'visual-assets';
const PROVIDER_TIMEOUT_MS = 90_000;
const SLOTS: ReadonlyArray<AssetCategory> = ['hook', 'reveal', 'cta'];

function getCaps(): { user: number; global: number } {
  const user = Number(process.env['ASSETS_MAX_USD_PER_USER_DAILY']);
  const global = Number(process.env['ASSETS_MAX_USD_GLOBAL_DAILY']);
  return {
    user: Number.isFinite(user) && user > 0 ? user : 20,
    global: Number.isFinite(global) && global > 0 ? global : 200,
  };
}

// ---------------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  theme_color: string | null;
}

interface BrandRow {
  one_liner: string | null;
}

interface IdeaRow {
  id: string;
  metadata: unknown;
}

interface AssetIdsBySlot {
  hook: string | null;
  reveal: string | null;
  cta: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Race a promise against a timeout. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms),
    ),
  ]);
}

/** Resolve `asset_choices` from `video_ideas.metadata` with safe Zod parse. */
function parseAssetChoices(metadata: unknown): AssetChoices {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md['asset_choices'];
  // schema has defaults so passing `undefined` yields all-fresh.
  const parsed = AssetChoicesSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  // Fallback: all-fresh.
  return AssetChoicesSchema.parse({});
}

function extFor(type: 'video' | 'image'): string {
  return type === 'video' ? 'mp4' : 'png';
}

function contentTypeFor(type: 'video' | 'image'): string {
  return type === 'video' ? 'video/mp4' : 'image/png';
}

// ---------------------------------------------------------------------------
// Always-emit helper for the onFailure path
// ---------------------------------------------------------------------------

async function emitAssetsGeneratedFallback(videoId: string): Promise<void> {
  try {
    await inngest.send({
      name: 'virus/assets.generated',
      data: {
        videoId,
        assetIds: { hook: null, reveal: null, cta: null },
      },
    });
  } catch (err) {
    console.error('[generate-visual-assets] emit fallback assets.generated failed', err);
  }
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const generateVisualAssets = inngest.createFunction(
  {
    id: 'generate-visual-assets',
    retries: 1,
    concurrency: { limit: 3 },
    onFailure: async ({ event, error }) => {
      const original = (
        event as unknown as { data: { event: { data: { videoId?: string } } } }
      ).data.event;

      const videoId = original?.data?.videoId;

      console.log({
        fn: 'generate-visual-assets',
        step: 'onFailure',
        videoId,
        error: error?.message,
      });

      if (!videoId) return;

      // Always emit assets.generated with NULL ids so downstream pipeline keeps
      // moving and audio synthesis fires.
      await emitAssetsGeneratedFallback(videoId);

      // Audit
      try {
        const db = getAdminClient();
        await db.from('job_events').insert({
          video_id: videoId,
          step: 'generate-visual-assets',
          status: 'failed',
          payload: { error: error?.message ?? 'unknown_error' },
        });
      } catch (auditErr) {
        console.error('[generate-visual-assets] onFailure job_events insert failed', auditErr);
      }
    },
  },
  { event: 'virus/script.generated' },
  async ({ event, step }) => {
    const { videoId } = event.data;

    console.log({ fn: 'generate-visual-assets', step: 'start', videoId });

    // ------------------------------------------------------------------
    // 1. load-context
    // ------------------------------------------------------------------
    const ctx = await step.run('load-context', async () => {
      const db = getAdminClient();

      const { data: videoData, error: videoErr } = await db
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single();
      if (videoErr || !videoData) {
        throw new Error(`video_not_found:${videoId}`);
      }
      const video = videoData as VideoRow;

      const { data: projectData, error: projectErr } = await db
        .from('projects')
        .select('id, theme_color')
        .eq('id', video.project_id)
        .single();
      if (projectErr || !projectData) {
        throw new Error(`project_not_found:${video.project_id}`);
      }
      const project = projectData as ProjectRow;

      let idea: IdeaRow | null = null;
      if (video.idea_id) {
        const { data: ideaData } = await db
          .from('video_ideas')
          .select('id, metadata')
          .eq('id', video.idea_id)
          .maybeSingle();
        if (ideaData) idea = ideaData as IdeaRow;
      }

      const { data: brandData } = await db
        .from('project_brand')
        .select('one_liner')
        .eq('project_id', video.project_id)
        .eq('is_current', true)
        .maybeSingle();
      const brand = (brandData as BrandRow | null) ?? null;

      return {
        video,
        project,
        idea,
        brand,
      };
    });

    const { video, project, idea, brand } = ctx;
    const userId = video.user_id;
    const projectId = video.project_id;
    const themeColor = video.theme_color ?? project.theme_color ?? '#3ECF8E';
    const language = video.language ?? 'es';
    const template = video.template ?? 'tip';
    const script = video.script as ScriptOutput;
    const choices = parseAssetChoices(idea?.metadata);

    // ------------------------------------------------------------------
    // 2. check-spend-cap
    // ------------------------------------------------------------------
    const spendCap = await step.run('check-spend-cap', async () => {
      const db = getAdminClient();
      const caps = getCaps();

      const { data: userSpendData } = await db.rpc(
        'sum_visual_spend_last_24h_user',
        { p_user_id: userId },
      );
      const { data: globalSpendData } = await db.rpc(
        'sum_visual_spend_last_24h_global',
      );

      const userSpend = Number(userSpendData ?? 0);
      const globalSpend = Number(globalSpendData ?? 0);

      const exceeded = userSpend > caps.user || globalSpend > caps.global;
      return { exceeded, userSpend, globalSpend, caps };
    });

    if (spendCap.exceeded) {
      console.log({
        fn: 'generate-visual-assets',
        step: 'spend-cap-reached',
        videoId,
        userSpend: spendCap.userSpend,
        globalSpend: spendCap.globalSpend,
        caps: spendCap.caps,
      });

      await step.run('log-spend-cap-reached', () =>
        logJobEvent(videoId, 'spend_cap_reached', 'failed', {
          userSpend: spendCap.userSpend,
          globalSpend: spendCap.globalSpend,
          caps: spendCap.caps,
        }),
      );

      await step.sendEvent('emit-assets-generated-cap', {
        name: 'virus/assets.generated',
        data: {
          videoId,
          assetIds: { hook: null, reveal: null, cta: null },
        },
      });

      return { ok: true, videoId, capped: true };
    }

    // ------------------------------------------------------------------
    // 3. build-prompts
    // ------------------------------------------------------------------
    interface SlotPlan {
      slot: AssetCategory;
      prompt: string;
      provider: 'luma' | 'gemini';
      type: 'video' | 'image';
      promptHash: string;
    }

    const built: { slotData: SlotPlan[] } = await step.run('build-prompts', async () => {
      const seed = seedFromVideoId(videoId);
      const promptInput: Parameters<typeof buildPrompts>[0] = {
        script,
        themeColor,
        language,
        template,
        seed,
      };
      if (brand?.one_liner) {
        promptInput.brandOneLiner = brand.one_liner;
      }
      const prompts = buildPrompts(promptInput);

      const slotData: SlotPlan[] = await Promise.all(
        SLOTS.map(async (slot): Promise<SlotPlan> => {
          const { provider, type } = pickProvider(slot);
          const promptHash = await computePromptHash({
            prompt: prompts[slot],
            themeColor,
            provider,
            template,
            language,
          });
          return {
            slot,
            prompt: prompts[slot],
            provider,
            type,
            promptHash,
          };
        }),
      );

      return { slotData };
    });

    // ------------------------------------------------------------------
    // 4. Per-slot generation in parallel.
    //    Each slot is an INDEPENDENT chain of step.run() calls. Errors are
    //    caught and translated to a NULL slot id; other slots continue.
    // ------------------------------------------------------------------

    const runSlot = async (slotInfo: SlotPlan): Promise<string | null> => {
      const { slot, prompt, provider, type, promptHash } = slotInfo;
      const choice = choices[slot];

      try {
        // ---- a. resolve-slot ----
        const resolved = await step.run(`resolve-slot-${slot}`, async () => {
          const db = getAdminClient();

          // Manual: use the provided assetId verbatim if it exists + matches
          // the slot category and is non-burned + ready.
          if (choice.mode === 'manual') {
            const { data } = await db
              .from('visual_assets')
              .select('id, status, burned, category')
              .eq('id', choice.assetId)
              .maybeSingle();
            if (
              data &&
              data['status'] === 'ready' &&
              data['burned'] === false &&
              data['category'] === slot
            ) {
              return { kind: 'use_existing' as const, assetId: data['id'] as string };
            }
            // Fall through to fresh on bad manual id.
          }

          // Reuse: pick from library by (category, theme_color), respecting cooldown.
          if (choice.mode === 'reuse') {
            const reusable = await findReusableAsset(db, projectId, slot, themeColor);
            if (reusable) {
              return { kind: 'use_existing' as const, assetId: reusable.id };
            }
            // Fall through to fresh on no match.
          }

          return { kind: 'generate' as const };
        });

        let assetId: string;

        if (resolved.kind === 'use_existing') {
          assetId = resolved.assetId;
        } else {
          // ---- b. claim-row ----
          const claim = await step.run(`claim-row-${slot}`, async () => {
            const db = getAdminClient();
            return claimRow(db, {
              projectId,
              userId,
              type,
              category: slot,
              provider,
              prompt,
              promptHash,
              template,
              language,
              themeColor,
            });
          });

          if (claim.status === 'ready') {
            // Cache hit — somebody else already produced this exact prompt.
            assetId = claim.assetId;
          } else if (!claim.weOwnIt) {
            // Concurrent generation in flight — bail on this slot to avoid
            // double-charging. Other slots continue.
            console.log({
              fn: 'generate-visual-assets',
              step: 'concurrent-pending',
              videoId,
              slot,
              assetId: claim.assetId,
            });
            throw new Error('concurrent_pending');
          } else {
            assetId = claim.assetId;

            // ---- c. call-provider + upload-storage (combined) ----
            //
            // These two are merged into a single step because Inngest memoises
            // step return values as JSON — a raw `Buffer` does not survive
            // round-trip serialisation. Uploading inside the same step keeps
            // the bytes in-memory and only the (small) metadata is persisted.
            //
            // Idempotency: the storage upload uses `upsert:true` and the row
            // claim acts as a distributed mutex so a retry that crosses this
            // boundary will re-call the provider, but only if the previous
            // attempt didn't reach `finalize-row`. Once finalised, the cache
            // hit at `claim-row` short-circuits before this step.
            const storagePath = `${userId}/${projectId}/${assetId}.${extFor(type)}`;
            interface ProviderMeta {
              width: number;
              height: number;
              costUsd: number;
              durationSec?: number;
            }
            const generated: ProviderMeta = await step.run(
              `call-provider-${slot}`,
              async (): Promise<ProviderMeta> => {
                let bytes: Buffer;
                let meta: ProviderMeta;
                if (type === 'video') {
                  const out: LumaGenOutput = await withTimeout(
                    generateVideoLuma({
                      prompt,
                      durationSec: defaultDurationFor(slot),
                      themeColor,
                      aspectRatio: '9:16',
                    }),
                    PROVIDER_TIMEOUT_MS,
                    `${provider}_${slot}`,
                  );
                  bytes = out.bytes;
                  meta = {
                    width: out.width,
                    height: out.height,
                    costUsd: out.costUsd,
                    durationSec: out.durationSec,
                  };
                } else {
                  const out: GeminiGenOutput = await withTimeout(
                    generateImageGemini({
                      prompt,
                      themeColor,
                      aspectRatio: '9:16',
                    }),
                    PROVIDER_TIMEOUT_MS,
                    `${provider}_${slot}`,
                  );
                  bytes = out.bytes;
                  meta = {
                    width: out.width,
                    height: out.height,
                    costUsd: out.costUsd,
                  };
                }

                // Upload immediately (still inside the call-provider step).
                const db = getAdminClient();
                const { error: uploadErr } = await db.storage
                  .from(ASSET_BUCKET)
                  .upload(storagePath, bytes, {
                    contentType: contentTypeFor(type),
                    upsert: true,
                  });
                if (uploadErr) {
                  throw new Error(`upload_failed:${slot}: ${uploadErr.message}`);
                }

                return meta;
              },
            );

            // ---- d. finalize-row ----
            await step.run(`finalize-row-${slot}`, async () => {
              const db = getAdminClient();
              const update: Record<string, unknown> = {
                status: 'ready',
                storage_path: storagePath,
                width: generated.width,
                height: generated.height,
                error: null,
              };
              if (type === 'video' && generated.durationSec !== undefined) {
                update['duration_sec'] = generated.durationSec;
              }
              const { error } = await db
                .from('visual_assets')
                .update(update)
                .eq('id', assetId);
              if (error) {
                throw new Error(`finalize_row_failed:${slot}: ${error.message}`);
              }
            });

            // ---- e. log-spend ----
            await step.run(`log-spend-${slot}`, async () => {
              const db = getAdminClient();
              const { error } = await db.from('usage_records').insert({
                user_id: userId,
                service: provider, // 'luma' | 'gemini'
                units: 1,
                cost_usd: generated.costUsd,
                metadata: {
                  asset_id: assetId,
                  video_id: videoId,
                  slot,
                },
              });
              if (error) {
                // Don't fail the slot just because logging failed — log + continue.
                console.error(
                  '[generate-visual-assets] log-spend insert failed',
                  slot,
                  error.message,
                );
              }
            });
          }
        }

        // ---- g. link ----
        await step.run(`link-${slot}`, async () => {
          const db = getAdminClient();
          const { error } = await db.from('video_assets_used').insert({
            video_id: videoId,
            user_id: userId,
            asset_id: assetId,
            category: slot,
          });
          // 23505 = unique_violation (idempotent on retry; ON CONFLICT DO NOTHING semantics)
          if (error && error.code !== '23505') {
            throw new Error(`link_failed:${slot}: ${error.message}`);
          }
        });

        return assetId;
      } catch (slotErr) {
        const reason = slotErr instanceof Error ? slotErr.message : String(slotErr);
        console.log({
          fn: 'generate-visual-assets',
          step: 'slot-failed',
          videoId,
          slot,
          reason,
        });

        // Best-effort: mark the row as failed so monitoring catches it.
        try {
          const db = getAdminClient();
          await db
            .from('visual_assets')
            .update({ status: 'failed', error: reason })
            .eq('project_id', projectId)
            .eq('prompt_hash', promptHash);
        } catch (markErr) {
          console.error('[generate-visual-assets] mark-failed update threw', markErr);
        }

        // Emit observability signal — best-effort.
        try {
          await inngest.send({
            name: 'virus/assets.failed',
            data: { videoId, slot, reason },
          });
        } catch (sendErr) {
          console.error('[generate-visual-assets] emit assets.failed failed', sendErr);
        }

        return null;
      }
    };

    // Run all 3 slots concurrently. Each slot's failure is isolated.
    const slotResults = await Promise.all(built.slotData.map((s) => runSlot(s)));

    // Map results back to slot names. We rely on `built.slotData` order being
    // the same as `SLOTS` (which it is — Promise.all preserves order).
    const resultBySlot: Record<AssetCategory, string | null> = {
      hook: null,
      reveal: null,
      cta: null,
    };
    built.slotData.forEach((plan, idx) => {
      resultBySlot[plan.slot] = slotResults[idx] ?? null;
    });

    const assetIds: AssetIdsBySlot = {
      hook: resultBySlot.hook,
      reveal: resultBySlot.reveal,
      cta: resultBySlot.cta,
    };

    // ------------------------------------------------------------------
    // 5. update-video-metadata (best-effort)
    //
    // The `videos` table doesn't currently have a `metadata` column in this
    // repo. We attempt the update and treat any error as a no-op so the
    // downstream pipeline isn't blocked. The canonical record of which
    // assets a video used lives in `video_assets_used` (link table).
    // ------------------------------------------------------------------
    await step.run('update-video-metadata', async () => {
      try {
        const db = getAdminClient();
        const { error } = await db
          .from('videos')
          .update({ metadata: { assets: assetIds } } as unknown as Record<string, unknown>)
          .eq('id', videoId);
        if (error) {
          console.log({
            fn: 'generate-visual-assets',
            step: 'update-video-metadata:skipped',
            videoId,
            reason: error.message,
          });
        }
      } catch (err) {
        console.log({
          fn: 'generate-visual-assets',
          step: 'update-video-metadata:threw',
          videoId,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ------------------------------------------------------------------
    // 6. log-event
    // ------------------------------------------------------------------
    await step.run('log-event', () =>
      logJobEvent(videoId, 'generate-visual-assets', 'completed', {
        assetIds,
      }),
    );

    // ------------------------------------------------------------------
    // 7. ALWAYS emit virus/assets.generated
    // ------------------------------------------------------------------
    await step.sendEvent('emit-assets-generated', {
      name: 'virus/assets.generated',
      data: { videoId, assetIds },
    });

    console.log({
      fn: 'generate-visual-assets',
      step: 'done',
      videoId,
      assetIds,
    });

    return { ok: true, videoId, assetIds };
  },
);

// Re-exports for tests
export { parseAssetChoices };
export type { AssetIdsBySlot, ProjectRow, BrandRow, IdeaRow };

// Re-export VisualAssetRow so tests can import the row shape from this module.
export type { VisualAssetRow };
