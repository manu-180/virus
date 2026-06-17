/// <reference types="node" />
/**
 * Vidriera-Video orchestrator (FASE HORNO C4) — the weekly cron that turns the
 * next built demo into a Reel + Story on @apex.stack, 100% automatically.
 *
 * Trigger: Saturday 08:00 ART cron, plus a manual `vidriera/run.requested` event
 * (with optional `{ dryRun: true }` to build + check WITHOUT publishing).
 *
 * Flow (mirrors the spike drivers — see libre_albedrio/tools/vidriera-video.md §9):
 *   1. select-demo   — FIFO: oldest built demo with a live URL, not promoted.
 *   2. colchón       — empty queue → log + alert, publish NOTHING (no repeats).
 *   3. produce       — VO script + caption (Claude) → TTS (AR voice) → record
 *      scroll (duration-anchored to VO+tail) → editor_machine (trim + karaoke
 *      cyan subs) → outro xfade → fail-safes → publish Reel + Story → mark.
 *
 * Why one big "produce" step: Inngest replays a function across HTTP requests and
 * may run separate step.run() calls in different processes — so local files can't
 * be passed between steps. The whole media chain therefore runs in ONE step (one
 * process) and the function is retries:0 + concurrency:1, because an Instagram
 * publish is not idempotent (can't be un-published) and re-recording on retry
 * would be wasteful. A failed run records demos.promo_error and alerts; the demo
 * stays queued for a manual re-invoke or next Saturday.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import {
  libreAlbedrioClient,
  selectNextDemo,
  markDemoPromoted,
  markDemoError,
  logActivity,
} from '../lib/libre-albedrio.js';
import { generateVoScript, generateCaption } from '../lib/vidriera-copy.js';
import { evaluateFailSafes } from '../lib/vidriera-checks.js';
import { recordDemoScroll, probeDurationSec, probeHasAudioStream } from '../lib/recorder.js';
import { submitEditorJobExactSubs } from '../lib/editor-machine.js';
import { composeWithOutro } from '../lib/compose.js';
import { publishReel, publishVideoStory } from '../lib/instagram-graph.js';
import { generateAudioFromScript, VOICE_PRESETS } from '@virus/shared/audio';
import { captureWorkerException } from '../utils/sentry.js';

// @apex.stack — the APEX portfolio IG account (ig_accounts row, graph_api).
const IG_ACCOUNT_ID = '52c60dd6-23e9-4131-aa3f-47adef5c44b3';
// LinkedIn account para publicar el mismo video. Set via env var una vez conectada la cuenta.
// Si no está configurado, el paso de LinkedIn se saltea silenciosamente.
const LI_ACCOUNT_ID = process.env['VIDRIERA_LI_ACCOUNT_ID'] ?? null;
const VIDEOS_BUCKET = 'videos';
// Silent tail after the narration (formato-video-apex): the scroll keeps moving
// ~1.8s in silence; editor_machine trims the narrated part to the VO length.
const TAIL_SEC = 1.8;
// VO tempo: 1.0 = no post speed-up, so the narration breathes (Manuel 2026-06-15:
// "habla muy de corrido"). The shared default is 1.15× — vidriera VOs override it.
const VO_SPEED_MULTIPLIER = 1.0;
// Calm scroll: cap the pan speed so a tall demo page shows its TOP at a calm
// constant speed instead of racing the whole page (same feel as the assistify tour).
const CALM_PX_PER_SEC = 195;
// Saturday 08:00 Argentina time (spec §0.6 cadence: one web/week → one Reel/week).
const CRON = 'TZ=America/Argentina/Buenos_Aires 0 8 * * 6';

interface IgTokenRow {
  access_token: string;
  graph_user_id: string;
  ig_username: string;
}

type ProduceResult =
  | { published: true; demoId: string; demoSlug: string; reelPermalink: string | null; storyPermalink: string | null }
  | { published: false; reason: 'failsafe'; demoId: string; failures: string[] }
  | { published: false; reason: 'dry_run'; demoId: string };

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing from worker env`);
  return v;
}

/** APEX outro asset: env override (local dev) → bundled asset shipped in the image. */
function resolveOutroPath(): string {
  const override = process.env['APEX_OUTRO_PATH'];
  if (override) return override;
  const here = dirname(fileURLToPath(import.meta.url)); // apps/worker/src/functions
  return join(here, '..', '..', 'assets', 'apex-outro.mp4');
}

/** GET the demo URL and return its HTTP status (0 on network failure). */
async function fetchDemoUrlStatus(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * Retry a critical op a few times. Used so that once a Reel is LIVE, marking the
 * demo promoted essentially always lands — otherwise a transient DB blip would
 * leave the demo unmarked and the next run would re-post the same Reel.
 */
async function withRetries<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1500): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

