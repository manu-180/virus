import satori from 'satori';
import sharp from 'sharp';
import type { SlideSpec } from './types.js';
import type { StylePreset } from './templates.js';
import { loadFonts } from './fonts.js';

interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: (SatoriNode | string)[];
    [key: string]: unknown;
  };
}

export interface ComposeSlideArgs {
  baseImage: Buffer;
  slide: SlideSpec;
  preset: StylePreset;
}

/** Width/height of carousel slides (Instagram 4:5 ratio). */
const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;

/**
 * Compose text overlays onto a base image using Satori (HTML→SVG) and Sharp.
 *
 * The base image is resized to {@link SLIDE_WIDTH}×{@link SLIDE_HEIGHT} and the
 * text layer (headline + optional body) is composited on top.
 *
 * Returns a PNG buffer at compression level 6.
 */
export async function composeSlide(args: ComposeSlideArgs): Promise<Buffer> {
  const { baseImage, slide, preset } = args;

  const fonts = await loadFonts();
  // fonts is always non-empty (loadFonts throws otherwise)

  // Palette indices with explicit fallbacks for noUncheckedIndexedAccess
  const textColor = preset.palette[2] ?? '#FFFFFF';
  const mutedColor = preset.palette[3] ?? textColor;

  const element = buildLayout({
    slide,
    preset,
    textColor,
    mutedColor,
  });

  const svgString = await satori(
    // Satori accepts plain ReactNode-compatible objects (no JSX needed)
    element as unknown as Parameters<typeof satori>[0],
    {
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      fonts,
    },
  );

  // Sharp SVG composite — passes Buffer.from(svgString) directly; Satori sets width/height attrs
  const result = await sharp(baseImage)
    .resize(SLIDE_WIDTH, SLIDE_HEIGHT, { fit: 'cover' })
    .composite([{ input: Buffer.from(svgString), top: 0, left: 0 }])
    .png({ compressionLevel: 6 })
    .toBuffer();

  return result;
}

// ---------------------------------------------------------------------------
// Layout builder — returns a Satori-compatible element tree (plain objects).
// ---------------------------------------------------------------------------

interface LayoutArgs {
  slide: SlideSpec;
  preset: StylePreset;
  textColor: string;
  mutedColor: string;
}

function buildLayout(args: LayoutArgs): SatoriNode {
  const { slide, preset, textColor, mutedColor } = args;

  const headline = truncate(slide.headline, 80);
  const body = slide.body != null ? truncate(slide.body, 160) : null;
  const padding = preset.padding;

  const overlayBackground = resolveOverlay(preset);

  // Inner children: always headline, optionally body
  const textChildren: SatoriNode[] = [
    {
      type: 'p',
      props: {
        style: {
          fontSize: `${preset.titleSize}px`,
          fontWeight: 700,
          color: textColor,
          margin: 0,
          lineHeight: 1.2,
          wordBreak: 'break-word',
        },
        children: [headline],
      },
    },
  ];

  if (body !== null) {
    textChildren.push({
      type: 'p',
      props: {
        style: {
          fontSize: `${preset.bodySize}px`,
          fontWeight: 400,
          color: mutedColor,
          margin: 0,
          lineHeight: 1.4,
          wordBreak: 'break-word',
        },
        children: [body],
      },
    });
  }

  return {
    type: 'div',
    props: {
      style: {
        width: `${SLIDE_WIDTH}px`,
        height: `${SLIDE_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: `${padding}px`,
        background: overlayBackground,
        fontFamily: preset.fontFamily,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            },
            children: textChildren,
          },
        },
      ],
    },
  };
}

function resolveOverlay(preset: StylePreset): string {
  switch (preset.backgroundOverlay) {
    case 'gradient':
      return 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.8) 100%)';
    case 'solid': {
      // Primary color with ~80% opacity (CC hex = 204/255 ≈ 80%)
      const primary = preset.palette[0] ?? '#000000';
      return `${primary}CC`;
    }
    case 'none':
      return 'transparent';
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}
