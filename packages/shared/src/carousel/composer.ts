import satori from 'satori';
import sharp from 'sharp';
import type { SlideSpec } from './types.js';
import {
  getStyleDef,
  resolveBrandPalette,
  roleKicker,
  truncate,
  type BrandVisualColors,
  type StyleRenderContext,
} from './styles.js';
import { loadFonts } from './fonts.js';

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;

export interface ComposeSlideArgs {
  baseImage: Buffer;
  slide: SlideSpec;
  /** Resolved style key (rotation already chose it). Coerced to a known key. */
  styleKey: string;
  /** Brand name (rendered by some styles as a mark). */
  brandName?: string;
  /** Language for role eyebrow labels. */
  language?: 'es' | 'en';
  /** Total slides in the carousel (for "01 / NO. 008" treatments). */
  slideCount: number;
  /** Brand color tokens — every style renders in the brand's own colors. */
  visualColors?: BrandVisualColors;
}

/**
 * Compose a single slide's text overlay on top of its base image.
 *
 * The style is chosen by the rotation engine and passed as `styleKey`; the
 * overlay is rendered in the brand's own colors (`visualColors`). The base
 * image is unchanged — styles only affect typography, color, and layout of the
 * text overlay.
 */
export async function composeSlide(args: ComposeSlideArgs): Promise<Buffer> {
  const { baseImage, slide, styleKey, brandName, language, slideCount, visualColors } = args;

  // Defense-in-depth: refuse to compose a slide with an empty headline.
  // Otherwise Satori renders a visible overlay block with no text and the
  // slide gets marked status='ready' — a silent failure.
  if (!slide.headline || slide.headline.trim().length === 0) {
    throw new Error(`compose_empty_headline:slide-${slide.idx}`);
  }

  const fonts = await loadFonts();

  const def = getStyleDef(styleKey);
  const palette = resolveBrandPalette(visualColors);
  const ctx: StyleRenderContext = {
    slide,
    headline: truncate(slide.headline, 40),
    body: slide.body && slide.body.trim().length > 0 ? truncate(slide.body, 130) : null,
    kicker: roleKicker(slide.role, language ?? 'es'),
    brandName: (brandName ?? '').trim(),
    slideNumber: slide.idx + 1,
    slideCount,
    palette,
  };

  const element = def.render(ctx);

  const svgString = await satori(
    element as unknown as Parameters<typeof satori>[0],
    { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, fonts },
  );

  return sharp(baseImage)
    .resize(SLIDE_WIDTH, SLIDE_HEIGHT, { fit: 'cover' })
    .composite([{ input: Buffer.from(svgString), top: 0, left: 0 }])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Brand-stamp slide selection
//
// We mark exactly ONE slide per carousel as the "branded" slide. The selected
// idx flows into image generation (image-batch / regenerate-carousel-slide) so
// that single slide's Gemini prompt includes a directive to integrate the
// brand name as designed display typography in the artwork — magazine-cover
// lettering, environmental signage, etc. — rather than a post-hoc watermark.
//
// The selection has to be DETERMINISTIC per carousel because:
//  - generate-carousel-slides picks the idx once for the whole batch
//  - regenerate-carousel-slide composes a SINGLE slide on demand later, and
//    must agree with the original choice.
// ---------------------------------------------------------------------------

function hashCarouselId(carouselId: string): number {
  let h = 0;
  for (let i = 0; i < carouselId.length; i++) {
    h = (h * 31 + carouselId.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Count-based fallback: works when callers only know `slideCount` and not the
 * full role distribution. Returns `null` when there is no eligible interior slide.
 */
export function pickBrandStampIdxFromCount(slideCount: number, carouselId: string): number | null {
  if (slideCount <= 2) return null;
  const range = slideCount - 2; // exclude idx 0 and idx slideCount-1
  return 1 + (hashCarouselId(carouselId) % range);
}

/**
 * Role-aware variant: skips 'hook'/'cta'/'data' slides explicitly so the brand
 * name never lands on a number-heavy 'data' card or on the cover/closer.
 */
export function pickBrandStampIdx(
  slides: { idx: number; role: SlideSpec['role'] }[],
  carouselId: string,
): number | null {
  const eligible = slides
    .filter((s) => s.role !== 'hook' && s.role !== 'cta' && s.role !== 'data')
    .map((s) => s.idx);
  if (eligible.length === 0) {
    return pickBrandStampIdxFromCount(slides.length, carouselId);
  }
  const sorted = eligible.slice().sort((a, b) => a - b);
  return sorted[hashCarouselId(carouselId) % sorted.length] ?? null;
}
