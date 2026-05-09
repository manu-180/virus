/**
 * regenerate-carousel-slide — re-generates a single slide image + overlay.
 *
 * Trigger: `virus/carousel.slide.regenerate.requested`
 * Payload: { carouselId, userId, idx }
 *
 * Flow:
 *  1. mark-generating: slide status → 'generating'
 *  2. load-context: fetch carousel brief/style, slide overlay spec, project brand
 *  3. generate-image: call generateCarouselSlideImage, update image_path in DB
 *  4. compose-overlay: download base image, composeSlide, upload, update composed_path + status='done'
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { generateCarouselSlideImage, composeSlide, STYLE_PRESETS } from '@virus/shared/carousel';
import type { SlideSpec, CarouselBrief, StylePreset } from '@virus/shared/carousel';
import type { ProjectBrand } from '@virus/shared/viral';

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface CarouselProjectRow {
  id: string;
  project_id: string;
  brief: string;
  style_preset: string;
}

interface CarouselSlideRow {
  id: string;
  idx: number;
  prompt: string;
  overlay_text: string | null;
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

function parseBrief(row: CarouselProjectRow): CarouselBrief {
  const parsed = JSON.parse(row.brief) as Partial<CarouselBrief>;
  return {
    topic: parsed.topic ?? '',
    angle: parsed.angle ?? 'educational',
    tone: parsed.tone ?? 'direct',
    audience: parsed.audience ?? '',
    slideCount: parsed.slideCount ?? 1,
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
      // fall through
    }
  }
  return { idx: row.idx, role: 'insight', headline: '', visualPrompt: row.prompt };
}

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

function resolvePreset(presetName: string): StylePreset {
  const key = presetName as keyof typeof STYLE_PRESETS;
  return STYLE_PRESETS[key] ?? STYLE_PRESETS.bold;
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const regenerateCarouselSlide = inngest.createFunction(
  {
    id: 'regenerate-carousel-slide',
    retries: 2,
    concurrency: { limit: 5 },
    onFailure: async ({ event, error }) => {
      const original = (
        event as unknown as { data: { event: { data: { carouselId?: string; idx?: number } } } }
      ).data.event;
      const { carouselId, idx } = original?.data ?? {};

      if (!carouselId || idx === undefined) return;
      const db = getAdminClient();

      try {
        await db
          .from('carousel_slides')
          .update({ status: 'failed', error: error?.message ?? 'unknown_error' })
          .eq('carousel_id', carouselId)
          .eq('idx', idx);
      } catch (err) {
        console.error('[regenerate-carousel-slide] onFailure update failed', err);
      }
    },
  },
  { event: 'virus/carousel.slide.regenerate.requested' },
  async ({ event, step }) => {
    const { carouselId, userId, idx } = event.data;

    console.log(JSON.stringify({ fn: 'regenerate-carousel-slide', step: 'start', carouselId, userId, idx }));

    // ------------------------------------------------------------------
    // 1. Mark as generating
    // ------------------------------------------------------------------
    await step.run('mark-generating', async () => {
      const db = getAdminClient();
      await db
        .from('carousel_slides')
        .update({ status: 'generating', error: null })
        .eq('carousel_id', carouselId)
        .eq('idx', idx);
    });

    // ------------------------------------------------------------------
    // 2. Load context
    // ------------------------------------------------------------------
    const { brief, brand, preset, slideSpec } = await step.run('load-context', async () => {
      const db = getAdminClient();

      const { data: carouselRow, error: carouselErr } = await db
        .from('carousel_projects')
        .select('id, project_id, brief, style_preset')
        .eq('id', carouselId)
        .single();

      if (carouselErr || !carouselRow) {
        throw new Error(`carousel_not_found:${carouselId}`);
      }

      const row = carouselRow as CarouselProjectRow;

      const { data: slideRow, error: slideErr } = await db
        .from('carousel_slides')
        .select('id, idx, prompt, overlay_text')
        .eq('carousel_id', carouselId)
        .eq('idx', idx)
        .single();

      if (slideErr || !slideRow) {
        throw new Error(`slide_not_found:${carouselId}:${idx}`);
      }

      const { data: brandRow, error: brandErr } = await db
        .from('project_brand')
        .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience')
        .eq('project_id', row.project_id)
        .eq('is_current', true)
        .single();

      if (brandErr || !brandRow) {
        throw new Error(`brand_not_found:${row.project_id}`);
      }

      return {
        brief: parseBrief(row),
        brand: buildBrand(row.project_id, brandRow as ProjectBrandRow),
        preset: resolvePreset(row.style_preset),
        slideSpec: slideRowToSpec(slideRow as CarouselSlideRow),
      };
    });

    // ------------------------------------------------------------------
    // 3. Generate new base image
    // ------------------------------------------------------------------
    const imagePath = await step.run('generate-image', async () => {
      const db = getAdminClient();

      const result = await generateCarouselSlideImage({
        brief,
        slide: slideSpec,
        brand,
        userId,
        carouselId,
        supabase: db,
      });

      await db
        .from('carousel_slides')
        .update({ image_path: result.path, error: null })
        .eq('carousel_id', carouselId)
        .eq('idx', idx);

      console.log(JSON.stringify({
        fn: 'regenerate-carousel-slide',
        step: 'generate-image',
        carouselId, idx, path: result.path, bytes: result.bytes,
      }));

      return result.path;
    });

    // ------------------------------------------------------------------
    // 4. Compose overlay
    // ------------------------------------------------------------------
    await step.run('compose-overlay', async () => {
      const db = getAdminClient();

      const { data, error: downloadErr } = await db.storage
        .from('carousels')
        .download(imagePath);

      if (downloadErr || !data) {
        throw new Error(`download_failed:${imagePath} — ${downloadErr?.message ?? 'no data'}`);
      }

      const baseImage = Buffer.from(await data.arrayBuffer());

      const composed = await composeSlide({ baseImage, slide: slideSpec, preset });

      const composedPath = `${userId}/${carouselId}/composed-${idx}.png`;

      const { error: uploadErr } = await db.storage
        .from('carousels')
        .upload(composedPath, composed, { contentType: 'image/png', upsert: true });

      if (uploadErr) throw uploadErr;

      await db
        .from('carousel_slides')
        .update({ composed_path: composedPath, status: 'done', error: null })
        .eq('carousel_id', carouselId)
        .eq('idx', idx);

      console.log(JSON.stringify({
        fn: 'regenerate-carousel-slide',
        step: 'compose-overlay',
        carouselId, idx, composedPath, bytes: composed.length,
      }));
    });

    console.log(JSON.stringify({ fn: 'regenerate-carousel-slide', step: 'done', carouselId, idx }));

    return { ok: true, carouselId, idx };
  },
);
