/// <reference types="node" />
/**
 * S5 SPIKE — compose the editor_machine render with the APEX outro (xfade).
 *
 * Throwaway/manual driver: proves the outro + transition step (Vidriera-Video
 * C3 / §3.6) produces a clean 1080×1920 clip with a smooth crossfade into the
 * neon APEX logo and no black bars. NOT wired into Inngest (Horno phase).
 *
 * Needs no env/secrets — pure local FFmpeg on two local files.
 *
 * Run (from anywhere; absolute paths):
 *   pnpm --filter @virus/worker exec tsx \
 *     "C:\MisProyectos\Armagedon\vhirus\apps\worker\scripts\spike-compose-outro.ts"
 *
 * Flags: [--in <abs path>] [--outro <abs path>] [--out <abs path>] [--xfade <sec>]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeWithOutro } from '../src/lib/compose.js';

// The APEX neon outro lives in the (closed) editor_machine repo's assets.
const DEFAULT_OUTRO =
  'C:\\MisProyectos\\Armagedon\\editor_machine\\assets\\apex-outro.mp4';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const workerDir = dirname(here);
  const rec = (p: string) => join(workerDir, 'tmp-recordings', p);

  const inPath = flag('in') ?? rec('nebula-render.mp4');
  const outroPath = flag('outro') ?? DEFAULT_OUTRO;
  const outPath = flag('out') ?? rec('nebula-final.mp4');
  const xfade = flag('xfade');

  console.log(`[S5] in=${inPath}`);
  console.log(`[S5] outro=${outroPath}`);
  console.log(`[S5] out=${outPath}`);
  const t0 = Date.now();

  const result = await composeWithOutro({
    inPath,
    outroPath,
    outPath,
    xfadeSec: xfade ? Number(xfade) : undefined,
  });

  console.log(`[S5] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('COMPOSE FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
