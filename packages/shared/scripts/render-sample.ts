import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { composeSlide } from '../src/carousel/composer.js';
import { STYLE_PRESETS } from '../src/carousel/templates.js';
import type { SlideSpec } from '../src/carousel/types.js';

const OUT_DIR = 'tmp-carousel-samples';

const SAMPLE_SLIDES: SlideSpec[] = [
  {
    idx: 0,
    role: 'hook',
    headline: '¿Por qué el 90% de los creadores fracasa en 6 meses?',
    body: 'No es falta de talento. Es falta de sistema.',
    visualPrompt: 'Dramatic dark background',
  },
  {
    idx: 1,
    role: 'insight',
    headline: 'La clave no es publicar más. Es publicar mejor.',
    body: 'Calidad > Cantidad. Siempre.',
    visualPrompt: 'Clean minimal composition',
  },
  {
    idx: 2,
    role: 'cta',
    headline: 'Seguinos y te mostramos cómo.',
    visualPrompt: 'Call to action bold colors',
  },
];

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    await mkdir(OUT_DIR, { recursive: true });
  }

  // Create a fake base image (dark background)
  const baseImage = await sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 20, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();

  const presetNames = Object.keys(STYLE_PRESETS) as Array<keyof typeof STYLE_PRESETS>;

  for (const presetName of presetNames) {
    const preset = STYLE_PRESETS[presetName];
    for (const slide of SAMPLE_SLIDES) {
      const composed = await composeSlide({ baseImage, slide, preset });
      const filename = `${OUT_DIR}/${presetName}-slide-${slide.idx}.png`;
      await writeFile(filename, composed);
      console.log(`Wrote ${filename} (${composed.length} bytes)`);
    }
  }

  console.log('Done! Open tmp-carousel-samples/ to review the output.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
