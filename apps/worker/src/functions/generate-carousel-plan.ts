/**
 * generate-carousel-plan — Inngest function for the carousel generation pipeline.
 *
 * Trigger: `virus/carousel.created`
 * Payload: { carouselId: string; userId: string }
 *
 * Flow:
 *  1. load-context: reads carousel_projects + project_brand. Fails fast if brand
 *     is missing (CAROUSEL_NO_BRAND) — the user must configure their brand first.
 *  2. plan-slides: calls Claude sonnet with buildSlidePlanPrompt(). Validates the
 *     JSON response with Zod. Retries once with a "fix this JSON" prompt on
 *     parse/validation errors before throwing.
 *  3. persist-slides: inserts carousel_slides rows (status='pending'). Stores the
 *     full SlideSpec as JSON in overlay_text so the compose step can reconstruct
 *     it without an extra DB column (the DB schema has no headline/body/role cols).
 *  4. update-status: sets carousel_projects.status='generating_slides'.
 *  5. emit-slides-requested: sends virus/carousel.slides.requested.
 *
 * On total failure: onFailure sets carousel status='failed' and records the error.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { withQuota } from '../lib/quotas.js';
import { callClaude } from '@virus/shared/ai';
import { MODELS } from '@virus/shared/ai';
import { buildSlidePlanPrompt } from '@virus/shared/carousel';
import { SlideSpecArraySchema } from '@virus/shared/carousel';
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

async function callClaudeForSlidePlan(
  prompt: string,
  slideCount: number,
): Promise<SlideSpec[]> {
  const result = await callClaude({
    model: MODELS.default,
    system: 'You are a JSON-only responder. Output only valid JSON arrays, no markdown, no text.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 200 * slideCount + 400,
  });

  const raw = result.text ?? '';

  function cleanSpec(s: { idx: number; role: SlideSpec['role']; headline: string; body?: string | undefined; visualPrompt: string }): SlideSpec {
    const spec: SlideSpec = { idx: s.idx, role: s.role, headline: s.headline, visualPrompt: s.visualPrompt };
    if (s.body !== undefined) spec.body = s.body;
    return spec;
  }

  try {
    const parsed = SlideSpecArraySchema.parse(JSON.parse(raw));
    return parsed.map(cleanSpec);
  } catch {
    // One retry: ask Claude to fix the JSON
    const fixResult = await callClaude({
      model: MODELS.default,
      system: 'You are a JSON-only responder. Fix the provided JSON and return only the corrected array.',
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: raw },
        { role: 'user', content: `The JSON above is invalid. Fix it and return only the corrected JSON array of ${slideCount} SlideSpec objects.` },
      ],
      maxTokens: 200 * slideCount + 400,
    });
    const fixedRaw = fixResult.text ?? '';
    const fixedParsed = SlideSpecArraySchema.parse(JSON.parse(fixedRaw));
    return fixedParsed.map(cleanSpec);
  }
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const generateCarouselPlan = inngest.createFunction(
  {
    id: 'generate-carousel-plan',
    retries: 2,
    concurrency: { limit: 5 },
    onFailure: async ({ event, error }) => {
      const original = (
        event as unknown as { data: { event: { data: { carouselId?: string } } } }
      ).data.event;
      const carouselId = original?.data?.carouselId;

      console.log(JSON.stringify({
        fn: 'generate-carousel-plan',
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
        console.error('[generate-carousel-plan] onFailure update failed', err);
      }
    },
  },
  { event: 'virus/carousel.created' },
  async ({ event, step }) => {
    const { carouselId, userId } = event.data;

    console.log(JSON.stringify({ fn: 'generate-carousel-plan', step: 'start', carouselId, userId }));

    // ------------------------------------------------------------------
    // 1. Load carousel project + brand
    // ------------------------------------------------------------------
    const { carousel, brief, brand } = await step.run('load-context', async () => {
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
      const parsedBrief = parseBrief(row);

      const { data: brandRow, error: brandErr } = await db
        .from('project_brand')
        .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience')
        .eq('project_id', row.project_id)
        .eq('is_current', true)
        .single();

      if (brandErr || !brandRow) {
        throw new Error(`CAROUSEL_NO_BRAND:${row.project_id} — brand not configured`);
      }

      const builtBrand = buildBrand(row.project_id, brandRow as ProjectBrandRow);

      console.log(JSON.stringify({
        fn: 'generate-carousel-plan',
        step: 'load-context',
        carouselId,
        projectId: row.project_id,
        slideCount: parsedBrief.slideCount,
      }));

      return { carousel: row, brief: parsedBrief, brand: builtBrand };
    });

    // ------------------------------------------------------------------
    // 2. Call Claude to produce SlideSpec[]
    // ------------------------------------------------------------------
    const slides: SlideSpec[] = await step.run('plan-slides', async () => {
      const prompt = buildSlidePlanPrompt(brief, brand);

      const ESTIMATED_COST_USD = 0.03;
      return withQuota('anthropic', userId, ESTIMATED_COST_USD, async () => {
        const specs = await callClaudeForSlidePlan(prompt, brief.slideCount);

        console.log(JSON.stringify({
          fn: 'generate-carousel-plan',
          step: 'plan-slides',
          carouselId,
          slidesPlanned: specs.length,
          model: MODELS.default,
        }));

        return {
          result: specs,
          actualCost: ESTIMATED_COST_USD,
          actualUnits: 1200 + brief.slideCount * 80,
        };
      });
    });

    // ------------------------------------------------------------------
    // 3. Persist slides — overlay_text stores the full SlideSpec JSON so
    //    the compose step can reconstruct role/headline/body without adding
    //    new DB columns to the current schema.
    // ------------------------------------------------------------------
    await step.run('persist-slides', async () => {
      const db = getAdminClient();

      const rows = slides.map((s) => ({
        carousel_id: carouselId,
        user_id: userId,
        idx: s.idx,
        prompt: s.visualPrompt,
        overlay_text: JSON.stringify(s),
        status: 'pending',
      }));

      const { error } = await db.from('carousel_slides').upsert(rows, {
        onConflict: 'carousel_id,idx',
        ignoreDuplicates: false,
      });

      if (error) throw new Error(`persist_slides_failed:${carouselId} — ${error.message}`);

      console.log(JSON.stringify({
        fn: 'generate-carousel-plan',
        step: 'persist-slides',
        carouselId,
        count: rows.length,
      }));
    });

    // ------------------------------------------------------------------
    // 4. Update carousel status
    // ------------------------------------------------------------------
    await step.run('update-status', async () => {
      const db = getAdminClient();
      const { error } = await db
        .from('carousel_projects')
        .update({ status: 'generating_slides' })
        .eq('id', carouselId);
      if (error) throw new Error(`update_status_failed:${carouselId} — ${error.message}`);

      console.log(JSON.stringify({
        fn: 'generate-carousel-plan',
        step: 'update-status',
        carouselId,
        status: 'generating_slides',
      }));
    });

    // ------------------------------------------------------------------
    // 5. Emit next event
    // ------------------------------------------------------------------
    await step.sendEvent('emit-slides-requested', {
      name: 'virus/carousel.slides.requested',
      data: { carouselId, userId },
    });

    console.log(JSON.stringify({ fn: 'generate-carousel-plan', step: 'done', carouselId }));

    return { ok: true, carouselId, slideCount: slides.length };
  },
);
