import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeSlide } from '../composer.js';
import { STYLE_PRESETS, getLayoutForRole } from '../templates.js';
import type { SlideSpec } from '../types.js';

async function makeFakeBaseImage(): Promise<Buffer> {
  return sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 30, g: 30, b: 30 } },
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

// ---------------------------------------------------------------------------
// composeSlide — output dimensions and basic contracts
// ---------------------------------------------------------------------------

describe('composeSlide', () => {
  it('each preset produces a 1080×1350 PNG', async () => {
    const base = await makeFakeBaseImage();

    for (const [name, preset] of Object.entries(STYLE_PRESETS)) {
      const result = await composeSlide({ baseImage: base, slide: mockSlide, preset });
      const meta = await sharp(result).metadata();
      expect(meta.format, `${name}: format`).toBe('png');
      expect(meta.width, `${name}: width`).toBe(1080);
      expect(meta.height, `${name}: height`).toBe(1350);
    }
  }, 60_000);

  it('composed output differs from base image (overlay was applied)', async () => {
    const base = await makeFakeBaseImage();
    const result = await composeSlide({
      baseImage: base,
      slide: mockSlide,
      preset: STYLE_PRESETS.bold,
    });
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
    const result = await composeSlide({
      baseImage: base,
      slide: noBodySlide,
      preset: STYLE_PRESETS.editorial,
    });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  }, 30_000);

  it('data role with leading stat hides body and extracts big number', async () => {
    const base = await makeFakeBaseImage();
    const dataSlide: SlideSpec = {
      idx: 3,
      role: 'data',
      headline: 'Los números no mienten',
      body: '73% de los sitios web pierden el 50% de sus visitas.',
      visualPrompt: 'abstract data',
    };
    // Verify overrides: bigNumber extracted, bodyHidden
    const overrides = getLayoutForRole('data', STYLE_PRESETS.minimal, dataSlide.body);
    expect(overrides.bigNumber).toBe('73%');
    expect(overrides.bodyHidden).toBe(true);

    // Composer must not throw
    const result = await composeSlide({ baseImage: base, slide: dataSlide, preset: STYLE_PRESETS.minimal });
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  }, 30_000);

  it('throws compose_empty_headline when headline is empty', async () => {
    const base = await makeFakeBaseImage();
    const emptySlide: SlideSpec = { ...mockSlide, headline: '' };
    await expect(
      composeSlide({ baseImage: base, slide: emptySlide, preset: STYLE_PRESETS.bold }),
    ).rejects.toThrow(/compose_empty_headline/);
  });

  it('throws compose_empty_headline when headline is whitespace only', async () => {
    const base = await makeFakeBaseImage();
    const wsSlide: SlideSpec = { ...mockSlide, headline: '   \t  ' };
    await expect(
      composeSlide({ baseImage: base, slide: wsSlide, preset: STYLE_PRESETS.bold }),
    ).rejects.toThrow(/compose_empty_headline/);
  });

  it('title longer than 60 chars is truncated with "…"', async () => {
    const base = await makeFakeBaseImage();
    const longTitle = 'A'.repeat(80);
    const slideWithLongTitle: SlideSpec = {
      ...mockSlide,
      headline: longTitle,
    };
    // composeSlide must not throw with a long headline
    const result = await composeSlide({
      baseImage: base,
      slide: slideWithLongTitle,
      preset: STYLE_PRESETS.minimal,
    });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// getLayoutForRole — pure logic tests (no image rendering needed)
// ---------------------------------------------------------------------------

describe('getLayoutForRole', () => {
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
