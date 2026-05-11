// ---------------------------------------------------------------------------
// Style presets for carousel overlay composer.
// Consumed by composer.ts to drive Satori layout tokens.
// ---------------------------------------------------------------------------

import type { SlideSpec } from './types.js';

export interface StylePreset {
  // Overlay
  overlayColor: string;
  overlayOpacity: number;
  overlayStyle: 'gradient-bottom' | 'gradient-top' | 'gradient-both' | 'solid-bottom' | 'none';

  // Text colors
  textColor: string;
  bodyColor: string;
  accentColor: string;

  // Title typography
  titleFont: string;
  titleWeight: number;
  titleSize: number;
  titleLineHeight: number;
  titleUppercase: boolean;

  // Body typography
  bodyFont: string;
  bodyWeight: number;
  bodySize: number;
  bodyLineHeight: number;

  // Layout
  padding: number;
  layoutStyle: 'bottom-stack' | 'center-stack' | 'editorial';
}

// ---------------------------------------------------------------------------
// Role-aware layout overrides
// ---------------------------------------------------------------------------

export interface LayoutOverrides {
  titleSizeMultiplier: number;
  bodyHidden: boolean;
  bigNumber: string | null;
  showArrow: boolean;
  showEyebrow: boolean;
}

function extractBigNumber(body: string): string | null {
  const m = body.match(/^(\d+(?:[.,]\d+)?\s*[%x×])/i);
  return m ? (m[1] ?? '').trim() || null : null;
}

export function getLayoutForRole(
  role: SlideSpec['role'],
  _preset: StylePreset,
  body?: string,
): LayoutOverrides {
  switch (role) {
    case 'hook':
      return { titleSizeMultiplier: 1.15, bodyHidden: false, bigNumber: null, showArrow: false, showEyebrow: true };

    case 'data': {
      const bigNumber = body != null ? extractBigNumber(body) : null;
      return { titleSizeMultiplier: 1.0, bodyHidden: bigNumber !== null, bigNumber, showArrow: false, showEyebrow: false };
    }

    case 'cta':
      return { titleSizeMultiplier: 1.0, bodyHidden: false, bigNumber: null, showArrow: true, showEyebrow: false };

    default:
      return { titleSizeMultiplier: 1.0, bodyHidden: false, bigNumber: null, showArrow: false, showEyebrow: false };
  }
}

// ---------------------------------------------------------------------------
// The 3 curated presets
// ---------------------------------------------------------------------------

/**
 * Merges brand-level visual identity into a base preset.
 * Only fields explicitly set in visualStyle override the preset — everything else
 * falls back to the preset's defaults, so partial configs work correctly.
 */
export function applyBrandOverrides(
  preset: StylePreset,
  visualStyle: {
    textColor?: string;
    bodyColor?: string;
    accentColor?: string;
    backgroundColor?: string;
  } | undefined,
): StylePreset {
  if (!visualStyle) return preset;
  return {
    ...preset,
    ...(visualStyle.textColor ? { textColor: visualStyle.textColor } : {}),
    ...(visualStyle.bodyColor ? { bodyColor: visualStyle.bodyColor } : {}),
    ...(visualStyle.accentColor ? { accentColor: visualStyle.accentColor } : {}),
    ...(visualStyle.backgroundColor ? { overlayColor: visualStyle.backgroundColor } : {}),
  };
}

export const STYLE_PRESETS: Record<'minimal' | 'bold' | 'editorial', StylePreset> = {
  /**
   * minimal — cream gradient, generous negative space, clean sans-serif.
   */
  minimal: {
    overlayColor: '#F8F5EE',
    overlayOpacity: 0.7,
    overlayStyle: 'gradient-bottom',

    textColor: '#0A0A0A',
    bodyColor: '#2D2D2D',
    accentColor: '#E63946',

    titleFont: 'Bricolage Grotesque',
    titleWeight: 700,
    titleSize: 72,
    titleLineHeight: 1.05,
    titleUppercase: false,

    bodyFont: 'Inter',
    bodyWeight: 500,
    bodySize: 32,
    bodyLineHeight: 1.3,

    padding: 80,
    layoutStyle: 'bottom-stack',
  },

  /**
   * bold — dark solid overlay, yellow text, uppercase punch.
   */
  bold: {
    overlayColor: '#0A0A0A',
    overlayOpacity: 0.8,
    overlayStyle: 'solid-bottom',

    textColor: '#FFD60A',
    bodyColor: '#FFFFFF',
    accentColor: '#FF006E',

    titleFont: 'Archivo Black',
    titleWeight: 900,
    titleSize: 88,
    titleLineHeight: 0.95,
    titleUppercase: true,

    bodyFont: 'Inter',
    bodyWeight: 600,
    bodySize: 30,
    bodyLineHeight: 1.3,

    padding: 64,
    layoutStyle: 'center-stack',
  },

  /**
   * editorial — warm beige gradient, serif title, magazine layout.
   */
  editorial: {
    overlayColor: '#EDE6D6',
    overlayOpacity: 0.5,
    overlayStyle: 'gradient-both',

    textColor: '#3A2E1F',
    bodyColor: '#5C4E3A',
    accentColor: '#A23E2C',

    titleFont: 'Playfair Display',
    titleWeight: 700,
    titleSize: 64,
    titleLineHeight: 1.1,
    titleUppercase: false,

    bodyFont: 'Inter',
    bodyWeight: 400,
    bodySize: 28,
    bodyLineHeight: 1.45,

    padding: 96,
    layoutStyle: 'editorial',
  },
};
