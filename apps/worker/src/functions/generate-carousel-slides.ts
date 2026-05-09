/**
 * generate-carousel-slides — Inngest function for the carousel generation pipeline.
 *
 * Trigger: `virus/carousel.slides.requested`
 * Payload: { carouselId: string; userId: string }
 *
 * Flow:
 *  1. load-context: fetches carousel_projects (brief, style_preset) + pending slides
 *     + project_brand.
 *  2. generate-all-images: calls generateAllSlideImages (pLimit 3). As each slide
 *     succeeds the onSlideDone callback updates carousel_slides in DB and logs cost
 *     to usage_records. Failed slides are marked status='failed' — the carousel is
 *     NOT failed so Tanda 13 can regenerate individual slides.
 *  3. persist-failures: marks failed slides in DB (if any).
 *  4. Decision branch:
 *     - zero succeeded → update carousel status='failed', emit virus/carousel.failed.
 *     - ≥1 succeeded  → update status='composing', emit per-slide virus/carousel.slide.generated,
 *                        then emit virus/carousel.slides.composed.requested.
 *
 * Logs costCents per slide so Tanda 18 can aggregate to usage_records.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { generateAllSlideImages, type SlideSuccess } from '@virus/shared/carousel';
import type { CarouselBrief, SlideSpec } from '@virus/shared/carousel';
import type { ProjectBrand } from '@virus/shared/viral';

// ---------------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------------

interface CarouselProjectRow {
  id: string;
  project_id: string;
  user_id: string;
  brief: string;
  slide_count: number;
  style_preset: string;
}

interface CarouselSlideRow {
  id: string;
  idx: number;
  prompt: string;
  overlay_text: string | null;
  status: string;
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
    slideCount: parsed.slideCount ?? row.slide_count,
    stylePreset: (parsed.stylePreset ?? row.style_preset) as CarouselBrief['stylePreset'],
    language: parsed.language ?? 'es',
    cta: parsed.cta ?? '',
  };
}

function slideRowToSpec(row: CarouselSlideRow): SlideSpec {
  if (row.overlay_text) {
    try {
      return JSON.parse(row.overlay_text) as SlideSpec;
    } catch {
      // fall through to minimal spec
    }
  }
  return { idx: row.idx, role: 'insight', headline: '', visualPrompt: row.prompt };
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const generateCarouselSlides = inngest.createFunction(
  {
    id: 'generate-carousel-slides',
    retries: 2,
    concurrency: { limit: 3 },
    onFailure: async ({ event, error }) => {
      const original = (
        event as unknown as { data: { event: { data: { carouselId?: string } } } }
      ).data.event;
      const carouselId = original?.data?.carouselId;

      console.log(JSON.stringify({
        fn: 'generate-carousel-slides',
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
        console.error('[generate-carousel-slides] onFailure update failed', err);
      }
    },
  },
  { event: 'virus/carousel.slides.requested' },
  async ({ event, step }) => {
    const { carouselId, userId } = event.data;

    console.log(JSON.stringify({ fn: 'generate-carousel-slides', step: 'start', carouselId, userId }));

    // ------------------------------------------------------------------
    // 1. Load context
    // ------------------------------------------------------------------
    const { brief, brand, slideRows } = await step.run('load-context', async () => {
      const db = getAdminClient();

      const { data: carouselRow, error: carouselErr } = await db
        .from('carousel_projects')
        .select('id, project_id, user_id, brief, slide_count, style_preset')
        .eq('id', carouselId)
        .single();

      if (carouselErr || !carouselRow) {
        throw new Error(`carousel_not_found:${carouselId} — ${carouselErr?.message ?? 'no data'}`);
      }

      const row = carouselRow as CarouselProjectRow;

      const { data: slides, error: slidesErr } = await db
        .from('carousel_slides')
        .select('id, idx, prompt, overlay_text, status')
        .eq('carousel_id', carouselId)
        .order('idx');

      if (slidesErr || !slides) {
        throw new Error(`slides_not_found:${carouselId} — ${slidesErr?.message ?? 'no data'}`);
      }

      const { data: brandRow, error: brandErr } = await db
        .from('project_brand')
        .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience')
        .eq('project_id', row.project_id)
        .eq('is_current', true)
        .single();

      if (brandErr || !brandRow) {
        throw new Error(`brand_not_found:${row.project_id} — ${brandErr?.message ?? 'no data'}`);
      }

      console.log(JSON.stringify({
        fn: 'generate-carousel-slides',
        step: 'load-context',
        carouselId,
        slideCount: slides.length,
      }));

      return {
        brief: parseBrief(row),
        brand: buildBrand(row.project_id, brandRow as ProjectBrandRow),
        slideRows: slides as CarouselSlideRow[],
      };
    });

    const slideSpecs = slideRows.map(slideRowToSpec);

    // ------------------------------------------------------------------
    // 2. Generate all slide images (concurrency controlled by pLimit inside lib)
    // ------------------------------------------------------------------
    const batchResult = await step.run('generate-all-images', async () => {
      const db = getAdminClient();

      const result = await generateAllSlideImages({
        brief,
        slides: slideSpecs,
        brand,
        userId,
        carouselId,
        supabase: db,
        onSlideDone: async (idx, success) => {
          // Update DB inline — upsert is idempotent on retry
          const { error: updateErr } = await db
            .from('carousel_slides')
            .update({
              image_path: success.path,
              status: 'ready',
              error: null,
            })
            .eq('carousel_id', carouselId)
            .eq('idx', idx);

          if (updateErr) {
            console.error(JSON.stringify({
              fn: 'generate-carousel-slides',
              step: 'onSlideDone',
              carouselId, idx, error: updateErr.message,
            }));
          }

          // Log cost for Tanda 18 aggregation
          try {
            await db.from('usage_records').insert({
              user_id: userId,
              service: 'gemini',
              cost_usd: success.costCents / 100,
              units: 1,
              metadata: JSON.stringify({ carouselId, idx, model: 'gemini-carousel-slide' }),
            });
          } catch {
            // Non-fatal: cost logging failure should not abort generation
          }

          console.log(JSON.stringify({
            fn: 'generate-carousel-slides',
            step: `gen-${idx}`,
            carouselId,
            idx,
            path: success.path,
            bytes: success.bytes,
            costCents: success.costCents,
            ms: Date.now(),
          }));
        },
      });

      console.log(JSON.stringify({
        fn: 'generate-carousel-slides',
        step: 'generate-all-images',
        carouselId,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      }));

      return result;
    });

    // ------------------------------------------------------------------
    // 3. Persist failures (slides that errored in the batch)
    // ------------------------------------------------------------------
    if (batchResult.failed.length > 0) {
      await step.run('persist-failures', async () => {
        const db = getAdminClient();
        await Promise.all(
          batchResult.failed.map(({ idx, error }) =>
            db
              .from('carousel_slides')
              .update({
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
              })
              .eq('carousel_id', carouselId)
              .eq('idx', idx),
          ),
        );
        console.log(JSON.stringify({
          fn: 'generate-carousel-slides',
          step: 'persist-failures',
          carouselId,
          failedIdxs: batchResult.failed.map((f) => f.idx),
        }));
      });
    }

    // ------------------------------------------------------------------
    // 4. Branch: nothing succeeded → fail the carousel
    // ------------------------------------------------------------------
    if (batchResult.succeeded.length === 0) {
      await step.run('mark-failed', async () => {
        const db = getAdminClient();
        await db
          .from('carousel_projects')
          .update({ status: 'failed', error: 'all_slides_failed' })
          .eq('id', carouselId);
      });

      await step.sendEvent('emit-carousel-failed', {
        name: 'virus/carousel.failed',
        data: { carouselId, step: 'generate-all-images', error: 'all_slides_failed' },
      });

      console.log(JSON.stringify({
        fn: 'generate-carousel-slides',
        step: 'done',
        carouselId,
        outcome: 'failed',
      }));

      return { ok: false, carouselId, succeeded: 0, failed: batchResult.failed.length };
    }

    // ------------------------------------------------------------------
    // 5. At least one slide succeeded — proceed to compose
    // ------------------------------------------------------------------
    await step.run('mark-composing', async () => {
      const db = getAdminClient();
      const { error } = await db
        .from('carousel_projects')
        .update({ status: 'composing' })
        .eq('id', carouselId);
      if (error) throw new Error(`mark_composing_failed:${carouselId} — ${error.message}`);
    });

    // Emit per-slide event for each succeeded slide
    const succeededIdxs = batchResult.succeeded.map((s: SlideSuccess) => s.idx);
    for (const { idx } of batchResult.succeeded) {
      await step.sendEvent(`emit-slide-${idx}`, {
        name: 'virus/carousel.slide.generated',
        data: { carouselId, idx, userId },
      });
    }

    await step.sendEvent('emit-compose-requested', {
      name: 'virus/carousel.slides.composed.requested',
      data: { carouselId, userId, succeededIdxs },
    });

    console.log(JSON.stringify({
      fn: 'generate-carousel-slides',
      step: 'done',
      carouselId,
      outcome: 'composing',
      succeeded: batchResult.succeeded.length,
      failed: batchResult.failed.length,
    }));

    return {
      ok: true,
      carouselId,
      succeeded: batchResult.succeeded.length,
      failed: batchResult.failed.length,
    };
  },
);
