// ---------------------------------------------------------------------------
// Carousel style registry — the SINGLE SOURCE OF TRUTH for overlay styles.
//
// Each style is a self-contained "design system" that renders the text overlay
// (Satori node tree) on top of the brand's generated background image. Styles
// are parameterized by a BrandPalette so every brand renders in ITS OWN colors
// (APEX indigo/cyan, Assistify amber/violet, …) — the image underneath is the
// brand's identity; the overlay rotates for variety.
//
// Adding a new style = ONE entry in CAROUSEL_STYLES. The union type, the DB
// validation (Zod), the auto-rotation set, and the manual flow all derive from
// CAROUSEL_STYLE_KEYS — no other file needs editing.
// ---------------------------------------------------------------------------

import type { SlideSpec } from './types.js';

// ---------------------------------------------------------------------------
// Keys + derived union type (single source of truth)
// ---------------------------------------------------------------------------

/**
 * The ordered set of style keys. ORDER MATTERS only as a tie-breaker for the
 * first rotation cycle (round-robin). Keep `minimal`/`bold`/`editorial` first
 * for back-compat with historical rows.
 */
export const CAROUSEL_STYLE_KEYS = [
  'minimal',
  'bold',
  'editorial',
  'swiss',
  'spotlight',
  'frame',
  'sticker',
  'quote',
  'index',
  'duotone',
  'masthead',
  'highlight',
  'ticket',
] as const;

export type CarouselStyleKey = (typeof CAROUSEL_STYLE_KEYS)[number];

/** Fallback when a stored/legacy value isn't a known style. */
export const DEFAULT_STYLE: CarouselStyleKey = 'bold';

export function isCarouselStyleKey(value: unknown): value is CarouselStyleKey {
  return typeof value === 'string' && (CAROUSEL_STYLE_KEYS as readonly string[]).includes(value);
}

/** Coerce any string to a valid style key (fallback to DEFAULT_STYLE). */
export function coerceStyleKey(value: unknown): CarouselStyleKey {
  return isCarouselStyleKey(value) ? value : DEFAULT_STYLE;
}

// ---------------------------------------------------------------------------
// Brand palette
// ---------------------------------------------------------------------------

/** Raw brand color tokens (from project_brand.visual_style JSONB). */
export interface BrandVisualColors {
  accentColor?: string;
  secondaryAccent?: string;
  backgroundColor?: string;
  textColor?: string;
  bodyColor?: string;
  surfaceColor?: string;
}

/** Resolved, render-ready palette. Every slot is guaranteed present. */
export interface BrandPalette {
  /** Primary brand accent — kickers, rules, bands, numbers. */
  accent: string;
  /** Secondary accent — gradients, duotone, highlights. */
  secondary: string;
  /** Deep brand background tone — used for dark panels. */
  deep: string;
  /** Near-black ink for text on light surfaces. */
  ink: string;
  /** Light "paper" surface for light panels. */
  paper: string;
  /** Readable text color ON TOP of `accent` (auto-contrast). */
  onAccent: string;
  /** Light text on dark scrims. */
  light: string;
  /** Muted light text on dark. */
  mutedLight: string;
  /** Muted dark text on paper. */
  mutedInk: string;
}

const FALLBACK = {
  accent: '#C8FF57',
  secondary: '#5BE0E6',
  deep: '#0A0B0F',
  ink: '#0B0B0F',
  paper: '#F7F3EA',
} as const;

