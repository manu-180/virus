/**
 * CLI smoke test for the Remotion Lambda render client.
 *
 * Usage:
 *   pnpm tsx packages/shared/scripts/try-render.ts
 *   pnpm tsx packages/shared/scripts/try-render.ts --composition tip --input path/to/sample.json
 *
 * Required env vars:
 *   REMOTION_LAMBDA_FUNCTION_NAME, REMOTION_SERVE_URL
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Optional:
 *   REMOTION_REGION (default: us-east-1)
 */

import { readFileSync } from 'node:fs';
import { startRender, pollRender, estimateRenderCost } from '../src/render/index.js';
import type { CompositionId } from '../src/render/index.js';

const POLL_INTERVAL_MS = 5_000;

function parseArgs(): { composition: CompositionId; inputPath: string | null } {
  const args = process.argv.slice(2);
  let composition: CompositionId = 'tip';
  let inputPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--composition' && args[i + 1]) composition = args[++i] as CompositionId;
    if (args[i] === '--input' && args[i + 1]) inputPath = args[++i] ?? null;
  }

  return { composition, inputPath };
}

function loadSampleInput(inputPath: string | null): unknown {
  if (inputPath) {
    return JSON.parse(readFileSync(inputPath, 'utf-8'));
  }
  // Minimal valid sample for smoke testing
  return {
    totalDurationSec: 30,
    themeColor: '#0175C2',
    language: 'es',
    audioUrl: 'https://example.com/audio.mp3',
    segments: [
      {
        index: 0,
        role: 'hook',
        startSec: 0,
        endSec: 5,
        voiceover: 'Esto es un hook',
        visualCue: 'Zoom in on title',
      },
    ],
    captions: { words: [{ text: 'Esto', startMs: 0, endMs: 500 }] },
    brand: { handle: '@test' },
  };
}

async function main(): Promise<void> {
  const { composition, inputPath } = parseArgs();
  const inputProps = loadSampleInput(inputPath);

  console.log(`[try-render] composition=${composition}`);
  console.log(`[try-render] inputProps preview:`, JSON.stringify(inputProps).slice(0, 200));

  const { renderId, bucketName } = await startRender({
    composition,
    inputProps: inputProps as Parameters<typeof startRender>[0]['inputProps'],
  });

  console.log(`[try-render] job started renderId=${renderId} bucket=${bucketName}`);
  console.log(`[try-render] polling every ${POLL_INTERVAL_MS / 1000}s...`);

  let done = false;
  while (!done) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const result = await pollRender({ renderId, bucketName });
    const pct = (result.overallProgress * 100).toFixed(0);
    console.log(`[try-render] progress=${pct}% done=${result.done}`);

    if (result.errors?.length) {
      console.error('[try-render] ERRORS:', result.errors);
      process.exit(1);
    }

    if (result.done) {
      done = true;
      console.log(`[try-render] ✓ complete outputFile=${result.outputFile}`);
      const durationSec = 30; // approximation for cost display
      console.log(`[try-render] estimatedCost=$${estimateRenderCost(durationSec).toFixed(4)}`);
    }
  }
}

main().catch((err) => {
  console.error('[try-render] fatal:', err);
  process.exit(1);
});
