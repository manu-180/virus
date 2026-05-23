import type { SupabaseClient } from '@supabase/supabase-js';
import { generateImageGemini } from '../visuals/providers/gemini.js';
import { GEMINI_BATCH_USD_PER_IMAGE } from './cost.js';
import { buildVisualPrompt } from './prompts.js';
import {
  getReuseConfig,
  findReusableSlideImage,
  reuseSlideImage,
  saveSlideImageAsset,
} from './image-library.js';
import { findRecyclableSlide, copyRecycledSlide } from './image-recycle.js';
import type { CarouselBrief, SlideSpec } from './types.js';
import type { ProjectBrand } from '../viral/types.js';

// 4:5 Instagram carousel slide dimensions.
const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;

export class CarouselSafetyBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CarouselSafetyBlockedError';
  }
}

export class CarouselRateLimitError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CarouselRateLimitError';
  }
}

// Retry parameters for Gemini rate-limit / quota errors. Inngest's outer retry
// machinery doesn't kick in here because the batch layer swallows per-slide
// errors (it intentionally allows partial-success carousels), so the retry has
// to live in this provider. Backoff: 2s, 6s, 18s (total ≤ 26s).
export const RATE_LIMIT_MAX_RETRIES = 3;
export const RATE_LIMIT_INITIAL_BACKOFF_MS = 2_000;
export const RATE_LIMIT_BACKOFF_FACTOR = 3;

// Hookable sleep so tests can stub the timing without waiting in real time.
export const _internal = {
  sleep: (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms)),
};

function isRateLimitMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes('429') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('resource_exhausted')
  );
}

export interface GenerateCarouselSlideImageArgs {
  brief: CarouselBrief;
  slide: SlideSpec;
  brand: ProjectBrand;
  userId: string;
  carouselId: string;
  supabase: SupabaseClient;
  /**
   * Optional reference image (bytes) used for image-to-image generation. When
   * provided, the prompt is reshaped to instruct the model to keep the
   * SAME character/setting/palette as the reference and only vary the action
   * or framing described in this slide's visualPrompt. This is how the batch
   * pipeline propagates the slide-0 "anchor" image into every later slide so
   * the whole carousel reads as one continuous visual story.
   */
  referenceImage?: Buffer;
  /**
   * When true, the image library is consulted FIRST: if a semantically-close
   * image already exists for this project + slide role + visual style, it is
   * reused instead of calling Gemini. Set by the independent batch path
   * (world-anchor / standalone brands). The anchor-chain path leaves it false
   * because its slides must visually match a per-carousel anchor and so are
   * not safely reusable across carousels.
   */
  allowReuse?: boolean;
}

export interface SlideImageResult {
  path: string;
  bytes: number;
  costCents: number;
  /** True when this slide was served from the image library (no Gemini call). */
  reused: boolean;
  /** The library asset id when `reused` is true. */
  assetId?: string;
  /**
   * Raw image buffer. The batch pipeline uses this to pass the anchor slide
   * (slide 0 / hook) as a reference image to subsequent slides without a
   * Storage round-trip. Strip this before returning to callers that don't
   * need it — it can be tens to hundreds of KB per slide.
   */
  buffer?: Buffer;
}

/**
 * Generate (or reuse) a single 4:5 carousel slide image and upload it to the
 * `carousels` Storage bucket at `{userId}/{carouselId}/slide-{idx}.png`.
 *
 * Flow:
 *  1. If `allowReuse` is set, ask the image library for a semantically-close
 *     stored image (same project + role + visual style). On a hit, copy it
 *     into the slide path — no Gemini call, `costCents` 0, `reused` true.
 *  2. Otherwise generate fresh with Gemini, upload, and index the result into
 *     the library so future carousels can reuse it.
 *
 * Throws {@link CarouselSafetyBlockedError} on RAI policy refusals (Inngest
 * should NOT retry — the brief needs editing).
 * Throws {@link CarouselRateLimitError} on quota/rate-limit errors (Inngest
 * should retry with exponential back-off).
 */
