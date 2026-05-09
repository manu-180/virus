import satori from 'satori';
import sharp from 'sharp';
import type { SlideSpec } from './types.js';
import type { StylePreset } from './templates.js';
import { getLayoutForRole } from './templates.js';
import type { LayoutOverrides } from './templates.js';
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

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;

export async function composeSlide(args: ComposeSlideArgs): Promise<Buffer> {
  const { baseImage, slide, preset } = args;

  const fonts = await loadFonts();
  const overrides = getLayoutForRole(slide.role, preset, slide.body);

  const element = buildLayout({ slide, preset, overrides });

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
// Overlay resolver
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function resolveOverlay(preset: StylePreset): string {
  const c = hexToRgba(preset.overlayColor, preset.overlayOpacity);
  const t = hexToRgba(preset.overlayColor, 0);

  switch (preset.overlayStyle) {
    case 'gradient-bottom':
      // opaque at bottom, transparent at top
      return `linear-gradient(to top, ${c} 0%, ${t} 70%)`;

    case 'gradient-top':
      // opaque at top, transparent at bottom
      return `linear-gradient(to bottom, ${c} 0%, ${t} 70%)`;

    case 'gradient-both':
      // opaque at top, transparent in middle, opaque at bottom — for editorial readability
      return `linear-gradient(to bottom, ${c} 0%, ${t} 45%, ${t} 55%, ${c} 100%)`;

    case 'solid-bottom':
      // hard split: solid on bottom 55%, transparent above
      return `linear-gradient(to top, ${c} 0%, ${c} 55%, ${t} 55.1%)`;

    case 'none':
      return 'transparent';
  }
}

// ---------------------------------------------------------------------------
// Layout builder
// ---------------------------------------------------------------------------

interface LayoutArgs {
  slide: SlideSpec;
  preset: StylePreset;
  overrides: LayoutOverrides;
}

function buildLayout({ slide, preset, overrides }: LayoutArgs): SatoriNode {
  const { layoutStyle } = preset;

  if (layoutStyle === 'editorial') return buildEditorialLayout({ slide, preset, overrides });
  if (layoutStyle === 'center-stack') return buildCenterStackLayout({ slide, preset, overrides });
  return buildBottomStackLayout({ slide, preset, overrides });
}

// ---------------------------------------------------------------------------
// bottom-stack (minimal) — eyebrow at top, title+body flush bottom
// ---------------------------------------------------------------------------

function buildBottomStackLayout({ slide, preset, overrides }: LayoutArgs): SatoriNode {
  const p = preset.padding;
  const titleSize = Math.round(preset.titleSize * overrides.titleSizeMultiplier);
  const headline = applyCase(truncate(slide.headline, 60), preset.titleUppercase);
  const body = resolveBody(slide.body, overrides);

  const eyebrow = overrides.showEyebrow ? buildEyebrowChip(slide.role, preset) : emptyDiv();
  const titleEl = buildTitleEl(headline, titleSize, preset, overrides);
  const textBlock = buildTextBlock(titleEl, body, preset, overrides);

  return {
    type: 'div',
    props: {
      style: {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: p,
        background: resolveOverlay(preset),
        fontFamily: preset.bodyFont,
      },
      children: [eyebrow, textBlock],
    },
  };
}

// ---------------------------------------------------------------------------
// center-stack (bold) — solid bottom overlay, content centered within it
// ---------------------------------------------------------------------------

function buildCenterStackLayout({ slide, preset, overrides }: LayoutArgs): SatoriNode {
  const p = preset.padding;
  const titleSize = Math.round(preset.titleSize * overrides.titleSizeMultiplier);
  const headline = applyCase(truncate(slide.headline, 60), preset.titleUppercase);
  const body = resolveBody(slide.body, overrides);

  const titleEl = buildTitleEl(headline, titleSize, preset, overrides);
  const textBlock = buildTextBlock(titleEl, body, preset, overrides);

  return {
    type: 'div',
    props: {
      style: {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: p,
        background: resolveOverlay(preset),
        fontFamily: preset.bodyFont,
      },
      children: [textBlock],
    },
  };
}

// ---------------------------------------------------------------------------
// editorial — header row (eyebrow + slide number) + title+body at bottom
// ---------------------------------------------------------------------------

function buildEditorialLayout({ slide, preset, overrides }: LayoutArgs): SatoriNode {
  const p = preset.padding;
  const titleSize = Math.round(preset.titleSize * overrides.titleSizeMultiplier);
  const headline = applyCase(truncate(slide.headline, 60), preset.titleUppercase);
  const body = resolveBody(slide.body, overrides);

  const slideNum = String(slide.idx + 1).padStart(2, '0');

  const header: SatoriNode = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      },
      children: [
        // Eyebrow — italic-style label in accent color
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '18px',
              fontWeight: 400,
              fontStyle: 'italic',
              color: preset.accentColor,
              fontFamily: preset.titleFont,
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
            },
            children: [slide.role],
          },
        },
        // Slide number — large, accent color
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '96px',
              fontWeight: preset.titleWeight,
              color: preset.accentColor,
              fontFamily: preset.titleFont,
              lineHeight: 0.9,
              opacity: 0.35,
            },
            children: [slideNum],
          },
        },
      ],
    },
  };

  const titleEl = buildTitleEl(headline, titleSize, preset, overrides);
  const textBlock = buildTextBlock(titleEl, body, preset, overrides);

  return {
    type: 'div',
    props: {
      style: {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: p,
        background: resolveOverlay(preset),
        fontFamily: preset.bodyFont,
      },
      children: [header, textBlock],
    },
  };
}