export const vidrieraOrchestrator = inngest.createFunction(
  {
    id: 'vidriera-orchestrator',
    name: 'Vidriera-Video — weekly demo → Reel + Story to @apex.stack',
    // One run at a time; never re-run a non-idempotent publish (see file header).
    concurrency: { limit: 1 },
    retries: 0,
    onFailure: async ({ error }) => {
      console.error({ fn: 'vidriera-orchestrator', step: 'onFailure', error: error?.message });
      captureWorkerException(error, { fn: 'vidriera-orchestrator' });
    },
  },
  [{ cron: CRON }, { event: 'vidriera/run.requested' }],
  async ({ event, step, logger }) => {
    const dryRun = (event as unknown as { data?: { dryRun?: boolean } }).data?.dryRun === true;

    // ── 1. Select the next demo (FIFO, has live URL, not promoted) ──────────
    const demo = await step.run('select-demo', async () => {
      return selectNextDemo(libreAlbedrioClient());
    });

    // ── 2. Colchón: empty queue → publish nothing, alert (never repeat) ─────
    if (!demo) {
      await step.run('colchon-empty-queue', async () => {
        await logActivity(libreAlbedrioClient(), {
          category: 'marketing',
          title: 'Vidriera: sin web nueva para publicar esta semana',
          detail:
            'La fila de demos está vacía (ninguna con url_deploy sin promocionar). ' +
            'No se publicó nada — esperando una web nueva de El Curador/El Horno.',
        });
      });
      logger.info('vidriera.empty_queue');
      return { published: false, reason: 'empty_queue' as const };
    }

    // ── 3. Produce → (unless dryRun) publish → mark, all in ONE process ─────
    const result = await step.run('produce-publish-mark', async (): Promise<ProduceResult> => {
      const la = libreAlbedrioClient();
      const vh = getAdminClient();
      const voiceId = reqEnv('ELEVENLABS_VOICE_ID_AR');
      const url = demo.url_deploy as string;
      // slug is authored on Manuel's PC — sanitise before using it in fs/object paths.
      const safeSlug = demo.slug.replace(/[^a-z0-9-]/gi, '_');
      const workDir = await mkdtemp(join(tmpdir(), `vidriera-${safeSlug}-`));

      try {
        // 3a. Copy: VO script + caption (client-style, never "demo").
        const script = await generateVoScript(demo);
        const caption = await generateCaption(demo);
        logger.info('vidriera.copy_ready', { demo: demo.slug, scriptChars: script.length });

        // 3b. Voice-over (female AR voice → env).
        const audio = await generateAudioFromScript({
          segments: [{ voiceover: script }],
          preset: VOICE_PRESETS['educational']!,
          outputDir: join(workDir, 'vo'),
          voiceId,
          speedMultiplier: VO_SPEED_MULTIPLIER,
        });

        // 3c. Record the scroll, duration-anchored to VO + tail.
        const scrollPath = join(workDir, 'scroll.mp4');
        await recordDemoScroll({
          url,
          outPath: scrollPath,
          durationSec: audio.durationSec + TAIL_SEC,
          maxSpeedPxPerSec: CALM_PX_PER_SEC,
        });

        // 3d. editor_machine: trim to VO + burn karaoke-cyan subtitles.
        const renderPath = join(workDir, 'render.mp4');
        await submitEditorJobExactSubs({
          videoPath: scrollPath,
          audioPath: audio.processedMp3,
          outPath: renderPath,
          subtitleScript: script,
        });

        // 3e. Outro + crossfade → the final reel.
        const finalPath = join(workDir, 'final.mp4');
        await composeWithOutro({ inPath: renderPath, outroPath: resolveOutroPath(), outPath: finalPath });

        // 3f. Fail-safes — gather signals, then evaluate. Any trip → no publish.
        const [demoUrlStatus, renderSec, finalHasAudioTrack] = await Promise.all([
          fetchDemoUrlStatus(url),
          probeDurationSec(renderPath),
          probeHasAudioStream(finalPath), // probe the file we actually publish
        ]);
        const checks = evaluateFailSafes({
          demoUrlStatus,
          renderSec, // render is trimmed to the VO → compare against audio length
          audioSec: audio.durationSec,
          renderHasAudioTrack: finalHasAudioTrack,
          scriptText: script,
          caption,
        });
        if (!checks.ok) {
          await markDemoError(la, demo.id, checks.failures.join('; '));
          await logActivity(la, {
            category: 'infra',
            title: `Vidriera: fail-safe bloqueó la publicación de ${demo.titulo}`,
            detail: checks.failures.join('; '),
          });
          logger.warn('vidriera.failsafe_block', { demo: demo.slug, failures: checks.failures });
          return { published: false, reason: 'failsafe', demoId: demo.id, failures: checks.failures };
        }

        // 3g. dryRun stops here: everything built + checks passed, nothing posted.
        if (dryRun) {
          logger.info('vidriera.dry_run_ok', { demo: demo.slug, renderSec, audioSec: audio.durationSec });
          return { published: false, reason: 'dry_run', demoId: demo.id };
        }

        // 3h. Upload the final reel → 2h signed URL (Meta fetches over HTTPS).
        const finalBytes = await readFile(finalPath);
        const objectPath = `vidriera/${safeSlug}-${Date.now()}.mp4`;
        const up = await vh.storage
          .from(VIDEOS_BUCKET)
          .upload(objectPath, finalBytes, { contentType: 'video/mp4', upsert: true });
        if (up.error) throw new Error(`final upload failed: ${up.error.message}`);
        const signed = await vh.storage.from(VIDEOS_BUCKET).createSignedUrl(objectPath, 2 * 60 * 60);
        if (signed.error || !signed.data?.signedUrl) {
          throw new Error(`sign failed: ${signed.error?.message ?? 'no url'}`);
        }
        const videoUrl = signed.data.signedUrl;

        // 3i. Token for @apex.stack (Vault-backed RPC, never logged).
        const { data: rows, error: rpcErr } = await vh.rpc('ig_account_get_graph_token', {
          p_account_id: IG_ACCOUNT_ID,
        });
        if (rpcErr || !rows || (rows as IgTokenRow[]).length === 0) {
          throw new Error(`token RPC failed: ${rpcErr?.message ?? 'no token row'}`);
        }
        const tokenRow = (rows as IgTokenRow[])[0]!;
        const igUserId = tokenRow.graph_user_id;
        const accessToken = tokenRow.access_token;

        // 3j. Publish the Reel, then mark promoted IMMEDIATELY (with retries). The
        //     Reel is the canonical artifact: once it's live the demo MUST be
        //     marked, or any later failure would re-pick + re-post it next run.
        const reel = await publishReel({ igUserId, accessToken, videoUrl, caption });
        await withRetries(() => markDemoPromoted(la, demo.id, reel.permalink));

        // 3k. Same video as a Story — strictly secondary (ephemeral, 24h). NEVER
        //     let a Story failure fail the run (that would re-post the Reel).
        const story = await publishVideoStory({ igUserId, accessToken, videoUrl }).catch((err) => {
          logger.warn('vidriera.story_failed', {
            demo: demo.slug,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        });

        // 3l. Portfolio activity log (best-effort).
        await logActivity(la, {
          category: 'marketing',
          title: `Vidriera: Reel publicado — ${demo.titulo}`,
          detail:
            `Reel ${reel.permalink ?? reel.mediaId} a @apex.stack` +
            (story ? ` + Story ${story.permalink ?? story.mediaId}.` : ' (la Story falló; se publicó solo el Reel).'),
        });

        // 3m. LinkedIn: si hay cuenta configurada, subir el mismo video en background.
        //     Guardamos el video en una ruta separada para que el publisher LI
        //     lo pueda descargar de forma independiente (puede tardar minutos).
        //     El publisher LI es responsable de borrar `liObjectPath` cuando termina.
        if (LI_ACCOUNT_ID) {
          const liObjectPath = `vidriera-li/${safeSlug}-${Date.now()}.mp4`;
          const liUp = await vh.storage
            .from(VIDEOS_BUCKET)
            .upload(liObjectPath, finalBytes, { contentType: 'video/mp4', upsert: true });
          if (!liUp.error) {
            await inngest.send({
              name: 'vidriera/linkedin.publish.requested',
              data: {
                demoId:        demo.id,
                demoSlug:      demo.slug,
                storagePath:   liObjectPath,
                caption,
                title:         demo.titulo,
                liAccountId:   LI_ACCOUNT_ID,
                reelPermalink: reel.permalink,
              },
            }).catch((err: unknown) => {
              logger.warn('vidriera.linkedin_event_failed', { error: String(err) });
            });
          } else {
            logger.warn('vidriera.linkedin_upload_failed', { error: liUp.error.message });
          }
        }

        // 3n. Best-effort cleanup del video de IG (Meta mantiene su copia).
        await vh.storage.from(VIDEOS_BUCKET).remove([objectPath]).catch(() => {});

        logger.info('vidriera.published', { demo: demo.slug, reel: reel.permalink, story: story?.permalink ?? null });
        return {
          published: true,
          demoId: demo.id,
          demoSlug: demo.slug,
          reelPermalink: reel.permalink,
          storyPermalink: story?.permalink ?? null,
        };
      } catch (err) {
        // Genuine pipeline error (Claude/engine/network). Record + alert; leave
        // promoted_at untouched so the demo stays queued for a manual re-invoke.
        const message = err instanceof Error ? err.message : String(err);
        await markDemoError(la, demo.id, message).catch(() => {});
        await logActivity(la, {
          category: 'infra',
          title: `Vidriera: error produciendo el Reel de ${demo.titulo}`,
          detail: message,
        }).catch(() => {});
        throw err;
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    return result;
  },
);
