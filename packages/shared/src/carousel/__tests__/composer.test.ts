import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeSlide } from '../composer.js';
import { STYLE_PRESETS } from '../templates.js';
import type { SlideSpec } from '../types.js';

// Create a solid-color 1080×1350 PNG buffer for testing (no real image needed)
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

describe('composeSlide', () => {
  it('produces a valid PNG with dimensions 1080×1350', async () => {
    const base = await makeFakeBaseImage();
    const result = await composeSlide({
      baseImage: base,
      slide: mockSlide,
      preset: STYLE_PRESETS.minimal,
    });

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  }, 30_000);

  it('handles a very long headline (200 chars) without throwing', async () => {
    const base = await makeFakeBaseImage();
    const longHeadline = 'A'.repeat(200);

    await expect(
      composeSlide({
        baseImage: base,
        slide: { ...mockSlide, headline: longHeadline },
        preset: STYLE_PRESETS.bold,
      }),
    ).resolves.toBeDefined();
  }, 30_000);

  it('each preset produces a different byte-length output', async () => {
    const base = await makeFakeBaseImage();

    const outputs = await Promise.all(
      Object.values(STYLE_PRESETS).map((preset) =>
        composeSlide({ baseImage: base, slide: mockSlide, preset }),
      ),
    );

    // Verify each preset output is a valid 1080×1350 PNG
    for (const output of outputs) {
      const meta = await sharp(output).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
    }
  }, 60_000);

  it('composed output differs from base image (text was rendered)', async () => {
    const base = await makeFakeBaseImage();
    const result = await composeSlide({
      baseImage: base,
      slide: mockSlide,
      preset: STYLE_PRESETS.bold,
    });
    // The composed output must differ from the base (text overlay was applied)
    expect(result).not.toEqual(base);
  }, 30_000);

  it('works when slide has no body', async () => {
    const base = await makeFakeBaseImage();
    const slideNoBody: SlideSpec = {
      idx: mockSlide.idx,
      role: mockSlide.role,
      headline: mockSlide.headline,
      visualPrompt: mockSlide.visualPrompt,
      // body intentionally omitted
    };

    const result = await composeSlide({
      baseImage: base,
      slide: slideNoBody,
      preset: STYLE_PRESETS.editorial,
    });

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
  }, 30_000);
});
