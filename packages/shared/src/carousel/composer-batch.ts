import pLimit from 'p-limit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { composeSlide } from './composer.js';
import type { SlideSpec } from './types.js';
import type { BrandVisualColors } from './styles.js';

const CONCURRENCY = 3;

export interface ComposeSuccess {
  idx: number;
  path: string;
  bytes: number;
}

export interface ComposeFailed {
  idx: number;
  error: unknown;
}

export interface ComposeBatchResult {
  succeeded: ComposeSuccess[];
  failed: ComposeFailed[];
}

export interface SlideToCompose {
  idx: number;
  spec: SlideSpec;
  /** Storage path in the 'carousels' bucket, e.g. `{userId}/{carouselId}/slide-{idx}.png` */
  baseImagePath: string;
}

export interface ComposeAllSlidesArgs {
  slides: SlideToCompose[];
  /** Resolved style key chosen by the rotation engine. */
  styleKey: string;
  /** Brand name (rendered by some styles as a mark). */
  brandName?: string;
  /** Language for role eyebrow labels. */
  language?: 'es' | 'en';
  /** Total slides in the carousel. */
  slideCount: number;
  /** Brand color tokens — styles render in the brand's own colors. */
  visualColors?: BrandVisualColors;
  userId: string;
  carouselId: string;
  supabase: SupabaseClient;
  onSlideDone?: (idx: number, result: ComposeSuccess) => Promise<void>;
}

/**
 * Compose text overlays for all slides with bounded concurrency (max {@link CONCURRENCY} in-flight).
 *
 * Downloads base images from Supabase Storage, composites overlays via {@link composeSlide},
 * and uploads composed PNGs back to storage at `{userId}/{carouselId}/composed-{idx}.png`.
 *
 * Individual slide failures do NOT abort the batch — every slide is attempted.
 */
export async function composeAllSlides(args: ComposeAllSlidesArgs): Promise<ComposeBatchResult> {
  const { slides, styleKey, brandName, language, slideCount, visualColors, userId, carouselId, supabase, onSlideDone } = args;

  const limit = pLimit(CONCURRENCY);

  const results = await Promise.all(
    slides.map((slide) =>
      limit(async (): Promise<ComposeSuccess | ComposeFailed> => {
        try {
          // Download base image from storage
          const { data, error } = await supabase.storage
            .from('carousels')
            .download(slide.baseImagePath);

          if (error) throw error;
          if (!data) throw new Error(`No data for path: ${slide.baseImagePath}`);

          const baseImage = Buffer.from(await data.arrayBuffer());

          // Compose text overlay
          const composed = await composeSlide({
            baseImage,
            slide: slide.spec,
            styleKey,
            slideCount,
            ...(brandName ? { brandName } : {}),
            ...(language ? { language } : {}),
            ...(visualColors ? { visualColors } : {}),
          });

          // Upload composed image
          const composedPath = `${userId}/${carouselId}/composed-${slide.idx}.png`;

          const { error: uploadError } = await supabase.storage
            .from('carousels')
            .upload(composedPath, composed, {
              contentType: 'image/png',
              upsert: true,
            });

          if (uploadError) throw uploadError;

          const result: ComposeSuccess = {
            idx: slide.idx,
            path: composedPath,
            bytes: composed.length,
          };

          if (onSlideDone) await onSlideDone(slide.idx, result);

          return result;
        } catch (error) {
          return { idx: slide.idx, error };
        }
      }),
    ),
  );

  const succeeded: ComposeSuccess[] = [];
  const failed: ComposeFailed[] = [];

  for (const r of results) {
    if ('error' in r) {
      failed.push(r as ComposeFailed);
    } else {
      succeeded.push(r as ComposeSuccess);
    }
  }

  return { succeeded, failed };
}