export async function generateCarouselSlideImage(
  args: GenerateCarouselSlideImageArgs,
): Promise<SlideImageResult> {
  const { brief, slide, brand, userId, carouselId, supabase, referenceImage, allowReuse } = args;

  const path = `${userId}/${carouselId}/slide-${slide.idx}.png`;
  const projectId = brand.projectId;
  const reuseConfig = getReuseConfig();

  // --- 1. Reuse: serve a stored image when one closely matches this slide ---
  if (allowReuse && reuseConfig.enabled && projectId) {
    const match = await findReusableSlideImage({
      supabase,
      projectId,
      brand,
      slide,
      topic: brief.topic,
      config: reuseConfig,
    });
    if (match) {
      try {
        const reused = await reuseSlideImage({
          supabase,
          assetId: match.assetId,
          sourcePath: match.storagePath,
          destPath: path,
        });
        console.log(
          JSON.stringify({
            fn: 'generateCarouselSlideImage',
            step: 'reused',
            carouselId,
            idx: slide.idx,
            assetId: match.assetId,
            similarity: Math.round(match.similarity * 1000) / 1000,
          }),
        );
        return {
          path,
          bytes: reused.bytes,
          costCents: 0,
          reused: true,
          assetId: match.assetId,
          buffer: reused.buffer,
        };
      } catch (err) {
        // Reuse failed mid-copy — fall through to fresh generation.
        console.warn(
          JSON.stringify({
            fn: 'generateCarouselSlideImage',
            warn: 'reuse_failed',
            carouselId,
            idx: slide.idx,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }

  // --- 2. Fresh generation with Gemini ---
  // Wrapped in try/catch so we can fall back to recycling a past slide PNG
  // when Gemini is unavailable (rate limit, quota exhausted, billing gap).
  // See `image-recycle.ts` for the design rationale — this keeps the
  // carousel pipeline shipping even when image generation is fully down.
  const prompt = buildVisualPrompt(slide, brief.stylePreset, brand, {
    topic: brief.topic,
    hasReferenceImage: referenceImage != null,
  });

  let imageBytes: Buffer;
  try {
    imageBytes = await generateWithRetry(prompt, referenceImage);
  } catch (err) {
    // Only fall back on rate-limit / quota failures. RAI-blocked prompts
    // (CarouselSafetyBlockedError) require editing the brief, not recycling.
    if (err instanceof CarouselRateLimitError && projectId) {
      const recycled = await findRecyclableSlide({
        supabase,
        projectId,
        role: slide.role,
        stylePreset: brief.stylePreset,
        excludeCarouselId: carouselId,
      });

      if (recycled) {
        try {
          const copied = await copyRecycledSlide({
            supabase,
            sourcePath: recycled.imagePath,
            destPath: path,
          });
          console.log(
            JSON.stringify({
              fn: 'generateCarouselSlideImage',
              step: 'recycled-on-rate-limit',
              carouselId,
              idx: slide.idx,
              sourceCarouselId: recycled.sourceCarouselId,
              sourceIdx: recycled.sourceIdx,
            }),
          );
          // Recycled images cost $0 (no Gemini call). `reused: true` keeps
          // the batch/cost accounting honest — usage_records won't log a
          // spurious charge in `generate-carousel-slides`.
          return {
            path,
            bytes: copied.bytes,
            costCents: 0,
            reused: true,
            buffer: copied.buffer,
          };
        } catch (copyErr) {
          console.warn(
            JSON.stringify({
              fn: 'generateCarouselSlideImage',
              warn: 'recycle_copy_failed',
              carouselId,
              idx: slide.idx,
              error: copyErr instanceof Error ? copyErr.message : String(copyErr),
            }),
          );
          // Copy failed mid-flight — surface the original rate-limit error
          // so the slide is marked failed for the same root cause.
        }
      }
    }
    throw err;
  }

  const { error: uploadError } = await supabase.storage
    .from('carousels')
    .upload(path, imageBytes, { contentType: 'image/png', upsert: true });

  if (uploadError) throw uploadError;

  const costCents = Math.round(GEMINI_BATCH_USD_PER_IMAGE * 10_000) / 100;

  // --- 3. Index the fresh image into the library for future reuse ---
  // `saveSlideImageAsset` is self-gating (only reusable strategies) and never
  // throws — a failure here just means this image won't be reusable later.
  if (reuseConfig.enabled && projectId) {
    await saveSlideImageAsset({
      supabase,
      projectId,
      brand,
      slide,
      topic: brief.topic,
      carouselId,
      sourcePath: path,
      bytes: imageBytes.length,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
    });
  }

  return { path, bytes: imageBytes.length, costCents, reused: false, buffer: imageBytes };
}

// Wraps generateImageGemini with retry-on-rate-limit and translation of
// terminal errors into CarouselSafetyBlockedError / CarouselRateLimitError.
async function generateWithRetry(prompt: string, referenceImage?: Buffer): Promise<Buffer> {
  let lastRateLimitMessage = '';

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const result = await generateImageGemini({
        prompt,
        themeColor: '#000000',
        aspectRatio: '4:5',
        ...(referenceImage ? { referenceImage } : {}),
      });
      return result.bytes;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.startsWith('gemini_no_image:')) {
        // Safety / RAI refusal: never retry — prompt needs editing.
        throw new CarouselSafetyBlockedError(message);
      }

      if (!isRateLimitMessage(message)) {
        throw err;
      }

      lastRateLimitMessage = message;

      if (attempt === RATE_LIMIT_MAX_RETRIES) break;

      const delayMs =
        RATE_LIMIT_INITIAL_BACKOFF_MS * Math.pow(RATE_LIMIT_BACKOFF_FACTOR, attempt);
      await _internal.sleep(delayMs);
    }
  }

  throw new CarouselRateLimitError(lastRateLimitMessage || 'rate_limit_exhausted');
}
