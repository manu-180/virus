import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeSlide } from '../composer.js';
import { CAROUSEL_STYLE_KEYS, type BrandVisualColors } from '../styles.js';
import { getLayoutForRole, STYLE_PRESETS } from '../templates.js';
import type { SlideSpec } from '../types.js';

async function makeFakeBaseImage(
  rgb: { r: number; g: number; b: number } = { r: 30, g: 30, b: 30 },
): Promise<Buffer> {
  return sharp({
    create: { width: 1080, height: 1350, channels: 3, background: rgb },
  })
    .png()
    .toBuffer();
}

const mockSlide: SlideSpec = {
  idx: 0,
  role: 'hook',
  headline: 'Test headline',
  body: 'Test body text that describes the slide content.',
  visualPrompt: 'A test visual',
};

// APEX-like brand colors so styles exercise the brand-palette path.
const visualColors: BrandVisualColors = {
  accentColor: '#6366F1',
  secondaryAccent: '#00D4FF',
  backgroundColor: '#050B18',
};

// ---------------------------------------------------------------------------
// composeSlide — output dimensions and basic contracts (new registry API)
// ---------------------------------------------------------------------------

describe('composeSlide', () => {
  it('every registered style produces a 1080×1350 PNG', async () => {
    const base = await makeFakeBaseImage();

    for (const styleKey of CAROUSEL_STYLE_KEYS) {
      const result = await composeSlide({
        baseImage: base,
        slide: mockSlide,
        styleKey,
        slideCount: 8,
        brandName: 'APEX',
        language: 'es',
        visualColors,
      });
      const meta = await sharp(result).metadata();
      expect(meta.format, `${styleKey}: format`).toBe('png');
      expect(meta.width, `${styleKey}: width`).toBe(1080);
      expect(meta.height, `${styleKey}: height`).toBe(1350);
    }
  }, 180_000);

  it('renders every style over a LIGHT background (legibility scrims)', async () => {
    const light = await makeFakeBaseImage({ r: 247, g: 243, b: 234 });
    const dataSlide: SlideSpec = {
      idx: 3,
      role: 'data',
      headline: 'El 90% decide en 5 segundos',
      body: 'Velocidad y claridad antes que la estética.',
      visualPrompt: 'x',
    };
    for (const styleKey of CAROUSEL_STYLE_KEYS) {
      const result = await composeSlide({
        baseImage: light,
        slide: dataSlide,
        styleKey,
        slideCount: 8,
        brandName: 'APEX',
        visualColors,
      });
      const meta = await sharp(result).metadata();
      expect(meta.width, `${styleKey}`).toBe(1080);
    }
  }, 180_000);

  it('composed output differs from base image (overlay was applied)', async () => {
    const base = await makeFakeBaseImage();
    const result = await composeSlide({ baseImage: base, slide: mockSlide, styleKey: 'bold', slideCount: 8 });
    expect(result).not.toEqual(base);
  }, 30_000);

  it('works when slide has no body', async () => {
    const base = await makeFakeBaseImage();
    const noBodySlide: SlideSpec = {
      idx: mockSlide.idx,
      role: mockSlide.role,
      headline: mockSlide.headline,
      visualPrompt: mockSlide.visualPrompt,
    };
    const result = await composeSlide({ baseImage: base, slide: noBodySlide, styleKey: 'editorial', slideCount: 8 });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  }, 30_000);

  it('works with no brand colors (neutral fallback palette)', async () => {
    const base = await makeFakeBaseImage();
    const result = await composeSlide({ baseImage: base, slide: mockSlide, styleKey: 'duotone', slideCount: 8 });
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
  }, 30_000);

  it('unknown style key falls back to a valid style instead of throwing', async () => {
    const base = await makeFakeBaseImage();
    const result = await composeSlide({ baseImage: base, slide: mockSlide, styleKey: 'totally-made-up', slideCount: 8 });
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  }, 30_000);

  it('throws compose_empty_headline when headline is empty', async () => {
    const base = await makeFakeBaseImage();
    const emptySlide: SlideSpec = { ...mockSlide, headline: '' };
    await expect(
      composeSlide({ baseImage: base, slide: emptySlide, styleKey: 'bold', slideCount: 8 }),
    ).rejects.toThrow(/compose_empty_headline/);
  });

  it('throws compose_empty_headline when headline is whitespace only', async () => {
    const base = await makeFakeBaseImage();
    const wsSlide: SlideSpec = { ...mockSlide, headline: '   \t  ' };
    await expect(
      composeSlide({ baseImage: base, slide: wsSlide, styleKey: 'bold', slideCount: 8 }),
    ).rejects.toThrow(/compose_empty_headline/);
  });

  it('title longer than 40 chars is truncated (composer must not throw)', async () => {
    const base = await makeFakeBaseImage();
    const slideWithLongTitle: SlideSpec = { ...mockSlide, headline: 'A'.repeat(80) };
    const result = await composeSlide({
      baseImage: base,
      slide: slideWithLongTitle,
      styleKey: 'minimal',
      slideCount: 8,
    });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// getLayoutForRole — pure logic, retained for the IG Stories composer that
// still consumes the legacy templates module.
// ---------------------------------------------------------------------------

describe('getLayoutForRole (legacy templates / stories)', () => {
  const preset = STYLE_PRESETS.minimal;

  it('hook role shows eyebrow and scales title up', () => {
    const o = getLayoutForRole('hook', preset);
    expect(o.showEyebrow).toBe(true);
    expect(o.titleSizeMultiplier).toBeGreaterThan(1);
  });

  it('data role with "73% de los sitios..." extracts "73%" and hides body', () => {
    const o = getLayoutForRole('data', preset, '73% de los sitios no convierten.');
    expect(o.bigNumber).toBe('73%');
    expect(o.bodyHidden).toBe(true);
  });

  it('data role with "5x" prefix extracts "5x"', () => {
    const o = getLayoutForRole('data', preset, '5x más conversiones en 3 meses.');
    expect(o.bigNumber).toBe('5x');
    expect(o.bodyHidden).toBe(true);
  });

  it('data role without leading stat keeps body visible', () => {
    const o = getLayoutForRole('data', preset, 'La mayoría no sabe esto.');
    expect(o.bigNumber).toBeNull();
    expect(o.bodyHidden).toBe(false);
  });

  it('cta role shows arrow', () => {
    const o = getLayoutForRole('cta', preset);
    expect(o.showArrow).toBe(true);
  });

  it('insight/example/problem use default multiplier', () => {
    for (const role of ['insight', 'example', 'problem'] as const) {
      const o = getLayoutForRole(role, preset);
      expect(o.titleSizeMultiplier).toBe(1.0);
      expect(o.showArrow).toBe(false);
      expect(o.showEyebrow).toBe(false);
    }
  });
});
