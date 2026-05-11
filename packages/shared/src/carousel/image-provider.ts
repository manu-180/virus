import type { SupabaseClient } from '@supabase/supabase-js';
import { generateImageGemini } from '../visuals/providers/gemini.js';
import { GEMINI_BATCH_USD_PER_IMAGE } from './cost.js';
import { buildVisualPrompt } from './prompts.js';
import type { CarouselBrief, SlideSpec } from './types.js';
import type { ProjectBrand } from '../viral/types.js';

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
}

export interface SlideImageResult {
  path: string;
  bytes: number;
  costCents: number;
}

/**
 * Generate a single 4:5 carousel slide image with Gemini and upload it to the
 * `carousels` Storage bucket at `{userId}/{carouselId}/slide-{idx}.png`.
 *
 * Throws {@link CarouselSafetyBlockedError} on RAI policy refusals (Inngest
 * should NOT retry — the brief needs editing).
 * Throws {@link CarouselRateLimitError} on quota/rate-limit errors (Inngest
 * should retry with exponential back-off).
 */
export async function generateCarouselSlideImage(
  args: GenerateCarouselSlideImageArgs,
): Promise<SlideImageResult> {
  const { brief, slide, brand, userId, carouselId, supabase } = args;

  const prompt = buildVisualPrompt(slide, brief.stylePreset, brand);

  const imageBytes = await generateWithRetry(prompt);

  const path = `${userId}/${carouselId}/slide-${slide.idx}.png`;

  const { error: uploadError } = await supabase.storage
    .from('carousels')
    .upload(path, imageBytes, { contentType: 'image/png', upsert: true });

  if (uploadError) throw uploadError;

  const costCents = Math.round(GEMINI_BATCH_USD_PER_IMAGE * 10_000) / 100;

  return { path, bytes: imageBytes.length, costCents };
}

// Wraps generateImageGemini with retry-on-rate-limit and translation of
// terminal errors into CarouselSafetyBlockedError / CarouselRateLimitError.
async function generateWithRetry(prompt: string): Promise<Buffer> {
  let lastRateLimitMessage = '';

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const result = await generateImageGemini({
        prompt,
        themeColor: '#000000',
        aspectRatio: '4:5',
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
