/// <reference types="node" />
/**
 * Manual trigger for the Vidriera orchestrator (FASE HORNO).
 *
 * Sends the `vidriera/run.requested` event to Inngest Cloud (using the worker's
 * INNGEST_EVENT_KEY), which invokes the DEPLOYED orchestrator. Default = dryRun
 * (builds the video + runs the fail-safes but publishes NOTHING); pass --real to
 * allow an actual publish.
 *
 * Run (absolute --env-file — pnpm exec leaves CWD at the repo root):
 *   pnpm --filter @virus/worker exec tsx \
 *     --env-file="C:\MisProyectos\Armagedon\vhirus\apps\worker\.env.local" \
 *     "C:\MisProyectos\Armagedon\vhirus\apps\worker\scripts\trigger-vidriera.ts" [--real]
 */
import { inngest } from '../src/inngest/index.js';

async function main(): Promise<void> {
  const dryRun = !process.argv.includes('--real');
  console.log(`[trigger] sending vidriera/run.requested { dryRun: ${dryRun} }`);
  const res = await inngest.send({ name: 'vidriera/run.requested', data: { dryRun } });
  console.log('[trigger] sent OK:', JSON.stringify(res));
}

main().catch((e) => {
  console.error('TRIGGER FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
