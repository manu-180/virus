import pLimit from 'p-limit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateCarouselSlideImage,
  type GenerateCarouselSlideImageArgs,
  type SlideImageResult,
} from './image-provider.js';
import type { CarouselBrief, SlideSpec } from './types.js';
import type { BrandImageProfile, ProjectBrand } from '../viral/types.js';

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
  /**
   * When both are set, the slide whose idx matches `brandStampIdx` gets
   * `brandTypography: { brandName }` passed to the image provider — i.e. that
   * single slide will instruct Gemini to integrate the brand name as designed
   * typography in the artwork. Picked deterministically per-carousel by
   * `pickBrandStampIdx` so regenerate-carousel-slide produces a stable match.
   */
  brandName?: string;
  brandStampIdx?: number | null;
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
  /** Allow the provider to serve this slide from the reusable image library. */
  allowReuse?: boolean;
  /** When set, ask Gemini to bake this brand name into the artwork as typography. */
  brandTypography?: { brandName: string };
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
      ...(args.allowReuse ? { allowReuse: true } : {}),
      ...(args.brandTypography ? { brandTypography: args.brandTypography } : {}),
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
 * Resolve whether a given slide idx should receive brand-typography treatment.
 * Returns the brandTypography payload (or undefined) so call sites can spread
 * it conditionally without repeating the validation logic.
 */
function brandTypographyForIdx(
  idx: number,
  brandStampIdx: number | null | undefined,
  brandName: string | undefined,
): { brandName: string } | undefined {
  if (brandStampIdx == null || idx !== brandStampIdx) return undefined;
  if (!brandName || brandName.trim().length === 0) return undefined;
  return { brandName: brandName.trim() };
}

/**
 * Resolve the effective subject strategy for this brand. Brands without an
 * imageProfile fall back to `character-anchor` to preserve the pre-refactor
 * behavior (single shared character across all slides via image-to-image).
 */
function resolveStrategy(brand: ProjectBrand): BrandImageProfile['subjectStrategy'] {
  return brand.visualStyle?.imageProfile?.subjectStrategy ?? 'character-anchor';
}

/**
 * Generate images for all slides.
 *
 * Two strategies based on the brand's `imageProfile.subjectStrategy`:
 *
 * **`character-anchor` (default / back-compat)** — "anchor-first chaining."
 * The slide tagged `role: 'hook'` is generated FIRST, alone. Its bytes become
 * the reference image passed to every subsequent slide via image-to-image, so
 * the whole carousel reads as one continuous visual story (same character,
 * same setting, same palette). Good for personal brands and photographic
 * carousels. **This is the pre-refactor behavior.**
 *
 * **`world-anchor` (new, for tech/SaaS brands like APEX)** — independent
 * generation with shared world description. NO image-to-image chaining: every
 * slide is generated in parallel with its own strong text prompt that anchors
 * the same palette + lighting + technique. Each slide depicts a DIFFERENT
 * subject (drawn from the brand's per-role subjectLibrary) so the carousel
 * never feels like 8 photos of the same person. Failure-isolated by design:
 * if one slide fails, the rest are unaffected.
 *
 * **`standalone`** — same as world-anchor but without ordering constraints.
 *
 * Failure semantics:
 *  - `character-anchor`: anchor failure degrades to text-only mode for the
 *    rest (no reference image), so partial carousels still ship.
 *  - `world-anchor` / `standalone`: per-slide failures are independent.
 */
export async function generateAllSlideImages(
  args: GenerateAllSlideImagesArgs,
): Promise<BatchResult> {
  const { brief, slides, brand, userId, carouselId, supabase, onSlideDone, brandName, brandStampIdx } = args;

  if (slides.length === 0) return { succeeded: [], failed: [] };

  const strategy = resolveStrategy(brand);
  if (strategy !== 'character-anchor') {
    return generateAllSlideImagesIndependent({
      brief,
      slides,
      brand,
      userId,
      carouselId,
      supabase,
      ...(onSlideDone ? { onSlideDone } : {}),
      ...(brandName ? { brandName } : {}),
      ...(brandStampIdx != null ? { brandStampIdx } : {}),
    });
  }

  return generateAllSlideImagesAnchorChain({
    brief,
    slides,
    brand,
    userId,
    carouselId,
    supabase,
    ...(onSlideDone ? { onSlideDone } : {}),
    ...(brandName ? { brandName } : {}),
    ...(brandStampIdx != null ? { brandStampIdx } : {}),
  });
}

// ---------------------------------------------------------------------------
// Anchor-chain strategy (legacy, personal-brand / photo carousels)
// ---------------------------------------------------------------------------

