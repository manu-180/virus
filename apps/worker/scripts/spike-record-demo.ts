/**
 * S2 SPIKE — record ONE demo scroll with the new recorder (El Grabador).
 *
 * Throwaway/manual driver: validates the Playwright + FFmpeg pan end-to-end and
 * lets us eyeball the scroll speed / tail on a real demo. It is NOT wired into
 * Inngest — the durable orchestrator is Horno-phase work (see
 * libre_albedrio/tools/vidriera-video.md §9). This script just proves the lib.
 *
 * It needs no env/secrets: the recorder only fetches a public demo URL and
 * shells out to local FFmpeg.
 *
 * Run (from apps/worker):
 *   tsx scripts/spike-record-demo.ts <url> [--out <path>] [--speed <pxPerSec>] [--duration <sec>]
 *
 * Examples:
 *   tsx scripts/spike-record-demo.ts https://nebula-delta-henna.vercel.app
 *   tsx scripts/spike-record-demo.ts https://nebula-delta-henna.vercel.app --speed 180
 */
import { recordDemoScroll } from '../src/lib/recorder.js';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url || url.startsWith('--')) {
    throw new Error('usage: tsx scripts/spike-record-demo.ts <url> [--out p] [--speed n] [--duration n]');
  }

  const host = new URL(url).hostname.replace(/[^a-z0-9]+/gi, '-');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = flag('out') ?? `tmp-recordings/${host}-${stamp}.mp4`;
  const speed = flag('speed');
  const duration = flag('duration');

  console.log(`[rec] ${url}`);
  console.log(`[rec] out=${outPath}${speed ? ` speed=${speed}px/s` : ''}${duration ? ` duration=${duration}s` : ''}`);
  const t0 = Date.now();

  const result = await recordDemoScroll({
    url,
    outPath,
    speedPxPerSec: speed ? Number(speed) : undefined,
    durationSec: duration ? Number(duration) : undefined,
  });

  console.log(`[rec] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('RECORD FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
