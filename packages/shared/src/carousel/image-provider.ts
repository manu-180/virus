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

  let imageBytes: Buffer;
  try {
    const result = await generateImageGemini({
      prompt,
      themeColor: '#000000',
      aspectRatio: '4:5',
    });
    imageBytes = result.bytes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('gemini_no_image:')) {
      throw new CarouselSafetyBlockedError(message);
    }
    if (
      message.includes('429') ||
      message.toLowerCase().includes('quota') ||
      message.toLowerCase().includes('rate limit') ||
      message.toLowerCase().includes('rate_limit')
    ) {
      throw new CarouselRateLimitError(message);
    }
    throw err;
  }

  const path = `${userId}/${carouselId}/slide-${slide.idx}.png`;

  const { error: uploadError } = await supabase.storage
    .from('carousels')
    .upload(path, imageBytes, { contentType: 'image/png', upsert: true });

  if (uploadError) throw uploadError;

  const costCents = Math.round(GEMINI_BATCH_USD_PER_IMAGE * 10_000) / 100;

  return { path, bytes: imageBytes.length, costCents };
}