function isHex(v: string | undefined): v is string {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

function expandHex(hex: string): string {
  const h = hex.trim().replace('#', '');
  return h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
}

function rgbOf(hex: string): { r: number; g: number; b: number } {
  const h = expandHex(hex);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Relative luminance (0..1) — used to pick readable text on a color. */
function luminance(hex: string): number {
  const { r, g, b } = rgbOf(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Pick black or white ink for maximum contrast on `bg`. */
export function readableOn(bg: string): string {
  return luminance(bg) > 0.62 ? '#0B0B0F' : '#FFFFFF';
}

/** rgba() string from a hex (3 or 6 digit) + alpha. */
export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = rgbOf(isHex(hex) ? hex : FALLBACK.ink);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Resolve a render-ready palette from raw brand colors. Every brand renders in
 * its own colors; brands without colors (e.g. BotLode) fall back to a neutral
 * premium palette so styles still look intentional.
 */
export function resolveBrandPalette(colors: BrandVisualColors | undefined): BrandPalette {
  const accent = isHex(colors?.accentColor) ? colors!.accentColor!.trim() : FALLBACK.accent;
  const secondary = isHex(colors?.secondaryAccent)
    ? colors!.secondaryAccent!.trim()
    : isHex(colors?.accentColor)
      ? accent
      : FALLBACK.secondary;
  const deep = isHex(colors?.backgroundColor) ? colors!.backgroundColor!.trim() : FALLBACK.deep;
  return {
    accent,
    secondary,
    deep,
    ink: FALLBACK.ink,
    paper: FALLBACK.paper,
    onAccent: readableOn(accent),
    light: '#FFFFFF',
    mutedLight: 'rgba(255, 255, 255, 0.82)',
    mutedInk: 'rgba(11, 11, 15, 0.66)',
  };
}

// ---------------------------------------------------------------------------
// Satori node DSL (shared with composer.ts)
// ---------------------------------------------------------------------------

export interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: (SatoriNode | string)[];
    [key: string]: unknown;
  };
}

const W = 1080;
const H = 1350;

function node(type: string, style: Record<string, unknown>, children?: (SatoriNode | string)[]): SatoriNode {
  return { type, props: { style: { display: 'flex', ...style }, children: children ?? [] } };
}
function col(style: Record<string, unknown>, children: (SatoriNode | string)[]): SatoriNode {
  return node('div', { flexDirection: 'column', ...style }, children);
}
function row(style: Record<string, unknown>, children: (SatoriNode | string)[]): SatoriNode {
  return node('div', { flexDirection: 'row', ...style }, children);
}
function text(content: string, style: Record<string, unknown>): SatoriNode {
  return node('div', style, [content]);
}
function box(style: Record<string, unknown>): SatoriNode {
  return node('div', style, []);
}
function fill(style: Record<string, unknown>): SatoriNode {
  return node('div', { position: 'absolute', top: 0, left: 0, width: W, height: H, ...style }, []);
}
function scrim(gradient: string): SatoriNode {
  return fill({ backgroundImage: gradient });
}
function root(children: (SatoriNode | string)[]): SatoriNode {
  return node('div', { position: 'relative', width: W, height: H, flexDirection: 'column' }, children);
}

// Fonts loaded by fonts.ts (family names must match exactly).
const FONT = {
  sans: 'Inter',
  heavy: 'Archivo Black',
  serif: 'DM Serif Display',
  condensed: 'Anton',
  mono: 'Space Mono',
} as const;

/** Bottom dark scrim that keeps light text legible over ANY image. */
function darkBottom(): string {
  return `linear-gradient(to top, ${rgba('#000000', 0.9)} 0%, ${rgba('#000000', 0.7)} 26%, ${rgba('#000000', 0)} 62%, ${rgba('#000000', 0)} 100%)`;
}
function darkFull(): string {
  return `linear-gradient(to top, ${rgba('#05060A', 0.92)} 0%, ${rgba('#05060A', 0.45)} 50%, ${rgba('#05060A', 0.3)} 100%)`;
}
function creamBottom(paper: string): string {
  return `linear-gradient(to top, ${rgba(paper, 0.97)} 0%, ${rgba(paper, 0.9)} 30%, ${rgba(paper, 0)} 60%, ${rgba(paper, 0)} 100%)`;
}

const PAD = 84;

// ---------------------------------------------------------------------------
// Render context + style definition
// ---------------------------------------------------------------------------

export interface StyleRenderContext {
  slide: SlideSpec;
  /** Resolved headline (already truncated + cased by the composer). */
  headline: string;
  /** Resolved body (already truncated) or null. */
  body: string | null;
  /** Short eyebrow label derived from the slide role + language. */
  kicker: string;
  /** Brand name (may be empty). */
  brandName: string;
  /** 1-based slide number. */
  slideNumber: number;
  /** Total slides in the carousel. */
  slideCount: number;
  palette: BrandPalette;
}

export interface CarouselStyleDef {
  key: CarouselStyleKey;
  name: string;
  group: 'core' | 'new';
  render: (ctx: StyleRenderContext) => SatoriNode;
}

// ---------------------------------------------------------------------------
// Role → eyebrow label (es / en)
// ---------------------------------------------------------------------------

const ROLE_KICKER: Record<'es' | 'en', Record<SlideSpec['role'], string>> = {
  es: {
    hook: 'ATENCIÓN',
    problem: 'EL PROBLEMA',
    insight: 'LA CLAVE',
    data: 'EL DATO',
    example: 'EN LA PRÁCTICA',
    cta: 'TU TURNO',
  },
  en: {
    hook: 'HEADS UP',
    problem: 'THE PROBLEM',
    insight: 'THE KEY',
    data: 'THE DATA',
    example: 'IN PRACTICE',
    cta: 'YOUR MOVE',
  },
};

export function roleKicker(role: SlideSpec['role'], language: 'es' | 'en'): string {
  return (ROLE_KICKER[language] ?? ROLE_KICKER.es)[role] ?? '';
}

// ---------------------------------------------------------------------------
// Text helpers (shared with composer)
// ---------------------------------------------------------------------------

/** Truncate without cutting a word; append an ellipsis. */
export function truncate(input: string, maxLen: number): string {
  const trimmed = input.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const budget = maxLen - 1;
  let cut = trimmed.lastIndexOf(' ', budget);
  if (cut <= 0) cut = budget;
  let result = trimmed.slice(0, cut).replace(/[\s,;:\-–—]+$/u, '');
  if (result.length === 0) result = trimmed.slice(0, budget);
  return result + '…';
}

// ---------------------------------------------------------------------------
// The 13 styles
// ---------------------------------------------------------------------------

const STYLE_LIST: CarouselStyleDef[] = [
  // ----- minimal — cream scrim, clean sans, lots of air -----
  {
    key: 'minimal', name: 'Minimal Luxe', group: 'core',
    render: ({ headline, body, kicker, palette: p }) => root([
      scrim(creamBottom(p.paper)),
      col({ position: 'absolute', left: PAD, right: PAD, bottom: PAD, alignItems: 'flex-start' }, [
        text(kicker, { fontFamily: FONT.sans, fontSize: 24, fontWeight: 700, letterSpacing: '0.18em', color: p.accent, marginBottom: 22, textTransform: 'uppercase' }),
        text(headline, { fontFamily: FONT.sans, fontSize: 78, fontWeight: 700, color: p.ink, lineHeight: 1.04, letterSpacing: '-0.02em', maxWidth: 880 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 32, fontWeight: 500, color: p.mutedInk, lineHeight: 1.32, marginTop: 22, maxWidth: 820 })] : []),
      ]),
    ]),
  },

  // ----- bold — solid dark bottom block, big uppercase -----
  {
    key: 'bold', name: 'Bold Impact', group: 'core',
    render: ({ headline, body, kicker, palette: p }) => root([
      fill({ top: H * 0.5, height: H * 0.5, backgroundColor: rgba('#08080C', 0.93) }),
      col({ position: 'absolute', left: PAD, right: PAD, bottom: PAD }, [
        row({ marginBottom: 22 }, [
          text(kicker, { fontFamily: FONT.sans, fontSize: 22, fontWeight: 700, letterSpacing: '0.16em', color: p.onAccent, backgroundColor: p.accent, padding: '10px 18px', textTransform: 'uppercase' }),
        ]),
        text(headline.toUpperCase(), { fontFamily: FONT.heavy, fontSize: 92, fontWeight: 900, color: '#FFFFFF', lineHeight: 0.96, textTransform: 'uppercase', maxWidth: 900 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 31, fontWeight: 600, color: '#D6D6DE', lineHeight: 1.3, marginTop: 24, maxWidth: 820 })] : []),
      ]),
    ]),
  },

  // ----- editorial — serif, big slide number, magazine -----
  {
    key: 'editorial', name: 'Editorial', group: 'core',
    render: ({ headline, body, kicker, slideNumber, palette: p }) => root([
      scrim(`linear-gradient(to bottom, ${rgba('#0A0A0F', 0.62)} 0%, ${rgba('#0A0A0F', 0)} 30%, ${rgba('#0A0A0F', 0)} 52%, ${rgba('#0A0A0F', 0.9)} 100%)`),
      row({ position: 'absolute', top: PAD, left: PAD, right: PAD, justifyContent: 'space-between', alignItems: 'flex-start' }, [
        text(kicker, { fontFamily: FONT.serif, fontSize: 24, fontStyle: 'italic', color: p.accent, letterSpacing: '0.04em' }),
        text(String(slideNumber).padStart(2, '0'), { fontFamily: FONT.serif, fontSize: 120, color: rgba(p.accent, 0.5), lineHeight: 0.8 }),
      ]),
      col({ position: 'absolute', left: PAD, right: PAD, bottom: PAD }, [
        text(headline, { fontFamily: FONT.serif, fontSize: 80, color: p.light, lineHeight: 1.06, maxWidth: 880 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 30, fontWeight: 400, color: p.mutedLight, lineHeight: 1.45, marginTop: 22, maxWidth: 780 })] : []),
      ]),
    ]),
  },

  // ----- swiss — accent rule, tense type, asymmetric -----
  {
    key: 'swiss', name: 'Swiss Grid', group: 'new',
    render: ({ headline, body, kicker, palette: p }) => root([
      scrim(darkBottom()),
      col({ position: 'absolute', left: PAD, right: PAD, bottom: PAD, alignItems: 'flex-start' }, [
        row({ alignItems: 'center', marginBottom: 26 }, [
          box({ width: 64, height: 6, backgroundColor: p.accent, marginRight: 18 }),
          text(kicker, { fontFamily: FONT.sans, fontSize: 23, fontWeight: 700, letterSpacing: '0.12em', color: p.light, textTransform: 'uppercase' }),
        ]),
        text(headline, { fontFamily: FONT.sans, fontSize: 80, fontWeight: 700, color: p.light, lineHeight: 1.0, letterSpacing: '-0.025em', maxWidth: 820 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 30, fontWeight: 500, color: p.mutedLight, lineHeight: 1.34, marginTop: 24, maxWidth: 720 })] : []),
      ]),
    ]),
  },

  // ----- spotlight — centered serif, hairlines, lux -----
  {
    key: 'spotlight', name: 'Spotlight Serif', group: 'new',
    render: ({ headline, body, kicker, palette: p }) => root([
      scrim(`linear-gradient(to top, ${rgba('#000000', 0.9)} 0%, ${rgba('#000000', 0.6)} 26%, ${rgba('#000000', 0.22)} 52%, ${rgba('#000000', 0)} 80%, ${rgba('#000000', 0)} 100%)`),
      col({ position: 'absolute', left: PAD, right: PAD, bottom: 96, alignItems: 'center' }, [
        box({ width: 70, height: 2, backgroundColor: p.accent, marginBottom: 24 }),
        text(kicker, { fontFamily: FONT.sans, fontSize: 22, fontWeight: 600, letterSpacing: '0.34em', color: p.accent, textTransform: 'uppercase', marginBottom: 24, textAlign: 'center' }),
        text(headline, { fontFamily: FONT.serif, fontSize: 80, color: '#FBF8F2', lineHeight: 1.08, textAlign: 'center', maxWidth: 860 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 29, fontWeight: 400, color: p.mutedLight, lineHeight: 1.4, marginTop: 22, textAlign: 'center', maxWidth: 720 })] : []),
        box({ width: 70, height: 2, backgroundColor: rgba(p.accent, 0.5), marginTop: 26 }),
      ]),
    ]),
  },

  // ----- frame — hairline gallery frame + corner tick -----
  {
    key: 'frame', name: 'Gallery Frame', group: 'new',
    render: ({ headline, body, kicker, brandName, palette: p }) => root([
      scrim(darkBottom()),
      fill({ top: 40, left: 40, width: W - 80, height: H - 80, border: `2px solid ${rgba('#FFFFFF', 0.85)}` }),
      row({ position: 'absolute', top: 74, left: 74, alignItems: 'center' }, [
        box({ width: 12, height: 12, backgroundColor: p.accent, marginRight: 14 }),
        text(kicker, { fontFamily: FONT.sans, fontSize: 22, fontWeight: 600, letterSpacing: '0.22em', color: p.light, textTransform: 'uppercase' }),
      ]),
      ...(brandName ? [text(brandName.toUpperCase(), { position: 'absolute', top: 74, right: 74, fontFamily: FONT.serif, fontSize: 26, color: p.light, letterSpacing: '0.1em' })] : []),
      col({ position: 'absolute', left: 74, right: 74, bottom: 84 }, [
        text(headline, { fontFamily: FONT.serif, fontSize: 78, color: p.light, lineHeight: 1.06, maxWidth: 840 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 29, fontWeight: 400, color: p.mutedLight, lineHeight: 1.4, marginTop: 20, maxWidth: 760 })] : []),
      ]),
    ]),
  },

  // ----- sticker — rounded pills + white card, friendly -----
  {
    key: 'sticker', name: 'Sticker Pop', group: 'new',
    render: ({ headline, body, kicker, brandName, palette: p }) => root([
      scrim(`linear-gradient(to top, ${rgba(p.deep, 0.82)} 0%, ${rgba(p.deep, 0.2)} 50%, ${rgba(p.deep, 0)} 70%, ${rgba(p.deep, 0)} 100%)`),
      col({ position: 'absolute', left: 60, right: 60, bottom: 80, alignItems: 'flex-start' }, [
        row({ marginBottom: 20 }, [
          text(kicker, { fontFamily: FONT.sans, fontSize: 22, fontWeight: 700, color: p.onAccent, backgroundColor: p.accent, padding: '12px 22px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 12 }),
          ...(brandName ? [text(brandName, { fontFamily: FONT.sans, fontSize: 22, fontWeight: 700, color: p.light, backgroundColor: rgba('#FFFFFF', 0.16), padding: '12px 22px', borderRadius: 999 })] : []),
        ]),
        col({ backgroundColor: '#FFFFFF', borderRadius: 34, padding: 44 }, [
          text(headline, { fontFamily: FONT.sans, fontSize: 70, fontWeight: 700, color: p.ink, lineHeight: 1.04, letterSpacing: '-0.02em', maxWidth: 820 }),
          ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 29, fontWeight: 500, color: p.mutedInk, lineHeight: 1.34, marginTop: 16, maxWidth: 780 })] : []),
        ]),
      ]),
    ]),
  },

  // ----- quote — giant quote mark, serif statement -----
  {
    key: 'quote', name: 'Quote Card', group: 'new',
    render: ({ headline, body, brandName, palette: p }) => root([
      scrim(darkFull()),
      col({ position: 'absolute', left: PAD, right: PAD, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'flex-start' }, [
        text('“', { fontFamily: FONT.serif, fontSize: 220, color: rgba(p.secondary, 0.9), lineHeight: 0.7, marginBottom: 6 }),
        text(headline, { fontFamily: FONT.serif, fontSize: 84, color: '#FFFFFF', lineHeight: 1.1, maxWidth: 860 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 28, fontWeight: 500, color: p.mutedLight, lineHeight: 1.4, marginTop: 26, maxWidth: 720 })] : []),
        ...(brandName ? [row({ marginTop: 30, alignItems: 'center' }, [
          box({ width: 44, height: 3, backgroundColor: p.secondary, marginRight: 14 }),
          text(brandName.toUpperCase(), { fontFamily: FONT.sans, fontSize: 24, fontWeight: 700, color: p.secondary, letterSpacing: '0.1em' }),
        ])] : []),
      ]),
    ]),
  },

  // ----- index — giant number + rule, listicle -----
  {
    key: 'index', name: 'Numbered Index', group: 'new',
    render: ({ headline, body, kicker, slideNumber, palette: p }) => root([
      scrim(darkBottom()),
      col({ position: 'absolute', left: PAD, right: PAD, bottom: PAD }, [
        row({ alignItems: 'flex-end', marginBottom: 10 }, [
          text(String(slideNumber).padStart(2, '0'), { fontFamily: FONT.condensed, fontSize: 200, color: p.accent, lineHeight: 0.78, letterSpacing: '-0.02em' }),
          col({ marginLeft: 26, marginBottom: 16, alignItems: 'flex-start' }, [
            text(kicker, { fontFamily: FONT.sans, fontSize: 22, fontWeight: 700, letterSpacing: '0.14em', color: p.light, textTransform: 'uppercase', marginBottom: 10 }),
            box({ width: 120, height: 4, backgroundColor: rgba('#FFFFFF', 0.5) }),
          ]),
        ]),
        text(headline, { fontFamily: FONT.sans, fontSize: 72, fontWeight: 700, color: p.light, lineHeight: 1.04, letterSpacing: '-0.02em', maxWidth: 880, marginTop: 8 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 29, fontWeight: 500, color: p.mutedLight, lineHeight: 1.34, marginTop: 18, maxWidth: 800 })] : []),
      ]),
    ]),
  },

  // ----- duotone — brand-color wash over the image -----
  {
    key: 'duotone', name: 'Duotone Wash', group: 'new',
    render: ({ headline, body, kicker, palette: p }) => root([
      fill({ backgroundColor: rgba(p.deep, 0.5) }),
      scrim(`linear-gradient(125deg, ${rgba(p.accent, 0.55)} 0%, ${rgba(p.deep, 0.25)} 45%, ${rgba(p.secondary, 0.5)} 100%)`),
      scrim(`linear-gradient(to top, ${rgba(p.deep, 0.85)} 0%, ${rgba(p.deep, 0.1)} 55%, ${rgba(p.deep, 0)} 100%)`),
      col({ position: 'absolute', left: PAD, right: PAD, bottom: PAD, alignItems: 'flex-start' }, [
        text(kicker, { fontFamily: FONT.sans, fontSize: 23, fontWeight: 700, letterSpacing: '0.16em', color: p.light, textTransform: 'uppercase', marginBottom: 22 }),
        text(headline, { fontFamily: FONT.sans, fontSize: 82, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.0, letterSpacing: '-0.02em', maxWidth: 860 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 30, fontWeight: 500, color: rgba('#FFFFFF', 0.88), lineHeight: 1.34, marginTop: 22, maxWidth: 780 })] : []),
      ]),
    ]),
  },

  // ----- masthead — magazine cover masthead + rules -----
  {
    key: 'masthead', name: 'Magazine Masthead', group: 'new',
    render: ({ headline, body, kicker, brandName, palette: p }) => root([
      scrim(`linear-gradient(to bottom, ${rgba('#0A0A0F', 0.72)} 0%, ${rgba('#0A0A0F', 0)} 26%, ${rgba('#0A0A0F', 0)} 52%, ${rgba('#0A0A0F', 0.9)} 100%)`),
      col({ position: 'absolute', top: 64, left: PAD, right: PAD, alignItems: 'center' }, [
        box({ width: '100%', height: 2, backgroundColor: rgba('#FFFFFF', 0.85), marginBottom: 14 }),
        text((brandName || 'CARRUSEL').toUpperCase(), { fontFamily: FONT.serif, fontSize: 58, color: '#FFFFFF', letterSpacing: '0.12em' }),
        row({ width: '100%', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }, [
          box({ flexGrow: 1, height: 1, backgroundColor: rgba('#FFFFFF', 0.6) }),
          text(kicker, { fontFamily: FONT.sans, fontSize: 20, fontWeight: 600, letterSpacing: '0.28em', color: p.accent, textTransform: 'uppercase', marginLeft: 18, marginRight: 18 }),
          box({ flexGrow: 1, height: 1, backgroundColor: rgba('#FFFFFF', 0.6) }),
        ]),
      ]),
      col({ position: 'absolute', left: PAD, right: PAD, bottom: PAD, alignItems: 'flex-start' }, [
        text(headline, { fontFamily: FONT.serif, fontSize: 84, color: '#FFFFFF', lineHeight: 1.04, maxWidth: 880 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 29, fontWeight: 400, color: p.mutedLight, lineHeight: 1.42, marginTop: 20, maxWidth: 760 })] : []),
      ]),
    ]),
  },

  // ----- highlight — marker-highlighted key words -----
  {
    key: 'highlight', name: 'Marker Highlight', group: 'new',
    render: ({ headline, body, kicker, palette: p }) => {
      const words = headline.split(' ');
      const hiFrom = Math.max(0, words.length - 2);
      const chips = words.map((w, i) =>
        text(w, {
          fontFamily: FONT.sans, fontSize: 74, fontWeight: 800, lineHeight: 1.18, letterSpacing: '-0.01em',
          marginRight: 14, marginBottom: 6,
          color: i >= hiFrom ? p.onAccent : '#FFFFFF',
          ...(i >= hiFrom ? { backgroundColor: p.accent, padding: '2px 14px' } : {}),
        }),
      );
      return root([
        scrim(darkBottom()),
        col({ position: 'absolute', left: PAD, right: PAD, bottom: PAD, alignItems: 'flex-start' }, [
          text(kicker, { fontFamily: FONT.sans, fontSize: 23, fontWeight: 700, letterSpacing: '0.14em', color: p.accent, textTransform: 'uppercase', marginBottom: 24 }),
          row({ flexWrap: 'wrap', alignItems: 'center', maxWidth: 920 }, chips),
          ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 30, fontWeight: 500, color: p.mutedLight, lineHeight: 1.34, marginTop: 26, maxWidth: 800 })] : []),
        ]),
      ]);
    },
  },

  // ----- ticket — boarding-pass stub, mono labels -----
  {
    key: 'ticket', name: 'Ticket Stub', group: 'new',
    render: ({ headline, body, kicker, brandName, slideNumber, palette: p }) => root([
      scrim(`linear-gradient(to top, ${rgba('#0B0B10', 0.92)} 0%, ${rgba('#0B0B10', 0.4)} 32%, ${rgba('#0B0B10', 0)} 60%, ${rgba('#0B0B10', 0)} 100%)`),
      col({ position: 'absolute', left: 56, right: 56, bottom: 72, backgroundColor: rgba('#0E0E14', 0.86), border: `2px solid ${rgba('#FFFFFF', 0.18)}`, borderRadius: 18, padding: 44 }, [
        row({ justifyContent: 'space-between', alignItems: 'center' }, [
          text(`${(brandName || 'IG').toUpperCase()} · IG`, { fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: p.accent, letterSpacing: '0.08em' }),
          text('NO. ' + String(slideNumber).padStart(3, '0'), { fontFamily: FONT.mono, fontSize: 22, fontWeight: 400, color: rgba('#FFFFFF', 0.6) }),
        ]),
        row({ marginTop: 22, marginBottom: 22, alignItems: 'center' }, [
          box({ flexGrow: 1, height: 0, borderTop: `3px dashed ${rgba('#FFFFFF', 0.35)}` }),
        ]),
        text(kicker, { fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: p.secondary, letterSpacing: '0.04em', marginBottom: 14 }),
        text(headline, { fontFamily: FONT.sans, fontSize: 66, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.05, letterSpacing: '-0.02em', maxWidth: 880 }),
        ...(body ? [text(body, { fontFamily: FONT.sans, fontSize: 28, fontWeight: 500, color: rgba('#FFFFFF', 0.72), lineHeight: 1.34, marginTop: 16, maxWidth: 820 })] : []),
      ]),
    ]),
  },
];

export const CAROUSEL_STYLES: Record<CarouselStyleKey, CarouselStyleDef> = Object.fromEntries(
  STYLE_LIST.map((s) => [s.key, s]),
) as Record<CarouselStyleKey, CarouselStyleDef>;

/** Get a style def with a safe fallback for unknown keys. */
export function getStyleDef(key: string): CarouselStyleDef {
  return CAROUSEL_STYLES[coerceStyleKey(key)];
}
