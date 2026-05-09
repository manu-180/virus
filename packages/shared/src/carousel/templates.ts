// ---------------------------------------------------------------------------
// Style presets for carousel overlay composer (Tanda 2).
// Consumed by compose-carousel-overlay.ts to drive Satori layout tokens.
// ---------------------------------------------------------------------------

export interface StylePreset {
  palette: string[];
  fontFamily: string;
  titleSize: number;
  bodySize: number;
  backgroundOverlay: 'none' | 'gradient' | 'solid';
  padding: number;
}

export const STYLE_PRESETS: Record<'minimal' | 'bold' | 'editorial', StylePreset> = {
  minimal: {
    palette: ['#FFFFFF', '#F5F5F5', '#1A1A1A', '#6B6B6B'],
    fontFamily: 'Inter',
    titleSize: 48,
    bodySize: 24,
    backgroundOverlay: 'none',
    padding: 64,
  },
  bold: {
    palette: ['#0A0A0A', '#FFFFFF', '#FF3B30', '#FFD60A'],
    fontFamily: 'Sora',
    titleSize: 56,
    bodySize: 26,
    backgroundOverlay: 'gradient',
    padding: 48,
  },
  editorial: {
    palette: ['#1C1C1E', '#F2F2F7', '#007AFF', '#C7C7CC'],
    fontFamily: 'Playfair Display',
    titleSize: 52,
    bodySize: 22,
    backgroundOverlay: 'solid',
    padding: 56,
  },
};
