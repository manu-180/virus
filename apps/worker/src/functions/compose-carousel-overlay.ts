/**
 * compose-carousel-overlay — Inngest function for the carousel generation pipeline.
 *
 * Trigger: `virus/carousel.slides.composed.requested`
 * Payload: { carouselId: string; userId: string; succeededIdxs: number[] }
 *
 * Flow:
 *  1. load-slides: fetches carousel_slides where image_path IS NOT NULL and
 *     reconstructs SlideSpec from the overlay_text JSON stored by generate-carousel-plan.
 *  2. compose-all: calls composeAllSlides (pLimit 3). Each slide downloads its base
 *     PNG, composites text via Satori+Sharp, and uploads composed-{idx}.png.
 *     Individual failures don't abort the batch; failed slides are marked in DB.
 *  3. persist-compose-results: updates composed_path for succeeded slides.
 *  4. emit-caption-requested: sends virus/carousel.caption.requested for Tanda 9.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { composeAllSlides, STYLE_PRESETS } from '@virus/shared/carousel';
import type { SlideSpec } from '@virus/shared/carousel';
import type { StylePreset } from '@virus/shared/carousel';

// ---------------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------------

interface CarouselProjectRow {
  style_preset: string;
}

interface CarouselSlideRow {
  id: string;
  idx: number;
  image_path: string;
  overlay_text: string | null;
  prompt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function resolvePreset(presetName: string): StylePreset {
  const key = presetName as keyof typeof STYLE_PRESETS;
  return STYLE_PRESETS[key] ?? STYLE_PRESETS.bold;
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const composeCarouselOverlay = inngest.createFunction(
  {
    id: 'compose-carousel-overlay',
    retries: 2,
    concurrency: { limit: 3 },
    onFailure: async ({ event, error }) => {
      const original = (
        event as unknown as { data: { event: { data: { carouselId?: string } } } }
      ).data.event;
      const carouselId = original?.data?.carouselId;

      console.log(JSON.stringify({
        fn: 'compose-carousel-overlay',
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
        console.error('[compose-carousel-overlay] onFailure update failed', err);
      }
    },
  },
  { event: 'virus/carousel.slides.composed.requested' },
  async ({ event, step }) => {
    const { carouselId, userId } = event.data;

    console.log(JSON.stringify({ fn: 'compose-carousel-overlay', step: 'start', carouselId, userId }));

    // ------------------------------------------------------------------
    // 1. Load slides that have a base image
    // ------------------------------------------------------------------
    const { slides, preset } = await step.run('load-slides', async () => {
      const db = getAdminClient();

      const { data: carouselRow, error: carouselErr } = await db
        .from('carousel_projects')
        .select('style_preset')
        .eq('id', carouselId)
        .single();

      if (carouselErr || !carouselRow) {
        throw new Error(`carousel_not_found:${carouselId} — ${carouselErr?.message ?? 'no data'}`);
      }

      const { style_preset } = carouselRow as CarouselProjectRow;

      const { data: slideRows, error: slidesErr } = await db
        .from('carousel_slides')
        .select('id, idx, image_path, overlay_text, prompt')
        .eq('carousel_id', carouselId)
        .not('image_path', 'is', null)
        .order('idx');

      if (slidesErr || !slideRows) {
        throw new Error(`slides_not_found:${carouselId} — ${slidesErr?.message ?? 'no data'}`);
      }

      const rows = slideRows as CarouselSlideRow[];

      console.log(JSON.stringify({
        fn: 'compose-carousel-overlay',
        step: 'load-slides',
        carouselId,
        slideCount: rows.length,
        preset: style_preset,
      }));

      return {
        slides: rows,
        preset: resolvePreset(style_preset),
      };
    });

    if (slides.length === 0) {
      throw new Error(`compose_no_slides:${carouselId} — no slides with image_path found`);
    }

    // ------------------------------------------------------------------
    // 2. Compose all slides with Satori+Sharp
    // ------------------------------------------------------------------
    const composeResult = await step.run('compose-all', async () => {
      const db = getAdminClient();

      const slidesToCompose = slides.map((row) => ({
        idx: row.idx,
        spec: slideRowToSpec(row),
        baseImagePath: row.image_path,
      }));

      const result = await composeAllSlides({
        slides: slidesToCompose,
        preset,
        userId,
        carouselId,
        supabase: db,
        onSlideDone: async (idx, success) => {
          console.log(JSON.stringify({
            fn: 'compose-carousel-overlay',
            step: `compose-${idx}`,
            carouselId,
            idx,
            path: success.path,
            bytes: success.bytes,
            ms: Date.now(),
          }));
        },
      });

      console.log(JSON.stringify({
        fn: 'compose-carousel-overlay',
        step: 'compose-all',
        carouselId,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      }));

      return result;
    });

    // ------------------------------------------------------------------
    // 3. Persist composed_path for succeeded slides; mark failed ones
    // ------------------------------------------------------------------
    await step.run('persist-compose-results', async () => {
      const db = getAdminClient();

      await Promise.all([
        ...composeResult.succeeded.map(({ idx, path }) =>
          db
            .from('carousel_slides')
            .update({ composed_path: path, status: 'ready' })
            .eq('carousel_id', carouselId)
            .eq('idx', idx),
        ),
        ...composeResult.failed.map(({ idx, error }) =>
          db
            .from('carousel_slides')
            .update({
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            })
            .eq('carousel_id', carouselId)
            .eq('idx', idx),
        ),
      ]);

      console.log(JSON.stringify({
        fn: 'compose-carousel-overlay',
        step: 'persist-compose-results',
        carouselId,
        succeededIdxs: composeResult.succeeded.map((s) => s.idx),
        failedIdxs: composeResult.failed.map((f) => f.idx),
      }));
    });

    // ------------------------------------------------------------------
    // 4. Emit caption requested (Tanda 9)
    // ------------------------------------------------------------------
    await step.sendEvent('emit-caption-requested', {
      name: 'virus/carousel.caption.requested',
      data: { carouselId, userId },
    });

    console.log(JSON.stringify({ fn: 'compose-carousel-overlay', step: 'done', carouselId }));

    return {
      ok: true,
      carouselId,
      composed: composeResult.succeeded.length,
      failed: composeResult.failed.length,
    };
  },
);
