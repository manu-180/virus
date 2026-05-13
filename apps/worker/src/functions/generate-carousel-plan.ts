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

import { z } from 'zod';
import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { withQuota } from '../lib/quotas.js';
import { callClaude } from '@virus/shared/ai';
import { MODELS } from '@virus/shared/ai';
import { buildSlidePlanPrompt, sanitizeSlideBody } from '@virus/shared/carousel';
import { SlideSpecArraySchema } from '@virus/shared/carousel';
import type { CarouselBrief, SlideSpec } from '@virus/shared/carousel';
import type { ProjectBrand } from '@virus/shared/viral';

// SlideSpec schema limits (kept in sync with packages/shared/src/carousel/types.ts).
// We sanitize Claude's raw output to these limits BEFORE Zod validation — LLMs
// routinely over-shoot string maximums and that should not blow up the whole
// carousel. The composer truncates to the same or larger values, so trimming
// here is safe.
//
// MAX_BODY is the SCHEMA cap (must stay ≥ the smart-truncate target so we
// don't reject a valid sanitized body). The actual content target lives in
// sanitizeSlideBody() and is 110 — that helper walks back to the last sentence
// end or whitespace and force-completes with a period, so bodies never end
// mid-word in the rendered PNG.
const MAX_HEADLINE = 40;
const MAX_BODY = 120;
const BODY_TARGET = 110;
const VALID_ROLES = ['hook', 'problem', 'insight', 'data', 'example', 'cta'] as const;

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
  visual_style: unknown; // { defaultPreset?: string; accentColor?: string; fontPreference?: string; sampleImageUrls?: string[] }
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

function parseBrief(
  row: CarouselProjectRow,
  brandVisualStyle?: { defaultPreset?: string },
): CarouselBrief {
  const parsed = JSON.parse(row.brief) as Partial<CarouselBrief>;
  // Use explicit stylePreset from brief first, then brand preference, then row column
  const stylePreset =
    parsed.stylePreset ??
    (brandVisualStyle?.defaultPreset as CarouselBrief['stylePreset'] | undefined) ??
    (row.style_preset as CarouselBrief['stylePreset']);
  return {
    topic: parsed.topic ?? '',
    angle: parsed.angle ?? 'educational',
    tone: parsed.tone ?? 'direct',
    audience: parsed.audience ?? '',
    slideCount: parsed.slideCount ?? row.slide_count,
    stylePreset,
    language: parsed.language ?? 'es',
    cta: parsed.cta ?? '',
  };
}

function cleanSpec(s: {
  idx: number;
  role: SlideSpec['role'];
  headline: string;
  body?: string | undefined;
  visualPrompt: string;
}): SlideSpec {
  const spec: SlideSpec = { idx: s.idx, role: s.role, headline: s.headline, visualPrompt: s.visualPrompt };
  if (s.body !== undefined) spec.body = s.body;
  return spec;
}

// Strip markdown fences in case Claude wraps the JSON in ```json ... ``` despite
// the "JSON-only" system prompt — it happens occasionally and is recoverable.
function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

