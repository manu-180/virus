/**
 * regenerate-carousel-slide — re-generates a single slide image + overlay.
 *
 * Trigger: `virus/carousel.slide.regenerate.requested`
 * Payload: { carouselId, userId, idx }
 *
 * Flow:
 *  1. mark-generating: slide status → 'generating'
 *  2. load-context: fetch carousel brief/style, slide overlay spec, project brand
 *  2b. recover-overlay-spec (only if slideSpec.headline is empty/invalid):
 *      re-plan ONLY this slide via Claude and persist the corrected spec to
 *      DB. Auto-heals slides whose original plan-step produced an empty
 *      headline (which would otherwise compose a text-less PNG marked 'ready').
 *  3. generate-image: call generateCarouselSlideImage, update image_path in DB
 *  4. compose-overlay: download base image, composeSlide, upload, update composed_path + status='ready'
 */

import { z } from 'zod';
import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import {
  generateCarouselSlideImage,
  composeSlide,
  STYLE_PRESETS,
  applyBrandOverrides,
  buildSlidePlanPrompt,
  sanitizeSlideBody,
  SlideSpecArraySchema,
} from '@virus/shared/carousel';
import type { SlideSpec, CarouselBrief, StylePreset } from '@virus/shared/carousel';
import type { ProjectBrand } from '@virus/shared/viral';
import { callClaude, MODELS } from '@virus/shared/ai';

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
  visual_style: unknown;
}

interface BrandVisualStyle {
  textColor?: string;
  bodyColor?: string;
  accentColor?: string;
  backgroundColor?: string;
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

function resolvePreset(presetName: string, visualStyle?: BrandVisualStyle): StylePreset {
  const key = presetName as keyof typeof STYLE_PRESETS;
  const base = STYLE_PRESETS[key] ?? STYLE_PRESETS.bold;
  return applyBrandOverrides(base, visualStyle);
}

// A slide spec is "broken" if the headline is missing, empty, or whitespace-
// only. Such a spec composes to a text-less PNG that gets marked status='ready'
// — exactly the silent-failure class of bug the recovery path exists to fix.
function isSpecBroken(spec: SlideSpec): boolean {
  return !spec.headline || spec.headline.trim().length === 0;
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

/**
 * Re-plan a single slide by re-running the carousel plan prompt and extracting
 * the slide at `idx`. We reuse the full prompt rather than crafting a "single
 * slide" prompt so the model still sees the narrative arc (hook → problem →
 * insight → cta) and produces a headline that fits the carousel's voice.
 *
 * The extra Claude call only runs on the rare recovery path (broken overlay
 * spec), so the token cost is acceptable for the auto-heal value.
 */
async function replanSingleSlide(
  brief: CarouselBrief,
  brand: ProjectBrand,
  idx: number,
  fallback: SlideSpec,
): Promise<SlideSpec> {
  const prompt = buildSlidePlanPrompt(brief, brand);

  const result = await callClaude({
    model: MODELS.default,
    system:
      'You are a JSON-only responder. Output only valid JSON arrays, no markdown, no text.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 200 * brief.slideCount + 400,
  });

  const raw = result.text ?? '';

  try {
    const parsed = SlideSpecArraySchema.parse(JSON.parse(stripJsonFences(raw)));
    const match = parsed.find((s) => s.idx === idx);
    if (match && match.headline.trim().length > 0) {
      // Preserve the existing idx/role from DB if Claude renumbered things.
      const recovered: SlideSpec = {
        idx: fallback.idx,
        role: fallback.role,
        headline: match.headline,
        visualPrompt: match.visualPrompt || fallback.visualPrompt,
      };
      // Run the body through the same smart-truncate the plan path uses so
      // recovered slides never render half-sentences.
      if (match.body !== undefined) {
        const cleaned = sanitizeSlideBody(match.body);
        if (cleaned !== undefined) recovered.body = cleaned;
      }
      return recovered;
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        fn: 'regenerate-carousel-slide',
        step: 'recover-overlay-spec',
        idx,
        warning: 'replan_parse_failed',
        error: err instanceof z.ZodError ? err.issues : (err as Error)?.message,
      }),
    );
  }

  // Last resort: derive a minimal headline from the brief topic so compose
  // doesn't throw `compose_empty_headline`. Not pretty, but the slide will be
  // visibly off-brand and the user will re-trigger regenerate — which beats a
  // silent text-less PNG.
  const safeHeadline = (brief.topic || 'Slide').slice(0, 40).trim() || 'Slide';
  return { ...fallback, headline: safeHeadline };
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
    // `hint` is optional on the event; older callers may not send it.
    const hint = typeof (event.data as { hint?: unknown }).hint === 'string'
      ? ((event.data as { hint: string }).hint).trim()
      : '';

    console.log(JSON.stringify({
      fn: 'regenerate-carousel-slide',
      step: 'start',
      carouselId, userId, idx,
      hasHint: hint.length > 0,
    }));

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
    const loaded = await step.run('load-context', async () => {
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
        .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience, visual_style')
        .eq('project_id', row.project_id)
        .eq('is_current', true)
        .single();

      if (brandErr || !brandRow) {
        throw new Error(`brand_not_found:${row.project_id}`);
      }

      const visualStyle = (brandRow.visual_style as BrandVisualStyle | null) ?? undefined;

      return {
        brief: parseBrief(row),
        brand: buildBrand(row.project_id, brandRow as ProjectBrandRow),
        preset: resolvePreset(row.style_preset, visualStyle),
        slideSpec: slideRowToSpec(slideRow as CarouselSlideRow),
      };
    });

