/// <reference lib="dom" />
/**
 * El Grabador v2 — Playwright LIVE VIDEO recorder (Vidriera-Video C2)
 *
 * Replaced the screenshot+FFmpeg-pan approach with real browser video capture.
 * Playwright records the browser rendering live while JS scrolls the page smoothly,
 * so scroll-reveal animations, CSS transitions, and Intersection Observer effects
 * fire naturally — producing a genuine video instead of a panned static image.
 *
 * Technique:
 *   1. Browser context opens with `recordVideo` enabled (Playwright WebM capture).
 *   2. Page loads at 540 CSS px mobile viewport; initial animations settle (1.5s).
 *   3. A rAF + performance.now loop scrolls top → target over the scroll window.
 *   4. Brief hold at the bottom; page/context close → WebM finalised on disk.
 *   5. FFmpeg TRIMS the blank load lead-in (see below) and scales the 540×960 WebM
 *      → 1080×1920 H.264 mp4 (APEX standard format).
 *
 * `maxSpeedPxPerSec` caps the scroll speed (device px/s) exactly as before:
 * tall pages show the top portion at a calm speed instead of racing in `durationSec`.
 *
 * TWO ROBUSTNESS FIXES (2026-06-17, Manuel reported white opening + no-scroll):
 *   • White first frame — Playwright records from page creation, so the WebM
 *     opens with `about:blank` + the whole load (goto/networkidle/fonts) IN WHITE.
 *     We measure that lead-in (record-start → content-ready) and FFmpeg-trim it off
 *     the front, so the clip opens on the SETTLED hero, never on a blank screen.
 *   • Page that "barely scrolls" — `document.body.scrollHeight` under-reports on
 *     app-shell sites (Next.js with a nested overflow container, or scroll on
 *     <html>). We now take the max of body/documentElement metrics AND detect the
 *     tallest in-page overflow container, then scroll WHICHEVER actually moves.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium, type Browser } from 'playwright';

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

const X264_PRESET = process.env['RECORDER_X264_PRESET'] ?? 'medium';

// APEX standard output (formato-video-apex): vertical 1080×1920 9:16, 30fps.
const OUT_W = 1080;
const OUT_H = 1920;
const DEFAULT_FPS = 30;

// Mobile viewport: 540 CSS px × dpr 2 = 1080 device px (crisp retina rendering).
const VIEWPORT_CSS_W = 540;
const VIEWPORT_CSS_H = 960;
const DEVICE_SCALE = 2;

// Default clip duration when no `durationSec` given (≈ 30s VO + ~2s tail).
const DEFAULT_DURATION_SEC = 32;

// Settle time before scrolling: hero animations + font renders complete.
const SETTLE_BEFORE_SEC = 1.5;
// Brief hold at the bottom after the scroll completes.
const PAUSE_BOTTOM_SEC = 0.5;

// Default calm scroll cap — 195 device px/s → 97.5 CSS px/s.
const DEFAULT_MAX_SPEED_DEVICE_PX = 195;

export interface RecordDemoScrollInput {
  /** Demo URL to record (live Vercel URL or any reachable https page). */
  url: string;
  /** Absolute path for the final .mp4. */
  outPath: string;
  /** Total clip duration (s). The scroll is anchored to this window. Primary knob. */
  durationSec?: number;
  /** Unused in live-video mode (duration drives scroll speed). Kept for compat. */
  speedPxPerSec?: number;
  /** Output frame rate. Default 30 (APEX standard). */
  fps?: number;
  /** Unused in live-video mode. Kept for interface compat. */
  screenshotPath?: string;
  /** Unused in live-video mode. Kept for interface compat. */
  depad?: boolean;
  /**
   * Cap the scroll speed (device px/s). Tall pages show the top portion at a
   * calm constant speed instead of racing the whole page in `durationSec`.
   * Same semantics as the old pan-speed cap. Default: 195 device px/s.
   */
  maxSpeedPxPerSec?: number;
}

