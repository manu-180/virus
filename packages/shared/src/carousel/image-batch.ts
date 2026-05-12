import pLimit from 'p-limit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateCarouselSlideImage,
  type GenerateCarouselSlideImageArgs,
  type SlideImageResult,
} from './image-provider.js';
import type { CarouselBrief, SlideSpec } from './types.js';
import type { ProjectBrand } from '../viral/types.js';

// Concurrency for the non-anchor slides. The anchor (slide 0) is always
// generated alone before any other slide so its output can become the reference
// image for everything that follows. Once the anchor is in hand, we burst the
// remaining slides at this concurrency.
//
// Kept intentionally conservative to stay within Gemini's image generation
// quota (free tier ~5 RPM; paid is higher but still bursty). Combined with
// retry/backoff in image-provider, this keeps full carousels flowing without
// tripping 429s on most accounts.
const CONCURRENCY = 2;

/**
 * Public success shape returned from the batch. Note: we explicitly Omit
 * `buffer` from {@link SlideImageResult} — the buffer is an internal detail
 * used to chain slide-0 → slide-N via image-to-image, and never escapes the
 * batch boundary. Keeping it out of the public type is critical because the
 * Inngest worker passes this through `step.run`, and step results are
 * JSON-serialized — Buffers don't round-trip cleanly through JSON.
 */
export interface SlideSuccess extends Omit<SlideImageResult, 'buffer'> {
  idx: number;
}

// Internal variant carried inside the batch. Has the buffer; never returned.
interface SlideSuccessInternal extends SlideImageResult {
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

// Identify the slide that should act as the visual anchor. Prefer the slide
// explicitly tagged 'hook' (the cinematic opener); fall back to idx === 0 if
// the LLM didn't tag any slide as hook (legacy carousels, or edge cases).
function pickAnchor(slides: SlideSpec[]): SlideSpec | undefined {
  const hook = slides.find((s) => s.role === 'hook');
  if (hook) return hook;
  return slides.find((s) => s.idx === 0) ?? slides[0];
}

// Strip the in-memory buffer from a SlideSuccessInternal before handing it to
// user callbacks or returning it. The buffer is an internal detail used only
// to chain slide-0 → slide-N image-to-image; leaking it would balloon memory
// downstream (each slide is tens to hundreds of KB) and break JSON
// serialization across the Inngest step boundary.
function stripBuffer(s: SlideSuccessInternal): SlideSuccess {
  const { buffer: _drop, ...rest } = s;
  void _drop;
  return rest;
}

interface GenerateOneArgs {
  slide: SlideSpec;
  brief: CarouselBrief;
  brand: ProjectBrand;
  userId: string;
  carouselId: string;
  supabase: SupabaseClient;
  referenceImage?: Buffer;
  onSlideDone?: (idx: number, result: SlideSuccess) => Promise<void>;
}

async function generateOne(args: GenerateOneArgs): Promise<SlideSuccessInternal | SlideFailed> {
  try {
    const providerArgs: GenerateCarouselSlideImageArgs = {
      brief: args.brief,
      slide: args.slide,
      brand: args.brand,
      userId: args.userId,
      carouselId: args.carouselId,
      supabase: args.supabase,
      ...(args.referenceImage ? { referenceImage: args.referenceImage } : {}),
    };
    const result = await generateCarouselSlideImage(providerArgs);
    const success: SlideSuccessInternal = { idx: args.slide.idx, ...result };
    if (args.onSlideDone) await args.onSlideDone(args.slide.idx, stripBuffer(success));
    return success;
  } catch (error) {
    return { idx: args.slide.idx, error };
  }
}

/**
 * Generate images for all slides.
 *
 * Strategy: **anchor-first chaining.** The slide tagged `role: 'hook'` (or
 * idx 0 as fallback) is generated FIRST, alone. Its image bytes become the
 * reference image passed to every subsequent slide via image-to-image, so the
 * whole carousel reads as one continuous visual story (same character, same
 * setting, same palette) instead of N independent images.
 *
 * Failure semantics: individual slide failures do NOT abort the batch. If the
 * anchor itself fails, we degrade gracefully — every remaining slide is
 * generated in pure text-to-image mode (no reference) so the user still gets a
 * carousel, just without the visual continuity bonus.
 */
export async function generateAllSlideImages(
  args: GenerateAllSlideImagesArgs,
): Promise<BatchResult> {
  const { brief, slides, brand, userId, carouselId, supabase, onSlideDone } = args;

  if (slides.length === 0) return { succeeded: [], failed: [] };

  const anchor = pickAnchor(slides);
  const rest = anchor ? slides.filter((s) => s.idx !== anchor.idx) : slides;

  const succeeded: SlideSuccessInternal[] = [];
  const failed: SlideFailed[] = [];

  // -------------------------------------------------------------------------
  // Step 1: generate the anchor alone so we can capture its bytes.
  // -------------------------------------------------------------------------
  let referenceImage: Buffer | undefined;
  if (anchor) {
    const anchorResult = await generateOne({
      slide: anchor,
      brief,
      brand,
      userId,
      carouselId,
      supabase,
      // anchor itself never uses a reference
      ...(onSlideDone ? { onSlideDone } : {}),
    });

    if ('error' in anchorResult) {
      // Anchor failed: degrade to flat parallel mode. We still attempt the
      // remaining slides so the user gets a partial carousel.
      failed.push(anchorResult);
    } else {
      succeeded.push(anchorResult);
      referenceImage = anchorResult.buffer;
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: burst the remaining slides in parallel. If we have a reference
  // image from the anchor, every call goes image-to-image with that anchor;
  // otherwise we fall back to pure text-to-image.
  // -------------------------------------------------------------------------
  const limit = pLimit(CONCURRENCY);

  const restResults = await Promise.all(
    rest.map((slide) =>
      limit(() =>
        generateOne({
          slide,
          brief,
          brand,
          userId,
          carouselId,
          supabase,
          ...(referenceImage ? { referenceImage } : {}),
          ...(onSlideDone ? { onSlideDone } : {}),
        }),
      ),
    ),
  );

  for (const r of restResults) {
    if ('error' in r) {
      failed.push(r);
    } else {
      succeeded.push(r);
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: scrub buffers from the returned successes — they were only used
  // internally for the anchor → rest chain.
  // -------------------------------------------------------------------------
  return {
    succeeded: succeeded.map(stripBuffer),
    failed,
  };
}