    const { brief, brand, preset } = loaded;
    let slideSpec: SlideSpec = loaded.slideSpec;

    // ------------------------------------------------------------------
    // 2b. Recover broken overlay spec
    //
    // If overlay_text in DB has an empty/whitespace headline, composing
    // will throw `compose_empty_headline` and the slide ends in 'failed'
    // — the user clicks Regenerar again and gets the same failure.
    //
    // Auto-heal by re-running the slide plan via Claude and persisting
    // the corrected spec to DB BEFORE the image+compose steps run.
    // ------------------------------------------------------------------
    if (isSpecBroken(slideSpec)) {
      slideSpec = await step.run('recover-overlay-spec', async () => {
        console.log(
          JSON.stringify({
            fn: 'regenerate-carousel-slide',
            step: 'recover-overlay-spec',
            carouselId,
            idx,
            reason: 'empty_headline_in_overlay_text',
          }),
        );

        const recovered = await replanSingleSlide(brief, brand, idx, loaded.slideSpec);

        const db = getAdminClient();
        const { error: updateErr } = await db
          .from('carousel_slides')
          .update({
            overlay_text: JSON.stringify(recovered),
            prompt: recovered.visualPrompt,
          })
          .eq('carousel_id', carouselId)
          .eq('idx', idx);

        if (updateErr) {
          // Non-fatal: continue with the in-memory recovered spec. The DB
          // will get its new overlay_text on the next successful regenerate.
          console.warn(
            JSON.stringify({
              fn: 'regenerate-carousel-slide',
              step: 'recover-overlay-spec',
              carouselId,
              idx,
              warning: 'persist_failed',
              error: updateErr.message,
            }),
          );
        }

        return recovered;
      });
    }

    // ------------------------------------------------------------------
    // 3. Generate new base image
    //
    // Strategy depends on the brand's imageProfile.subjectStrategy:
    //
    // - `character-anchor` (default / personal-brand photo) — when
    //   regenerating a non-hook slide, download the existing slide-0 image
    //   and pass it as the visual reference so the regenerated slide keeps
    //   the same character/palette as the rest of the carousel. If slide 0
    //   isn't available yet, degrade to text-only generation.
    //
    // - `world-anchor` / `standalone` (tech/SaaS, e.g. APEX) — NEVER pass a
    //   reference image. Continuity is anchored by the brand's imageProfile
    //   (technique + palette + mood) in the text prompt. Passing slide 0 as
    //   a reference would force the model to mimic its SUBJECT (the wrong
    //   continuity axis), defeating the whole point of world-anchor.
    //
    // Brand-typography slide: if THIS regenerated idx matches the
    // deterministic pick for the carousel, we ask Gemini to bake the brand
    // name into the artwork (and skip the reference image — see image-batch
    // for the same logic + rationale).
    // ------------------------------------------------------------------
    const imagePath = await step.run('generate-image', async () => {
      const db = getAdminClient();

      // Resolve the brand-typography directive BEFORE deciding on a reference
      // image: the typography slide skips the anchor reference so Gemini has
      // room to compose the lettering into the scene from scratch instead of
      // grafting text onto an existing photo (which always reads as a stamp).
      const stampIdx = pickBrandStampIdxFromCount(brief.slideCount, carouselId);
      const brandNameTrimmed = brand.brandName?.trim() ?? '';
      const brandTypography =
        stampIdx === idx && brandNameTrimmed.length > 0
          ? { brandName: brandNameTrimmed }
          : undefined;

      const subjectStrategy =
        brand.visualStyle?.imageProfile?.subjectStrategy ?? 'character-anchor';

      let referenceImage: Buffer | undefined;
      if (subjectStrategy === 'character-anchor' && idx !== 0 && !brandTypography) {
        const anchorPath = `${userId}/${carouselId}/slide-0.png`;
        try {
          const { data, error: dlErr } = await db.storage
            .from('carousels')
            .download(anchorPath);
          if (!dlErr && data) {
            referenceImage = Buffer.from(await data.arrayBuffer());
          }
        } catch {
          // Non-fatal: missing anchor just means no visual continuity for this
          // regenerated slide. We still want to produce something for the user.
        }
      }

      // When the user provided a hint ("más oscuro", "sin manos", …) we
      // append it to the slide's existing visualPrompt as an explicit
      // user-direction clause. We don't replace the visualPrompt: the
      // original keeps the brand/role context, and the hint biases the
      // model on top.
      const slideForImage: SlideSpec = hint
        ? { ...slideSpec, visualPrompt: `${slideSpec.visualPrompt}. User direction: ${hint}` }
        : slideSpec;

      const result = await generateCarouselSlideImage({
        brief,
        slide: slideForImage,
        brand,
        userId,
        carouselId,
        supabase: db,
        ...(referenceImage ? { referenceImage } : {}),
        ...(brandTypography ? { brandTypography } : {}),
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
        brandTypography: brandTypography ? brandTypography.brandName : null,
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

      // Brand name is no longer composited as a Satori overlay — it lives in
      // the generated image itself (see step 3 / brandTypography), which
      // means the composer's only job here is the text overlay. The
      // deterministic stamp-idx pick still happens above, but inside the
      // image-generation step, not here.
      const composed = await composeSlide({ baseImage, slide: slideSpec, preset });

      const composedPath = `${userId}/${carouselId}/composed-${idx}.png`;

      const { error: uploadErr } = await db.storage
        .from('carousels')
        .upload(composedPath, composed, { contentType: 'image/png', upsert: true });

      if (uploadErr) throw uploadErr;

      await db
        .from('carousel_slides')
        .update({ composed_path: composedPath, status: 'ready', error: null })
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
