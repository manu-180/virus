/**
 * Manual smoke test for {@link generateImageGemini}. NOT a unit test — hits the
 * real Imagen API and burns credits. Run on demand:
 *
 *     GOOGLE_AI_API_KEY=... pnpm tsx packages/shared/src/visuals/providers/__smoke__/gemini-smoke.ts
 *
 * Writes the result to the OS temp dir.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateImageGemini } from '../gemini.js';

async function main(): Promise<void> {
  const out = await generateImageGemini({
    prompt:
      'product photography style hero shot symbolizing "the key insight", ' +
      'shallow depth of field, volumetric light shafts, dust particles in the air, ' +
      '#3ECF8E neon accent, cinematic dev noir style. ' +
      'AVOID: matrix code rain, glitch effect, deformed hands, text artifacts.',
    aspectRatio: '9:16',
    themeColor: '#3ECF8E',
  });

  const path = join(tmpdir(), 'gemini-smoke.png');
  writeFileSync(path, out.bytes);
  console.log(
    `[gemini-smoke] wrote ${out.bytes.byteLength} bytes to ${path} ` +
      `(${out.width}x${out.height}, $${out.costUsd.toFixed(3)})`,
  );
}

main().catch((err) => {
  console.error('[gemini-smoke] failed:', err);
  process.exit(1);
});