// Coerce LLM output to the shape Zod expects. LLMs routinely over-shoot string
// limits and occasionally pick a role outside the enum; we'd rather render a
// slightly-trimmed slide than fail the whole carousel.
function sanitizeRawSpecs(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((item: unknown, fallbackIdx: number) => {
    if (typeof item !== 'object' || item === null) return item;
    const r = item as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    result.idx = typeof r.idx === 'number' ? Math.floor(r.idx) : fallbackIdx;

    result.role =
      typeof r.role === 'string' && (VALID_ROLES as readonly string[]).includes(r.role)
        ? r.role
        : 'insight';

    // Don't silently coerce missing/empty headlines to "" — leave the field
    // undefined so SlideSpecSchema.headline.min(1) rejects it and the retry
    // path gets a specific "headline required" error to fix.
    if (typeof r.headline === 'string') {
      const headline = r.headline.trim();
      if (headline.length > 0) {
        result.headline =
          headline.length > MAX_HEADLINE ? headline.slice(0, MAX_HEADLINE) : headline;
      }
    }

    if (typeof r.body === 'string') {
      // Smart truncate: walks back to the last sentence end or whitespace and
      // force-completes with a period. Returns undefined for pathological
      // input (one giant word) — better to omit the body than render half a
      // word. See sanitizeSlideBody() docs for the strategy.
      const cleaned = sanitizeSlideBody(r.body, BODY_TARGET);
      if (cleaned !== undefined) {
        // Final hard cap to satisfy the Zod schema. sanitizeSlideBody already
        // targets BODY_TARGET (110) so this should be a no-op in practice;
        // we keep it as a defense-in-depth assertion against future edits.
        result.body = cleaned.length > MAX_BODY ? cleaned.slice(0, MAX_BODY) : cleaned;
      }
    }

    result.visualPrompt = typeof r.visualPrompt === 'string' ? r.visualPrompt.trim() : '';

    return result;
  });
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ');
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

  let firstError: string;
  try {
    const rawJson = JSON.parse(stripJsonFences(raw));
    const sanitized = sanitizeRawSpecs(rawJson);
    const parsed = SlideSpecArraySchema.parse(sanitized);
    return parsed.map(cleanSpec);
  } catch (err) {
    firstError =
      err instanceof z.ZodError
        ? `Zod validation failed: ${formatZodError(err)}`
        : err instanceof Error
          ? `JSON parse failed: ${err.message}`
          : 'invalid response';
    console.warn(JSON.stringify({
      fn: 'generate-carousel-plan',
      step: 'plan-slides',
      attempt: 1,
      error: firstError,
    }));
  }

  // One retry — surface the SPECIFIC error so Claude can fix the right thing
  // (the previous version sent a generic "fix this" message and Claude would
  // often regenerate the same too-long body).
  const fixResult = await callClaude({
    model: MODELS.default,
    system: 'You are a JSON-only responder. Fix the provided JSON to satisfy the constraints. Output only the corrected JSON array, no markdown, no text.',
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content:
          `The JSON above failed validation with this error:\n${firstError}\n\n` +
          `Return the corrected JSON array of ${slideCount} SlideSpec objects. ` +
          `STRICT LIMITS: headline MUST be non-empty AND ≤ ${MAX_HEADLINE} chars, ` +
          `body ≤ ${BODY_TARGET} chars AND a COMPLETE SENTENCE ending in a period (no dangling connectives, no "..."), ` +
          `role must be one of: ${VALID_ROLES.join(', ')}. ` +
          `EVERY slide needs a headline — empty strings are invalid. ` +
          `If a body cannot be expressed as a complete sentence in ${BODY_TARGET} chars, SHORTEN the idea — do not truncate mid-thought. ` +
          `Count characters before responding. No markdown.`,
      },
    ],
    maxTokens: 200 * slideCount + 400,
  });
  const fixedRaw = fixResult.text ?? '';
  const fixedJson = JSON.parse(stripJsonFences(fixedRaw));
  const fixedSanitized = sanitizeRawSpecs(fixedJson);
  const fixedParsed = SlideSpecArraySchema.parse(fixedSanitized);
  return fixedParsed.map(cleanSpec);
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

      const { data: brandRow, error: brandErr } = await db
        .from('project_brand')
        .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience, visual_style')
        .eq('project_id', row.project_id)
        .eq('is_current', true)
        .single();

      if (brandErr || !brandRow) {
        throw new Error(`CAROUSEL_NO_BRAND:${row.project_id} — brand not configured`);
      }

      const brandVisualStyle = (brandRow.visual_style as { defaultPreset?: string; accentColor?: string } | null) ?? {};
      const parsedBrief = parseBrief(row, brandVisualStyle);

      const builtBrand = buildBrand(row.project_id, brandRow as ProjectBrandRow);

      const accentColorOverride = brandVisualStyle?.accentColor;
      console.log(JSON.stringify({
        fn: 'generate-carousel-plan',
        step: 'load-context',
        carouselId,
        projectId: row.project_id,
        slideCount: parsedBrief.slideCount,
        stylePreset: parsedBrief.stylePreset,
        accentColorOverride: accentColorOverride ?? null,
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
          metadata: { carouselId, operation: 'plan-slides', model: MODELS.default },
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
