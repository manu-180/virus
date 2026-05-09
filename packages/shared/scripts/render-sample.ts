import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { composeSlide } from '../src/carousel/composer.js';
import { STYLE_PRESETS } from '../src/carousel/templates.js';
import type { SlideSpec } from '../src/carousel/types.js';

const OUT_DIR = 'tmp-carousel-samples';

// 3 representative slides: hook, data (with leading stat), cta
const SAMPLE_SLIDES: SlideSpec[] = [
  {
    idx: 0,
    role: 'hook',
    headline: '¿Por qué el 90% de los creadores fracasa en 6 meses?',
    body: 'No es falta de talento. Es falta de sistema.',
    visualPrompt: 'Dramatic dark background with subtle depth',
  },
  {
    idx: 3,
    role: 'data',
    headline: 'Los números no mienten',
    body: '73% de los sitios web pierden el 50% de sus visitas en el primer mes.',
    visualPrompt: 'Abstract data visualization, minimal geometric shapes',
  },
  {
    idx: 7,
    role: 'cta',
    headline: 'Seguinos y te mostramos cómo',
    body: 'Cada semana: estrategias que funcionan, sin vueltas.',
    visualPrompt: 'Bold call-to-action composition, forward motion',
  },
];

// Base images: different solid colors per role to make overlays easier to see
const BASE_COLORS: Record<string, { r: number; g: number; b: number }> = {
  hook: { r: 15, g: 15, b: 25 },
  data: { r: 10, g: 20, b: 15 },
  cta: { r: 25, g: 10, b: 10 },
};

async function makeBaseImage(role: string): Promise<Buffer> {
  const bg = BASE_COLORS[role] ?? { r: 20, g: 20, b: 20 };
  return sharp({
    create: { width: 1080, height: 1350, channels: 3, background: bg },
  })
    .png()
    .toBuffer();
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    await mkdir(OUT_DIR, { recursive: true });
  }

  const presetNames = Object.keys(STYLE_PRESETS) as Array<keyof typeof STYLE_PRESETS>;

  for (const presetName of presetNames) {
    const preset = STYLE_PRESETS[presetName];

    for (const slide of SAMPLE_SLIDES) {
      const baseImage = await makeBaseImage(slide.role);
      const composed = await composeSlide({ baseImage, slide, preset });
      const filename = `${OUT_DIR}/${presetName}-${slide.role}-slide${slide.idx}.png`;
      await writeFile(filename, composed);
      console.log(`  ${filename}  (${(composed.length / 1024).toFixed(0)} KB)`);
    }
  }

  console.log(`\nDone! Open ${OUT_DIR}/ to review the 9 samples.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
