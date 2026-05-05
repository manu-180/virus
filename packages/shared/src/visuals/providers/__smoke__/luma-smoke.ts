/**
 * Manual smoke test for {@link generateVideoLuma}. NOT a unit test — hits the
 * real Luma API and burns credits. Run on demand:
 *
 *     LUMA_API_KEY=... pnpm tsx packages/shared/src/visuals/providers/__smoke__/luma-smoke.ts
 *
 * Writes the result to `/tmp/luma-smoke.mp4` (or the OS temp dir on Windows).
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateVideoLuma } from '../luma.js';

async function main(): Promise<void> {
  const out = await generateVideoLuma({
    prompt:
      'developer terminal with green code on a dark monitor, shallow depth of field, ' +
      'volumetric light shafts, dust particles in the air, #3ECF8E neon accent, ' +
      'cinematic dev noir style. AVOID: matrix code rain, glitch effect, deformed hands.',
    durationSec: 5,
    aspectRatio: '9:16',
    themeColor: '#3ECF8E',
  });

  const path = join(tmpdir(), 'luma-smoke.mp4');
  writeFileSync(path, out.bytes);
  console.log(
    `[luma-smoke] wrote ${out.bytes.byteLength} bytes to ${path} ` +
      `(duration=${out.durationSec}s, ${out.width}x${out.height}, $${out.costUsd.toFixed(3)})`,
  );
}

main().catch((err) => {
  console.error('[luma-smoke] failed:', err);
  process.exit(1);
});
