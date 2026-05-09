import pLimit from 'p-limit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateCarouselSlideImage,
  type GenerateCarouselSlideImageArgs,
  type SlideImageResult,
} from './image-provider.js';
import type { CarouselBrief, SlideSpec } from './types.js';
import type { ProjectBrand } from '../viral/types.js';

const CONCURRENCY = 3;

export interface SlideSuccess extends SlideImageResult {
  idx: number;
}

export interface SlideFailed {
  idx: number;
  error: unknown;
}

export interface BatchResult {
  succeeded: SlideSuccess[];
  failed: SlideFailed[];
}

export interface GenerateAllSlideImagesArgs {
  brief: CarouselBrief;
  slides: SlideSpec[];
  brand: ProjectBrand;
  userId: string;
  carouselId: string;
  supabase: SupabaseClient;
  onSlideDone?: (idx: number, result: SlideSuccess) => Promise<void>;
}

/**
 * Generate images for all slides with bounded concurrency (max {@link CONCURRENCY} in-flight).
 *
 * Individual slide failures do NOT abort the batch — every slide is attempted.
 * The caller should inspect `failed` and decide whether to emit a failure event.
 */
export async function generateAllSlideImages(
  args: GenerateAllSlideImagesArgs,
): Promise<BatchResult> {
  const { brief, slides, brand, userId, carouselId, supabase, onSlideDone } = args;

  const limit = pLimit(CONCURRENCY);

  const results = await Promise.all(
    slides.map((slide) =>
      limit(async (): Promise<SlideSuccess | SlideFailed> => {
        try {
          const providerArgs: GenerateCarouselSlideImageArgs = {
            brief,
            slide,
            brand,
            userId,
            carouselId,
            supabase,
          };
          const result = await generateCarouselSlideImage(providerArgs);
          const success: SlideSuccess = { idx: slide.idx, ...result };
          if (onSlideDone) await onSlideDone(slide.idx, success);
          return success;
        } catch (error) {
          return { idx: slide.idx, error };
        }
      }),
    ),
  );

  const succeeded: SlideSuccess[] = [];
  const failed: SlideFailed[] = [];

  for (const r of results) {
    if ('error' in r) {
      failed.push(r as SlideFailed);
    } else {
      succeeded.push(r as SlideSuccess);
    }
  }

  return { succeeded, failed };
}