// ---------------------------------------------------------------------------
// Shared element builders
// ---------------------------------------------------------------------------

function buildEyebrowChip(role: SlideSpec['role'], preset: StylePreset): SatoriNode {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignSelf: 'flex-start' as const,
        backgroundColor: preset.accentColor,
        color: '#FFFFFF',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '14px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
      },
      children: [role],
    },
  };
}

function buildTitleEl(
  headline: string,
  titleSize: number,
  preset: StylePreset,
  overrides: LayoutOverrides,
): SatoriNode {
  const titleText: SatoriNode = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        fontSize: titleSize,
        fontWeight: preset.titleWeight,
        color: preset.textColor,
        lineHeight: preset.titleLineHeight,
        fontFamily: preset.titleFont,
        wordBreak: 'break-word',
      },
      children: [headline],
    },
  };

  if (overrides.showArrow) {
    return {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '20px',
        },
        children: [
          titleText,
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontSize: titleSize,
                fontWeight: preset.titleWeight,
                color: preset.accentColor,
                fontFamily: preset.titleFont,
                flexShrink: 0,
              },
              children: ['→'],
            },
          },
        ],
      },
    };
  }

  return titleText;
}

function buildTextBlock(
  titleEl: SatoriNode,
  body: string | null,
  preset: StylePreset,
  overrides: LayoutOverrides,
): SatoriNode {
  const children: SatoriNode[] = [];

  // Big number (data role) — rendered prominently above the title
  if (overrides.bigNumber !== null) {
    children.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          fontSize: 200,
          fontWeight: preset.titleWeight,
          color: preset.accentColor,
          fontFamily: preset.titleFont,
          lineHeight: 0.9,
          letterSpacing: '-0.02em',
        },
        children: [overrides.bigNumber],
      },
    });
  }

  children.push(titleEl);

  if (body !== null) {
    children.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          fontSize: preset.bodySize,
          fontWeight: preset.bodyWeight,
          color: preset.bodyColor,
          lineHeight: preset.bodyLineHeight,
          fontFamily: preset.bodyFont,
          wordBreak: 'break-word',
          marginTop: '16px',
        },
        children: [body],
      },
    });
  }

  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveBody(body: string | undefined, overrides: LayoutOverrides): string | null {
  if (overrides.bodyHidden || body == null) return null;
  return truncate(body, 160);
}

function applyCase(text: string, uppercase: boolean): string {
  return uppercase ? text.toUpperCase() : text;
}

function emptyDiv(): SatoriNode {
  return { type: 'div', props: { style: { display: 'flex' }, children: [] } };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}