export interface RecordDemoScrollResult {
  outPath: string;
  /** Final clip duration in seconds (as probed by ffprobe). */
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  /** Page body height in output device px. */
  pageHeightPx: number;
  /** Effective scroll speed in device px/s. */
  panSpeedPxPerSec: number;
  /** Empty in live-video mode (no screenshot taken). */
  screenshotPath: string;
  /** Always 0 in live-video mode (no depad pass). */
  collapsedPx: number;
}

/**
 * Record a smooth browser scroll of `url` into a 1080×1920 mp4 at `outPath`.
 * Playwright captures live browser rendering; FFmpeg scales to the APEX format.
 */
export async function recordDemoScroll(
  input: RecordDemoScrollInput,
): Promise<RecordDemoScrollResult> {
  const fps = input.fps ?? DEFAULT_FPS;
  const totalDuration = input.durationSec ?? DEFAULT_DURATION_SEC;
  const maxSpeedDevicePx = input.maxSpeedPxPerSec ?? DEFAULT_MAX_SPEED_DEVICE_PX;
  const maxSpeedCssPx = maxSpeedDevicePx / DEVICE_SCALE;

  await mkdir(dirname(input.outPath), { recursive: true });
  const videoDir = await mkdtemp(join(tmpdir(), 'vidriera-rec-'));

  const scrollWindowSec = Math.max(0.5, totalDuration - SETTLE_BEFORE_SEC - PAUSE_BOTTOM_SEC);

  let browser: Browser | null = null;
  let pageBodyHeightCss = 0;
  let targetScrollCssPx = 0;
  // Blank load lead-in (s) to trim off the front of the WebM (white-frame fix).
  let leadInSec = 0;

  try {
    browser = await chromium.launch({
      headless: true,
      // --no-sandbox + --disable-dev-shm-usage keep headless Chromium alive inside
      // the Railway container (non-root node user, small /dev/shm).
      args: ['--hide-scrollbars', '--no-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      viewport: { width: VIEWPORT_CSS_W, height: VIEWPORT_CSS_H },
      deviceScaleFactor: DEVICE_SCALE,
      // Live video capture — no reducedMotion, animations run as authored.
      recordVideo: {
        dir: videoDir,
        size: { width: VIEWPORT_CSS_W, height: VIEWPORT_CSS_H },
      },
    });

    // tsx/esbuild (keepNames) wraps evaluate() callbacks in __name() calls that
    // don't exist in the page world → shim as identity so they don't throw.
    await context.addInitScript(() => {
      const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
      if (!g.__name) g.__name = (fn) => fn;
    });

    const page = await context.newPage();
    // Playwright starts recording at page creation: everything from here until
    // content is painted is the blank lead-in we trim off the front (bug #1).
    const recordStartMs = Date.now();

    await page.goto(input.url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Wait for web fonts so the first KEPT frame is fully painted (no FOUT).
    await page.evaluate(() => (document as Document & { fonts?: FontFaceSet }).fonts?.ready);
    // Everything before this instant is the blank/loading lead-in. Trimming up to
    // here keeps the full SETTLE hold below as the clip's opening (settled hero).
    leadInSec = Math.max(0, (Date.now() - recordStartMs) / 1000);

    // Hold on the settled hero before scrolling (this becomes the opening shot).
    await page.waitForTimeout(SETTLE_BEFORE_SEC * 1000);

    // Measure how far we can scroll AND on which scroller, then scroll it — all in
    // one page-world pass. Robust to app-shell layouts where the document doesn't
    // scroll (Next.js nested overflow container, or scroll on <html>): we take the
    // max of body/documentElement metrics and detect the tallest overflow:auto/scroll
    // descendant, then drive whichever actually moves (bug #2 — "barely scrolled").
    const scroll = await page.evaluate(
      async ({ maxSpeedCssPx: capPxPerSec, scrollWindowMs }: { maxSpeedCssPx: number; scrollWindowMs: number }) => {
        const de = document.documentElement;
        const body = document.body;
        const viewport = window.innerHeight || de.clientHeight || 0;
        const docHeight = Math.max(
          body ? body.scrollHeight : 0, de ? de.scrollHeight : 0,
          body ? body.offsetHeight : 0, de ? de.offsetHeight : 0,
        );
        let bestEl: Element | null = null;
        let bestMax = Math.max(0, docHeight - viewport); // document scroll capacity
        // App-shell: the real scroll often lives in a nested overflow container.
        const all = document.querySelectorAll('body *');
        for (let i = 0; i < all.length; i++) {
          const el = all[i] as Element;
          const cs = getComputedStyle(el);
          if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') continue;
          const max = el.scrollHeight - el.clientHeight;
          if (max > bestMax + 40) { bestMax = max; bestEl = el; }
        }
        // Cap the distance so tall pages stay calm (show the top, not a race).
        const cap = capPxPerSec * (scrollWindowMs / 1000);
        const targetPx = Math.min(bestMax, cap);
        const setY = bestEl
          ? (y: number) => { (bestEl as Element).scrollTop = y; }
          : (y: number) => { window.scrollTo(0, y); };
        if (targetPx > 0) {
          const start = performance.now();
          await new Promise<void>((resolve) => {
            const tick = () => {
              const t = Math.min((performance.now() - start) / scrollWindowMs, 1);
              setY(Math.round(targetPx * t));
              if (t < 1) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
        } else {
          await new Promise<void>((r) => setTimeout(r, scrollWindowMs));
        }
        return { targetPx, docHeight, usedContainer: !!bestEl, scrollableMax: bestMax };
      },
      { maxSpeedCssPx, scrollWindowMs: scrollWindowSec * 1000 },
    );
    pageBodyHeightCss = scroll.docHeight;
    targetScrollCssPx = scroll.targetPx;

    // Brief hold at the bottom.
    await page.waitForTimeout(PAUSE_BOTTOM_SEC * 1000);

    // Close page → video path becomes available.
    await page.close();
    const rawVideoPath = await page.video()!.path();

    // Close context → WebM is guaranteed written to disk.
    await context.close();

    // Trim the blank load lead-in (`-ss` after `-i` = frame-accurate, we re-encode
    // anyway) so the clip OPENS on the settled hero, then scale to APEX format.
    await runFfmpeg([
      '-y',
      '-i', rawVideoPath,
      '-ss', leadInSec.toFixed(3),
      '-vf', `scale=${OUT_W}:${OUT_H},format=yuv420p`,
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', X264_PRESET,
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      input.outPath,
    ]);
  } finally {
    await browser?.close();
  }

  const actualDuration = await probeDurationSec(input.outPath);
  const effectiveSpeedDevicePx =
    targetScrollCssPx > 0 ? (targetScrollCssPx * DEVICE_SCALE) / scrollWindowSec : 0;

  return {
    outPath: input.outPath,
    durationSec: actualDuration,
    width: OUT_W,
    height: OUT_H,
    fps,
    pageHeightPx: pageBodyHeightCss * DEVICE_SCALE,
    panSpeedPxPerSec: effectiveSpeedDevicePx,
    screenshotPath: '',
    collapsedPx: 0,
  };
}

// ── FFmpeg / FFprobe helpers ─────────────────────────────────────────────────

export async function probeDimensions(file: string): Promise<{ width: number; height: number }> {
  const out = await run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0:s=x',
    file,
  ]);
  const m = out.trim().match(/^(\d+)x(\d+)/);
  if (!m) throw new Error(`ffprobe could not read dimensions of ${file}: "${out.trim()}"`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export async function runFfmpeg(args: string[]): Promise<void> {
  await run(FFMPEG, args);
}

/** Probe a media file's container duration in seconds (0 if unreadable). */
export async function probeDurationSec(file: string): Promise<number> {
  const out = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nokey=1:noprint_wrappers=1',
    file,
  ]);
  const d = parseFloat(out.trim());
  return Number.isFinite(d) ? d : 0;
}

/** True if the media file carries at least one audio stream (a publish fail-safe). */
export async function probeHasAudioStream(file: string): Promise<boolean> {
  const out = await run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'a',
    '-show_entries', 'stream=index',
    '-of', 'csv=p=0',
    file,
  ]);
  return out.trim().length > 0;
}

/** Spawn a binary with an argv array and resolve its stdout (rejects non-zero). */
function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}