async function generateAllSlideImagesAnchorChain(
  args: GenerateAllSlideImagesArgs,
): Promise<BatchResult> {
  const { brief, slides, brand, userId, carouselId, supabase, onSlideDone, brandName, brandStampIdx } = args;

  const anchor = pickAnchor(slides);
  const rest = anchor ? slides.filter((s) => s.idx !== anchor.idx) : slides;

  const succeeded: SlideSuccessInternal[] = [];
  const failed: SlideFailed[] = [];

  // -------------------------------------------------------------------------
  // Step 1: generate the anchor alone so we can capture its bytes.
  // -------------------------------------------------------------------------
  // Note: the brand-stamp idx is picked role-aware to land OUTSIDE the anchor
  // (hooks are excluded), so in practice the anchor never receives
  // brandTypography. We still resolve it here so the type checks line up.
  let referenceImage: Buffer | undefined;
  if (anchor) {
    const anchorTypography = brandTypographyForIdx(anchor.idx, brandStampIdx, brandName);
    const anchorResult = await generateOne({
      slide: anchor,
      brief,
      brand,
      userId,
      carouselId,
      supabase,
      // anchor itself never uses a reference
      ...(onSlideDone ? { onSlideDone } : {}),
      ...(anchorTypography ? { brandTypography: anchorTypography } : {}),
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
  //
  // Brand-typography slides get the directive but ALSO skip the reference
  // image: chaining a typography-heavy slide off the anchor would force the
  // model to graft text onto a clean photo (back to "stamp" territory). Letting
  // the typography slide regenerate purely from text gives Gemini room to
  // compose the lettering into the scene from scratch.
  // -------------------------------------------------------------------------
  const limit = pLimit(CONCURRENCY);

  const restResults = await Promise.all(
    rest.map((slide) =>
      limit(() => {
        const typography = brandTypographyForIdx(slide.idx, brandStampIdx, brandName);
        // Narrow `referenceImage` into a local that's either Buffer or absent.
        // exactOptionalPropertyTypes refuses to accept `Buffer | undefined`
        // through a spread, so we guard the spread on the narrowed local.
        const effectiveReference = !typography && referenceImage ? referenceImage : undefined;
        return generateOne({
          slide,
          brief,
          brand,
          userId,
          carouselId,
          supabase,
          ...(effectiveReference ? { referenceImage: effectiveReference } : {}),
          ...(onSlideDone ? { onSlideDone } : {}),
          ...(typography ? { brandTypography: typography } : {}),
        });
      }),
    ),
  );

  for (const r of restResults) {
    if ('error' in r) {
      failed.push(r);
    } else {
      succeeded.push(r);
    }
  }

  return {
    succeeded: succeeded.map(stripBuffer),
    failed,
  };
}

// ---------------------------------------------------------------------------
// Independent strategy (world-anchor / standalone, tech-SaaS brands)
// ---------------------------------------------------------------------------

/**
 * All slides generated in parallel with shared CONCURRENCY. No reference image
 * is ever passed — each slide is fully described by its text prompt + the
 * brand's imageProfile (technique, composition, palette, mood, negatives).
 *
 * This is the path APEX uses. The "story" of the carousel emerges from the
 * sequence of distinct subjects (each pulled from the brand's role-specific
 * subjectLibrary) sharing one visual world.
 */
async function generateAllSlideImagesIndependent(
  args: GenerateAllSlideImagesArgs,
): Promise<BatchResult> {
  const { brief, slides, brand, userId, carouselId, supabase, onSlideDone, brandName, brandStampIdx } = args;

  const succeeded: SlideSuccessInternal[] = [];
  const failed: SlideFailed[] = [];
  const limit = pLimit(CONCURRENCY);

  const results = await Promise.all(
    slides.map((slide) =>
      limit(() => {
        const typography = brandTypographyForIdx(slide.idx, brandStampIdx, brandName);
        return generateOne({
          slide,
          brief,
          brand,
          userId,
          carouselId,
          supabase,
          // No referenceImage — independent generation. Reuse IS allowed for
          // ordinary slides (world-anchor / standalone slides are self-described
          // and travel safely across carousels). The brand-typography slide
          // skips reuse and library-indexing inside generateCarouselSlideImage.
          allowReuse: true,
          ...(onSlideDone ? { onSlideDone } : {}),
          ...(typography ? { brandTypography: typography } : {}),
        });
      }),
    ),
  );

  for (const r of results) {
    if ('error' in r) failed.push(r);
    else succeeded.push(r);
  }

  return {
    succeeded: succeeded.map(stripBuffer),
    failed,
  };
}
