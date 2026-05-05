# DESIGN TOKENS — Proyecto Virus

> Tokens compartidos entre `apps/web` (dashboard) y `packages/remotion` (templates de video).
> Los templates de video usan estos tokens directamente para que un cambio de marca se propague a los videos generados.

## Paleta principal (modo oscuro default)

```ts
export const colors = {
  // Backgrounds
  bg: '#0A0B0F',                    // body
  bgElevated: '#111318',            // cards
  bgSurface: '#161A20',             // surface containers
  bgSurfaceHigh: '#1C2028',
  bgSurfaceHighest: '#222830',

  // Borders
  border: '#222830',
  borderSubtle: '#161A20',
  borderFocus: '#3ECF8E',           // accent verde Supabase

  // Text
  textPrimary: '#F4F6F8',
  textSecondary: '#A8B0BC',
  textTertiary: '#6B7280',
  textDisabled: '#3F4551',

  // Accent (default Supabase green; cambiable per-user)
  accent: '#3ECF8E',
  accentHover: '#34B27B',
  accentFg: '#0A0B0F',              // text sobre accent

  // Semantic
  success: '#34B27B',
  warning: '#FFC000',
  danger: '#E57373',
  info: '#0175C2',

  // Status del pipeline
  statusPending: '#A8B0BC',
  statusProcessing: '#0175C2',
  statusReady: '#3ECF8E',
  statusFailed: '#E57373',
};
```

## Tipografía

```ts
export const fonts = {
  sans: 'Oxanium, ui-sans-serif, system-ui',
  mono: 'JetBrains Mono, ui-monospace, monospace',
};

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
};

export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 64,
  '7xl': 80,                        // hero del dashboard
  // específicos para templates de video
  videoCaption: 56,                 // captions on-video (1080×1920 → ~36-48px equivalentes)
  videoTitle: 96,
  videoHook: 128,
};
```

## Espaciados

```ts
export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24,
  7: 28, 8: 32, 10: 40, 12: 48, 14: 56, 16: 64,
  20: 80, 24: 96, 32: 128,
};
```

## Radius

```ts
export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  '2xl': 24,                        // hero cards (estilo APEX)
  full: 9999,
};
```

## Animaciones

```ts
export const motion = {
  durations: { fast: 150, base: 240, slow: 420, slower: 800 },
  easings: {
    standard: [0.4, 0, 0.2, 1],     // easeInOut
    decelerate: [0.0, 0.0, 0.2, 1], // easeOut
    accelerate: [0.4, 0.0, 1, 1],
    spring: { type: 'spring', stiffness: 220, damping: 26 },
  },
};
```

## Específicos de Remotion (videos)

```ts
export const video = {
  fps: 30,
  width: 1080,
  height: 1920,
  // safe zones (proyecto.md §1)
  safeTopPx: 250,
  safeBottomPx: 350,
  // captions: amarillo o verde resaltado
  captionHighlightColor: '#FFD400',
  captionDefaultColor: '#FFFFFF',
  captionStrokeColor: '#000000',
  captionStrokeWidth: 8,
  // code blocks
  codeFontSize: 44,
  codeFontFamily: 'JetBrains Mono',
  codeBg: '#0F1419',
  codeAccent: '#3ECF8E',
};
```

## Shadows

```ts
export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.4)',
  md: '0 4px 12px rgba(0,0,0,0.5)',
  lg: '0 10px 30px rgba(0,0,0,0.55)',
  glow: (color: string) => `0 0 20px ${color}40, 0 0 60px ${color}20`,
};
```

## Cómo se exportan

`packages/shared/src/tokens/index.ts` exporta TODO. `apps/web` lo importa en `tailwind.config.ts` (vía `theme.extend`). `packages/remotion` lo importa directo en los componentes.

Cualquier cambio acá → un solo lugar → propaga a UI y videos.
