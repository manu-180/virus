/**
 * generate-carousel-caption — Inngest function for the carousel generation pipeline.
 *
 * Trigger: `virus/carousel.caption.requested`
 * Payload: { carouselId: string; userId: string }
 *
 * Flow:
 *  1. load: fetches carousel_projects (brief) + carousel_slides (headline + body) + project_brand.
 *  2. gen-variants: calls Claude 3 times in parallel (Promise.all inside step) with
 *     hook-pas-cta / hook-aida / contrarian frameworks. Each returns JSON { text, hashtags }.
 *     Validated with Zod. If one fails, the others are kept — 2 variants are still useful.
 *  3. persist: inserts 3 rows into carousel_captions (variant_idx 0..2, selected=false).
 *     Throws if ALL variants failed.
 *  4. mark-ready: updates carousel_projects.status='ready'.
 *  5. sendEvent: emits virus/carousel.completed.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { callClaude, MODELS } from '@virus/shared/ai';
import {
  buildCaptionPrompt,
  buildCaptionSystemPrompt,
  CaptionResponseSchema,
} from '@virus/shared/carousel';
import type { CarouselBrief, SlideSpec, CaptionVariant } from '@virus/shared/carousel';
import type { ProjectBrand } from '@virus/shared/viral';

// ---------------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------------

interface CarouselProjectRow {
  id: string;
  project_id: string;
  brief: string;
}

interface CarouselSlideRow {
  idx: number;
  overlay_text: string | null;
  prompt: string;
}

interface ProjectBrandRow {
  brand_name: unknown;
  one_liner: unknown;
  voice_tone: unknown;
  ctas: unknown;
  do_not_say: unknown;
  audience: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBrand(projectId: string, row: ProjectBrandRow): ProjectBrand {
  return {
    projectId,
    brandName: (row.brand_name as string) ?? '',
    oneLiner: (row.one_liner as string) ?? '',
    voiceTone: (row.voice_tone as string) ?? 'conversacional',
    ctas: (row.ctas as ProjectBrand['ctas']) ?? [],
    doNotSay: (row.do_not_say as string[]) ?? [],
    audience: (row.audience as ProjectBrand['audience']) ?? { who: '', where: '', pains: [] },
    valueProps: [],
    features: [],
    caseStudies: [],
    parsedAt: new Date().toISOString(),
  };
}

function parseBrief(row: CarouselProjectRow): CarouselBrief {
  const parsed = JSON.parse(row.brief) as Partial<CarouselBrief>;
  return {
    topic: parsed.topic ?? '',
    angle: parsed.angle ?? 'educational',
    tone: parsed.tone ?? 'direct',
    audience: parsed.audience ?? '',
    slideCount: parsed.slideCount ?? 8,
    stylePreset: (parsed.stylePreset ?? 'bold') as CarouselBrief['stylePreset'],
    language: parsed.language ?? 'es',
    cta: parsed.cta ?? '',
  };
}

function slideRowToSpec(row: CarouselSlideRow): SlideSpec {
  if (row.overlay_text) {
    try {
      return JSON.parse(row.overlay_text) as SlideSpec;
    } catch {
      // fall through
    }
  }
  return { idx: row.idx, role: 'insight', headline: '', visualPrompt: row.prompt };
}

// Strip markdown that IG won't render
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[-*•]\s+/gm, '')
    .trim();
}

function cleanCaption(text: string): string {
  const stripped = stripMarkdown(text);
  if (stripped.length > 300) {
    console.warn(`[carousel-caption] caption too long (${stripped.length} chars), truncating`);
    return stripped.slice(0, 297) + '...';
  }
  return stripped;
}

// Map runtime framework keys → DB CHECK constraint values
const FRAMEWORK_TO_DB: Record<CaptionVariant['framework'], string> = {
  'hook-pas-cta': 'pas',
  'hook-aida': 'aida',
  contrarian: 'hook_story_cta',
};

const FRAMEWORKS: CaptionVariant['framework'][] = ['hook-pas-cta', 'hook-aida', 'contrarian'];

// ---------------------------------------------------------------------------
// Per-variant Claude call
// ---------------------------------------------------------------------------

interface VariantResult {
  framework: CaptionVariant['framework'];
  text: string | null;
  hashtags: string[] | null;
  error: string | null;
}

async function generateVariant(
  brief: CarouselBrief,
  slides: SlideSpec[],
  brand: ProjectBrand,
  framework: CaptionVariant['framework'],
): Promise<VariantResult> {
  try {
    const result = await callClaude({
      model: MODELS.default,
      system: buildCaptionSystemPrompt(brand),
      messages: [{ role: 'user', content: buildCaptionPrompt(brief, slides, brand, framework) }],
      maxTokens: 512,
    });

    if (!result.text) {
      throw new Error('empty response from Claude');
    }

    const jsonText = result.text.trim();
    // Strip markdown code fences if Claude wrapped the JSON
    const clean = jsonText.startsWith('```')
      ? jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      : jsonText;

    const parsed = JSON.parse(clean) as unknown;
    const validated = CaptionResponseSchema.parse(parsed);

    return {
      framework,
      text: cleanCaption(validated.text),
      hashtags: validated.hashtags,
      error: null,
    };
  } catch (err) {
    console.warn(
      JSON.stringify({ fn: 'generate-carousel-caption', step: 'gen-variant', framework, error: String(err) }),
    );
    return { framework, text: null, hashtags: null, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const generateCarouselCaption = inngest.createFunction(
  {
    id: 'generate-carousel-caption',
    retries: 2,
    concurrency: { limit: 5 },
    onFailure: async ({ event, error }) => {
      const original = (
        event as unknown as { data: { event: { data: { carouselId?: string } } } }
      ).data.event;
      const carouselId = original?.data?.carouselId;

      console.log(JSON.stringify({
        fn: 'generate-carousel-caption',
        step: 'onFailure',
        carouselId,
        error: error?.message,
      }));

      if (!carouselId) return;
      const db = getAdminClient();

      try {
        await db
          .from('carousel_projects')
          .update({ status: 'failed', error: error?.message ?? 'unknown_error' })
          .eq('id', carouselId);
      } catch (err) {
        console.error('[generate-carousel-caption] onFailure update failed', err);
      }
    },
  },
  { event: 'virus/carousel.caption.requested' },
  async ({ event, step }) => {
    const { carouselId, userId } = event.data;

    console.log(JSON.stringify({ fn: 'generate-carousel-caption', step: 'start', carouselId, userId }));

    // ------------------------------------------------------------------
    // 1. Load carousel + slides + brand
    // ------------------------------------------------------------------
    const { brief, slides, brand } = await step.run('load', async () => {
      const db = getAdminClient();

      const { data: carouselRow, error: carouselErr } = await db
        .from('carousel_projects')
        .select('id, project_id, brief')
        .eq('id', carouselId)
        .single();

      if (carouselErr || !carouselRow) {
        throw new Error(`carousel_not_found:${carouselId} — ${carouselErr?.message ?? 'no data'}`);
      }

      const carousel = carouselRow as CarouselProjectRow;

      const { data: slideRows, error: slidesErr } = await db
        .from('carousel_slides')
        .select('idx, overlay_text, prompt')
        .eq('carousel_id', carouselId)
        .order('idx');

      if (slidesErr || !slideRows) {
        throw new Error(`slides_not_found:${carouselId} — ${slidesErr?.message ?? 'no data'}`);
      }

      const { data: brandRow, error: brandErr } = await db
        .from('project_brand')
        .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience')
        .eq('project_id', carousel.project_id)
        .eq('is_current', true)
        .single();

      if (brandErr || !brandRow) {
        throw new Error(`brand_not_found:${carousel.project_id} — ${brandErr?.message ?? 'no data'}`);
      }

      console.log(JSON.stringify({
        fn: 'generate-carousel-caption',
        step: 'load',
        carouselId,
        slideCount: slideRows.length,
      }));

      return {
        brief: parseBrief(carousel),
        slides: (slideRows as CarouselSlideRow[]).map(slideRowToSpec),
        brand: buildBrand(carousel.project_id, brandRow as ProjectBrandRow),
      };
    });

    // ------------------------------------------------------------------
    // 2. Generate 3 variants in parallel (one Claude call per framework)
    // ------------------------------------------------------------------
    const variants: VariantResult[] = await step.run('gen-variants', async () => {
      const results = await Promise.all(
        FRAMEWORKS.map((fw) => generateVariant(brief, slides, brand, fw)),
      );

      // Claude Sonnet 4.6: ~$3/Mtok input, ~$15/Mtok output
      const COST_PER_VARIANT_USD = (600 / 1_000_000) * 3.0 + (200 / 1_000_000) * 15.0;
      const UNITS_PER_VARIANT = 800; // 600 input + 200 output tokens

      const db = getAdminClient();
      await Promise.allSettled(
        results
          .filter((r) => r.text !== null)
          .map((r) =>
            db.from('usage_records').insert({
              user_id: userId,
              service: 'anthropic',
              cost_usd: COST_PER_VARIANT_USD,
              units: UNITS_PER_VARIANT,
              metadata: { carouselId, operation: 'gen-caption', framework: r.framework },
            }),
          ),
      );

      console.log(JSON.stringify({
        fn: 'generate-carousel-caption',
        step: 'gen-variants',
        carouselId,
        succeeded: results.filter((r) => r.text !== null).length,
        failed: results.filter((r) => r.text === null).length,
      }));

      return results;
    });

    const succeeded = variants.filter((v) => v.text !== null);
    if (succeeded.length === 0) {
      throw new Error(`all_caption_variants_failed:${carouselId}`);
    }

    // ------------------------------------------------------------------
    // 3. Persist caption rows (one per variant_idx 0..2)
    // ------------------------------------------------------------------
    await step.run('persist', async () => {
      const db = getAdminClient();

      const rows = variants
        .map((v, idx) => {
          if (v.text === null) return null;
          return {
            carousel_id: carouselId,
            user_id: userId,
            variant_idx: idx,
            text: v.hashtags && v.hashtags.length > 0
              ? `${v.text}\n\n${v.hashtags.map((h) => `#${h}`).join(' ')}`
              : v.text,
            framework: FRAMEWORK_TO_DB[v.framework],
            selected: false,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const { error } = await db.from('carousel_captions').insert(rows);

      if (error) {
        throw new Error(`persist_captions_failed:${carouselId} — ${error.message}`);
      }

      console.log(JSON.stringify({
        fn: 'generate-carousel-caption',
        step: 'persist',
        carouselId,
        inserted: rows.length,
      }));
    });

    // ------------------------------------------------------------------
    // 4. Mark carousel as ready
    // ------------------------------------------------------------------
    await step.run('mark-ready', async () => {
      const db = getAdminClient();
      const { error } = await db
        .from('carousel_projects')
        .update({ status: 'ready' })
        .eq('id', carouselId);

      if (error) {
        throw new Error(`mark_ready_failed:${carouselId} — ${error.message}`);
      }

      console.log(JSON.stringify({
        fn: 'generate-carousel-caption',
        step: 'mark-ready',
        carouselId,
        status: 'ready',
      }));
    });

    // ------------------------------------------------------------------
    // 4b. Auto-publish hook
    //
    // If the carousel was created by the auto-publish-scheduler it has
    // `auto_publish_ig_account_id` set. We open the IG publish pipeline
    // here exactly as POST /api/carousels/[id]/publish-ig would:
    //   - pick caption (selected or variant 0)
    //   - insert ig_publications (status='queued')
    //   - emit virus/carousel.publish.requested
    //
    // Idempotent: if a publication for (carousel, account) is already in
    // queued/publishing/published state, we skip silently. This protects
    // against double-runs of this step (Inngest retries).
    // ------------------------------------------------------------------
    await step.run('auto-publish-if-marked', async () => {
      const db = getAdminClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error: rowErr } = await (db as any)
        .from('carousel_projects')
        .select('auto_publish_ig_account_id')
        .eq('id', carouselId)
        .single();

      if (rowErr || !row) {
        console.warn(JSON.stringify({
          fn: 'generate-carousel-caption',
          step: 'auto-publish-if-marked',
          carouselId,
          skipped: 'project_lookup_failed',
          error: rowErr?.message,
        }));
        return;
      }

      const igAccountId = (row as { auto_publish_ig_account_id: string | null })
        .auto_publish_ig_account_id;
      if (!igAccountId) {
        // Manual flow — nothing to do.
        return;
      }

      // Account sanity check: don't auto-publish to a soft-deleted or non-
      // active account. The scheduler enforces this too, but the account
      // could have been disabled between dispatch and now (the pipeline can
      // take a few minutes).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: acct } = await (db as any)
        .from('ig_accounts')
        .select('id, status, deleted_at')
        .eq('id', igAccountId)
        .single();

      if (!acct || (acct as { deleted_at: string | null }).deleted_at) {
        console.warn(JSON.stringify({
          fn: 'generate-carousel-caption',
          step: 'auto-publish-if-marked',
          carouselId,
          igAccountId,
          skipped: 'account_deleted',
        }));
        return;
      }
      if ((acct as { status: string }).status !== 'active') {
        console.warn(JSON.stringify({
          fn: 'generate-carousel-caption',
          step: 'auto-publish-if-marked',
          carouselId,
          igAccountId,
          skipped: `account_${(acct as { status: string }).status}`,
        }));
        return;
      }

      // Idempotency: skip if ANY publication for this (carousel, account)
      // exists, regardless of status. A previously-failed publication should
      // be retried by the user manually from the UI (POST /publish-ig
      // re-uses the same flow). Re-creating it from this hook would race
      // against an in-flight Inngest retry of publish-carousel-to-instagram
      // and could double-publish.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (db as any)
        .from('ig_publications')
        .select('id, status')
        .eq('carousel_id', carouselId)
        .eq('ig_account_id', igAccountId)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(JSON.stringify({
          fn: 'generate-carousel-caption',
          step: 'auto-publish-if-marked',
          carouselId,
          igAccountId,
          skipped: 'publication_exists',
          publicationId: existing[0].id,
          existingStatus: existing[0].status,
        }));
        return;
      }

      // Resolve caption: selected variant if any, else variant_idx 0.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: capRows } = await (db as any)
        .from('carousel_captions')
        .select('text, variant_idx, selected')
        .eq('carousel_id', carouselId)
        .order('variant_idx', { ascending: true });

      const captions = (capRows ?? []) as { text: string; variant_idx: number; selected: boolean }[];
      const caption = captions.find((c) => c.selected)?.text ?? captions[0]?.text ?? null;
      if (!caption) {
        console.warn(JSON.stringify({
          fn: 'generate-carousel-caption',
          step: 'auto-publish-if-marked',
          carouselId,
          igAccountId,
          skipped: 'no_caption',
        }));
        return;
      }

      // Insert publication
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: publication, error: insErr } = await (db as any)
        .from('ig_publications')
        .insert({
          carousel_id: carouselId,
          ig_account_id: igAccountId,
          user_id: userId,
          caption,
          first_comment: null,
          status: 'queued',
        })
        .select('id')
        .single();

      if (insErr || !publication) {
        console.error(JSON.stringify({
          fn: 'generate-carousel-caption',
          step: 'auto-publish-if-marked',
          carouselId,
          igAccountId,
          error: insErr?.message ?? 'insert_failed',
        }));
        return;
      }

      // Dispatch publish event
      try {
        await inngest.send({
          name: 'virus/carousel.publish.requested',
          data: {
            publicationId: publication.id,
            carouselId,
            igAccountId,
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        });
      } catch (sendErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('ig_publications')
          .update({
            status: 'failed',
            error: { code: 'dispatch_failed', message: 'Could not enqueue publish event.' },
          })
          .eq('id', publication.id);

        console.error(JSON.stringify({
          fn: 'generate-carousel-caption',
          step: 'auto-publish-if-marked',
          carouselId,
          igAccountId,
          publicationId: publication.id,
          error: sendErr instanceof Error ? sendErr.message : String(sendErr),
        }));
        return;
      }

      console.log(JSON.stringify({
        fn: 'generate-carousel-caption',
        step: 'auto-publish-if-marked',
        carouselId,
        igAccountId,
        publicationId: publication.id,
        ok: true,
      }));
    });

    // ------------------------------------------------------------------
    // 5. Emit completion event
    // ------------------------------------------------------------------
    await step.sendEvent('emit-carousel-completed', {
      name: 'virus/carousel.completed',
      data: { carouselId, userId, captionCount: succeeded.length },
    });

    console.log(JSON.stringify({ fn: 'generate-carousel-caption', step: 'done', carouselId }));

    return { ok: true, carouselId, captionCount: succeeded.length };
  },
);
