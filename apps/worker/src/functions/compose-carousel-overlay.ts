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
import {
  composeAllSlides,
  STYLE_PRESETS,
  applyBrandOverrides,
  pickBrandStampIdx,
} from '@virus/shared/carousel';
import type { SlideSpec } from '@virus/shared/carousel';
import type { StylePreset } from '@virus/shared/carousel';

// ---------------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------------

interface CarouselProjectRow {
  style_preset: string;
  project_id: string;
}

interface BrandRow {
  brand_name: string | null;
  visual_style: BrandVisualStyle | null;
}

interface BrandVisualStyle {
  textColor?: string;
  bodyColor?: string;
  accentColor?: string;
  backgroundColor?: string;
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

// A spec with empty headline composes a PNG with a visible overlay block but
// no text — the composer will throw `compose_empty_headline`, but we'd rather
// detect it before kicking off the heavy compose work so the slide is marked
// 'failed' with a precise error and the gallery shows the alert state.
function specHasEmptyHeadline(spec: SlideSpec): boolean {
  return !spec.headline || spec.headline.trim().length === 0;
}

function resolvePreset(presetName: string, visualStyle?: BrandVisualStyle): StylePreset {
  const key = presetName as keyof typeof STYLE_PRESETS;
  const base = STYLE_PRESETS[key] ?? STYLE_PRESETS.bold;
  return applyBrandOverrides(base, visualStyle);
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
    const { slides, preset, brandName } = await step.run('load-slides', async () => {
      const db = getAdminClient();

      const { data: carouselRow, error: carouselErr } = await db
        .from('carousel_projects')
        .select('style_preset, project_id')
        .eq('id', carouselId)
        .single();

      if (carouselErr || !carouselRow) {
        throw new Error(`carousel_not_found:${carouselId} — ${carouselErr?.message ?? 'no data'}`);
      }

      const { style_preset, project_id } = carouselRow as CarouselProjectRow;

      const { data: brandRow } = await db
        .from('project_brand')
        .select('brand_name, visual_style')
        .eq('project_id', project_id)
        .eq('is_current', true)
        .single();

      const brand = (brandRow as BrandRow | null) ?? null;
      const visualStyle = brand?.visual_style ?? undefined;
      const resolvedBrandName = brand?.brand_name?.trim() ?? '';

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
        brandName: resolvedBrandName,
      }));

      return {
        slides: rows,
        preset: resolvePreset(style_preset, visualStyle),
        brandName: resolvedBrandName,
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

      const specsWithRows = slides.map((row) => ({
        idx: row.idx,
        spec: slideRowToSpec(row),
        baseImagePath: row.image_path,
      }));

      // Pre-flight: pull aside slides whose overlay_text has an empty headline.
      // These would throw `compose_empty_headline` inside composeSlide; failing
      // them explicitly here gives a clearer error string and skips the
      // download+upload roundtrip for a slide we know will fail.
      const brokenSpecIdxs = specsWithRows
        .filter((s) => specHasEmptyHeadline(s.spec))
        .map((s) => s.idx);

      if (brokenSpecIdxs.length > 0) {
        console.warn(
          JSON.stringify({
            fn: 'compose-carousel-overlay',
            step: 'compose-all',
            carouselId,
            warning: 'broken_overlay_specs',
            idxs: brokenSpecIdxs,
          }),
        );
        await Promise.all(
          brokenSpecIdxs.map((bIdx) =>
            db
              .from('carousel_slides')
              .update({
                status: 'failed',
                error: 'compose_empty_headline:plan_returned_empty',
              })
              .eq('carousel_id', carouselId)
              .eq('idx', bIdx),
          ),
        );
      }

      const slidesToCompose = specsWithRows.filter((s) => !specHasEmptyHeadline(s.spec));

      // Deterministically pick one interior slide to receive the brand stamp.
      // Role-aware picker excludes hook/cta/data so the stamp never lands on
      // the cover, the closer, or a number-card. If the brand has no name (or
      // the carousel only has hook+cta), no stamp is rendered.
      const stampIdx = brandName.length > 0
        ? pickBrandStampIdx(
            slidesToCompose.map((s) => ({ idx: s.idx, role: s.spec.role })),
            carouselId,
          )
        : null;

      console.log(JSON.stringify({
        fn: 'compose-carousel-overlay',
        step: 'brand-stamp-pick',
        carouselId,
        brandName,
        stampIdx,
      }));

      const result = await composeAllSlides({
        slides: slidesToCompose,
        preset,
        userId,
        carouselId,
        supabase: db,
        ...(brandName.length > 0 ? { brandName } : {}),
        ...(stampIdx !== null ? { brandStampIdx: stampIdx } : {}),
        onSlideDone: async (idx, success) => {
          console.log(JSON.stringify({
            fn: 'compose-carousel-overlay',
            step: `compose-${idx}`,
            carouselId,
            idx,
            path: success.path,
            bytes: success.bytes,
            stamped: idx === stampIdx,
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
