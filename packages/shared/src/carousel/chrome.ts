// ---------------------------------------------------------------------------
// Carousel "chrome" — premium finishing layers applied UNIFORMLY to every
// slide by the composer, on top of (and under) the per-style overlay.
//
// Why a separate layer instead of editing the 13 styles:
//   - One consistent treatment across the whole feed (research: consistency
//     reads premium; inconsistency reads cheap).
//   - The 13 style render fns stay focused on typography/layout and keep
//     working untouched.
//   - Cheap: the two texture layers (vignette + grain) are static, generated
//     ONCE and cached as raw buffers; only the tiny progress/swipe overlay is
//     rendered per slide.
//
// Composite order in the composer (bottom → top):
//   base image → VIGNETTE → style overlay → CHROME (progress + swipe) → GRAIN
//
// Design rules come from the 2026 premium-carousel research:
//   - subtle vignette for depth + edge legibility (radial darkening)
//   - fine film grain at ~4% for tactile warmth without looking dated
//   - a thin segmented progress bar (position + total) — reduces abandonment
//     and is distinct from IG's native dots (so it doesn't duplicate them)
//   - a single, restrained swipe cue on the cover only (never spammed)
// ---------------------------------------------------------------------------

import satori from 'satori';
import sharp from 'sharp';
import type { LoadedFont } from './fonts.js';
import { rgba, type BrandPalette, type SatoriNode } from './styles.js';

const W = 1080;
const H = 1350;
const PAD = 84;

// ---------------------------------------------------------------------------
// Vignette (cached) — radial darkening toward the edges/corners. Focus point
// sits slightly above center (where subjects usually are) so the darkening
// frames the composition and improves legibility of overlay text near the
// margins. Pure raw-buffer math → deterministic, no Satori dependency.
// ---------------------------------------------------------------------------

let vignetteCache: Buffer | null = null;

export async function getVignetteBuffer(): Promise<Buffer> {
  if (vignetteCache) return vignetteCache;
  const cx = W / 2;
  const cy = H * 0.42;
  const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  const inner = 0.52; // no darkening within this fraction of the radius
  const maxAlpha = 0.32; // corner darkness
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxR;
      let t = (d - inner) / (1 - inner);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const a = Math.round(t * t * maxAlpha * 255); // ease-in
      const i = (y * W + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = a;
    }
  }
  vignetteCache = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toBuffer();
  return vignetteCache;
}

// ---------------------------------------------------------------------------
// Grain (cached) — fine monochrome noise at low opacity. Centered around mid-
// gray so it adds texture without shifting overall luminance. One cached tile
// shared across slides (imperceptible repetition across separate posts).
// ---------------------------------------------------------------------------

let grainCache: Buffer | null = null;

export async function getGrainBuffer(): Promise<Buffer> {
  if (grainCache) return grainCache;
  const data = Buffer.alloc(W * H * 4);
  const ALPHA = 12; // ~4.7% — subtle
  for (let p = 0; p < W * H; p++) {
    // Deterministic-enough hash noise (avoids depending on Math.random for
    // reproducibility); decorrelated per pixel.
    const n = (p * 1103515245 + 12345) & 0x7fffffff;
    const v = (n >> 7) & 0xff;
    const i = p * 4;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = ALPHA;
  }
  grainCache = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toBuffer();
  return grainCache;
}

// ---------------------------------------------------------------------------
// Progress + swipe overlay (per slide, rendered with Satori)
// ---------------------------------------------------------------------------

function node(
  type: string,
  style: Record<string, unknown>,
  children?: (SatoriNode | string)[],
): SatoriNode {
  return { type, props: { style: { display: 'flex', ...style }, children: children ?? [] } };
}
function row(style: Record<string, unknown>, children: (SatoriNode | string)[]): SatoriNode {
  return node('div', { flexDirection: 'row', ...style }, children);
}
function box(style: Record<string, unknown>): SatoriNode {
  return node('div', style, []);
}
function text(content: string, style: Record<string, unknown>): SatoriNode {
  return node('div', style, [content]);
}

const SWIPE_LABEL: Record<'es' | 'en', string> = {
  es: 'Deslizá',
  en: 'Swipe',
};

function buildChromeNode(
  slideNumber: number,
  slideCount: number,
  p: BrandPalette,
  language: 'es' | 'en',
): SatoriNode {
  const children: (SatoriNode | string)[] = [];

  // ── Segmented progress bar (top, inset by PAD) ─────────────────────────
  // A faint pill backdrop guarantees the segments read on light OR dark
  // imagery (the bar sits over the raw photo at the top of the slide).
  const segs: SatoriNode[] = [];
  for (let i = 0; i < slideCount; i++) {
    segs.push(
      box({
        flexGrow: 1,
        height: 6,
        borderRadius: 999,
        backgroundColor: i < slideNumber ? p.accent : rgba('#FFFFFF', 0.42),
        ...(i < slideCount - 1 ? { marginRight: 7 } : {}),
      }),
    );
  }
  children.push(
    row({ position: 'absolute', top: 24, left: PAD, right: PAD }, [
      row(
        {
          flexGrow: 1,
          backgroundColor: rgba('#000000', 0.18),
          borderRadius: 999,
          padding: 4,
          alignItems: 'center',
        },
        segs,
      ),
    ]),
  );

  // ── Swipe cue (cover only) ─────────────────────────────────────────────
  // One restrained hint, bottom-right, in a micro-pill so it's legible over
  // any background. Never shown past slide 1.
  if (slideNumber === 1 && slideCount > 1) {
    children.push(
      row(
        {
          position: 'absolute',
          right: PAD,
          bottom: 34,
          alignItems: 'center',
          backgroundColor: rgba('#000000', 0.4),
          borderRadius: 999,
          padding: '10px 18px',
        },
        [
          text(SWIPE_LABEL[language] ?? SWIPE_LABEL.es, {
            fontFamily: 'Inter',
            fontSize: 21,
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '0.04em',
            marginRight: 10,
          }),
          text('→', { fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: p.accent }),
        ],
      ),
    );
  }

  return node(
    'div',
    { position: 'relative', width: W, height: H, flexDirection: 'column' },
    children,
  );
}

/**
 * Render the per-slide chrome overlay (progress bar + cover swipe cue) to a
 * transparent PNG buffer sized exactly W×H, ready to composite on top of the
 * style overlay.
 */
export async function renderChromeOverlay(opts: {
  slideNumber: number;
  slideCount: number;
  palette: BrandPalette;
  language: 'es' | 'en';
  fonts: LoadedFont[];
}): Promise<Buffer> {
  const node = buildChromeNode(opts.slideNumber, opts.slideCount, opts.palette, opts.language);
  const svg = await satori(node as unknown as Parameters<typeof satori>[0], {
    width: W,
    height: H,
    fonts: opts.fonts as unknown as Parameters<typeof satori>[1]['fonts'],
  });
  return sharp(Buffer.from(svg)).resize(W, H, { fit: 'fill' }).png().toBuffer();
}
