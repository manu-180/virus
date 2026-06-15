/// <reference types="node" />
/**
 * S3 SPIKE — submit ONE job to the live editor_machine engine and pull the
 * render. Validates the cross-project wiring (vidriera-video §8): vhirus' worker
 * → editor_machine's Supabase Storage + em_jobs + /kick → render with karaoke
 * cyan subtitles. The actual contract lives in src/lib/editor-machine.ts (so the
 * Horno orchestrator reuses it); this is just a thin throwaway driver.
 *
 * Cross-project creds come from the worker env (§8). Run (absolute --env-file —
 * pnpm exec leaves CWD at the repo root):
 *   pnpm --filter @virus/worker exec tsx \
 *     --env-file="C:\MisProyectos\Armagedon\vhirus\apps\worker\.env.local" \
 *     "C:\MisProyectos\Armagedon\vhirus\apps\worker\scripts\spike-submit-editor.ts"
 *
 * Flags: [--video <abs path>] [--audio <abs path>] [--out <abs path>]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitEditorJob } from '../src/lib/editor-machine.js';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const workerDir = dirname(here);
  const rec = (p: string) => join(workerDir, 'tmp-recordings', p);

  const videoPath = flag('video') ?? rec('nebula-s3.mp4');
  const audioPath = flag('audio') ?? rec('nebula-vo.mp3');
  const outPath = flag('out') ?? rec('nebula-render.mp4');

  console.log(`[S3] video=${videoPath}`);
  console.log(`[S3] audio=${audioPath}`);
  console.log(`[S3] submitting to editor_machine (mode=fast, karaoke cyan, es)…`);

  const result = await submitEditorJob({
    videoPath,
    audioPath,
    outPath,
    onProgress: (tag, t) => console.log(`      [${t.toFixed(0)}s] ${tag}`),
  });

  console.log('\nS3 OK ✓ — editor_machine cableado validated end-to-end');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('S3 SPIKE FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
