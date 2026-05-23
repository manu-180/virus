import { describe, it, expect } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  composeSlide,
  pickBrandStampIdx,
  pickBrandStampIdxFromCount,
} from '../composer.js';
import { STYLE_PRESETS } from '../templates.js';
import type { SlideSpec } from '../types.js';

const OUT_DIR = path.join(process.cwd(), 'tmp-carousel-samples');

async function makeBase(): Promise<Buffer> {
  return sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 28, g: 28, b: 36 } },
  })
    .png()
    .toBuffer();
}

describe('brand stamp', () => {
  it('pickBrandStampIdxFromCount is deterministic per carouselId', () => {
    const a = pickBrandStampIdxFromCount(8, 'carousel-abc-123');
    const b = pickBrandStampIdxFromCount(8, 'carousel-abc-123');
    const c = pickBrandStampIdxFromCount(8, 'carousel-xyz-999');
    expect(a).toBe(b);
    expect(a).not.toBeNull();
    expect(a!).toBeGreaterThanOrEqual(1);
    expect(a!).toBeLessThanOrEqual(6); // slideCount - 2
    // Different carouselIds may collide but typically differ
    expect(typeof c).toBe('number');
  });

  it('pickBrandStampIdxFromCount returns null when there is no interior slide', () => {
    expect(pickBrandStampIdxFromCount(2, 'whatever')).toBeNull();
    expect(pickBrandStampIdxFromCount(1, 'whatever')).toBeNull();
    expect(pickBrandStampIdxFromCount(0, 'whatever')).toBeNull();
  });

  it('pickBrandStampIdx role-aware skips hook/cta/data and picks an eligible slide', () => {
    const idx = pickBrandStampIdx(
      [
        { idx: 0, role: 'hook' },
        { idx: 1, role: 'problem' },
        { idx: 2, role: 'data' },
        { idx: 3, role: 'insight' },
        { idx: 4, role: 'example' },
        { idx: 5, role: 'cta' },
      ],
      'carousel-abc-123',
    );
    expect([1, 3, 4]).toContain(idx);
  });

  it('renders a stamped slide for each preset (visual sample written to tmp-carousel-samples/)', async () => {
    await mkdir(OUT_DIR, { recursive: true });

    const base = await makeBase();
    const slide: SlideSpec = {
      idx: 1,
      role: 'problem',
      headline: 'No te paga el tiempo',
      body: 'Si cobrás por hora, ganás cuando trabajás más. El modelo está roto.',
      visualPrompt: 'test',
    };

    for (const [name, preset] of Object.entries(STYLE_PRESETS)) {
      for (const brandName of ['APEX', 'Assistify']) {
        const composed = await composeSlide({
          baseImage: base,
          slide,
          preset,
          brandStamp: brandName,
        });

        const meta = await sharp(composed).metadata();
        expect(meta.width).toBe(1080);
        expect(meta.height).toBe(1350);
        expect(meta.format).toBe('png');
        expect(composed.length).toBeGreaterThan(1000);

        await writeFile(path.join(OUT_DIR, `stamp-${name}-${brandName}.png`), composed);

        // Stamped version should differ from un-stamped (proves the stamp layer was rendered).
        const noStamp = await composeSlide({ baseImage: base, slide, preset });
        expect(composed).not.toEqual(noStamp);
      }
    }
  }, 120_000);
});
