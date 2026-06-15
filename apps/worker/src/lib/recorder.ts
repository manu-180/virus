/// <reference lib="dom" />
/**
 * El Grabador — Playwright + FFmpeg demo-scroll recorder (Vidriera-Video C2)
 *
 * Produces the *raw* scroll clip for an APEX promo Reel: a smooth, constant-speed
 * vertical pan down a landing page, in the mandatory APEX format (1080×1920, 9:16,
 * H.264, 30fps). This is the recorder for Tarea 1 (one page); the multi-route
 * generalisation is Tarea 2 (see libre_albedrio/tools/vidriera-video.md §7).
 *
 * Technique (per the `formato-video-apex` memory — "la vez de Nebula"):
 *   1. Playwright renders the page at a mobile viewport (~540 CSS px) with
 *      deviceScaleFactor 2 → a crisp 1080-wide full-page screenshot.
 *   2. FFmpeg crops a 1080×1920 window and pans its y-offset linearly over the
 *      whole clip, reaching the bottom only on the final frame. The pan never
 *      freezes — the silent ~1.8s tail is just the last stretch of the same
 *      constant-speed motion (formato-video-apex §2: "NO congelar").
 *
 * A static screenshot + math pan (rather than Playwright's native video capture)
 * is deliberate: it gives perfectly constant speed, exact format output, and a
 * trivially controllable tail — the motion in the final Reel comes from the pan,
 * not from in-page animation.
 *
 * The clip is duration-anchored: it traverses the WHOLE page over `durationSec`,
 * reaching the bottom on the last frame. The production path passes
 * `durationSec = voiceOverSeconds + TAIL` (a bit LONGER than the audio): the
 * editor_machine engine (pipeline step 5) syncs the narrated stretch to the
 * voice-over and the surplus becomes the silent ~1.8s tail. Because the page is
 * always traversed in ~the narration time, a taller page simply scrolls faster —
 * the format constant is "whole page, in VO time", not a fixed px/s.
 *
 * `speedPxPerSec` is an optional override for a fixed constant speed (duration
 * then falls out of the page height); without either knob a sane reel-length
 * default is used.
 *
 * FFmpeg is invoked with an argv array (no shell), so the crop expression needs
 * no escaping; we also avoid the `(W-w)/2:` form the engine sandbox mis-reads as
 * a path (formato-video-apex gotcha #2).
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type Browser } from 'playwright';

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

// x264 preset for the intermediate scroll encode. The recorder's output is
// re-encoded twice downstream (editor_machine trims+burns subs, then the outro
// compose), so its intermediate quality barely matters — on a loaded machine
// set RECORDER_X264_PRESET=ultrafast to avoid slow/CPU-starved encodes.
const X264_PRESET = process.env['RECORDER_X264_PRESET'] ?? 'medium';

// APEX standard output (formato-video-apex): vertical 1080×1920 9:16, 30fps.
const OUT_W = 1080;
const OUT_H = 1920;
const DEFAULT_FPS = 30;

// Mobile capture: 540 CSS px wide × dsf 2 = 1080 device px (the output width).
const VIEWPORT_CSS_W = 540;
const VIEWPORT_CSS_H = 960;
const DEVICE_SCALE = 2;

// Reel-length default when no duration/speed is given: ≈ a 30s voice-over + a
// ~2s tail. The production path passes `durationSec = voiceOverSeconds + TAIL`.
const DEFAULT_DURATION_SEC = 32;

export interface RecordDemoScrollInput {
  /** Demo URL to record (live Vercel URL or any reachable https page). */
  url: string;
  /** Absolute path for the final .mp4. */
  outPath: string;
  /** Total clip duration (s) — the whole page is traversed over this. Primary knob. */
  durationSec?: number;
  /** Fixed pan speed in output device px/s (overrides the default; ignored if `durationSec` set). */
  speedPxPerSec?: number;
  /** Output frame rate. Default 30 (APEX standard). */
  fps?: number;
  /** Where to keep the intermediate full-page PNG. Default: alongside outPath. */
  screenshotPath?: string;
  /** Collapse large empty bands so the scroll stays content-dense. Default true. */
  depad?: boolean;
}

export interface RecordDemoScrollResult {
  outPath: string;
  /** Final clip duration in seconds. */
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  /** Height of the captured page in output device px (after any width-normalise). */
  pageHeightPx: number;
  /** Effective constant pan speed in device px/s. */
  panSpeedPxPerSec: number;
  /** The intermediate full-page screenshot (kept for inspection). */
  screenshotPath: string;
  /** Device px of empty space removed by the de-pad pass (0 if none/disabled). */
  collapsedPx: number;
}

/**
 * Record a constant-speed scroll of `url` into a 1080×1920 mp4 at `outPath`.
 * Launches headless Chromium, captures one tall screenshot, and pans it with
 * FFmpeg. Caller owns `outPath`'s directory existence is handled here.
 */
export async function recordDemoScroll(
  input: RecordDemoScrollInput,
): Promise<RecordDemoScrollResult> {
  const fps = input.fps ?? DEFAULT_FPS;
  const screenshotPath = input.screenshotPath ?? input.outPath.replace(/\.mp4$/i, '.page.png');

  await mkdir(dirname(input.outPath), { recursive: true });
  await mkdir(dirname(screenshotPath), { recursive: true });

  // ── 1. Capture the full page ────────────────────────────────────────────
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true, args: ['--hide-scrollbars'] });
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_CSS_W, height: VIEWPORT_CSS_H },
      deviceScaleFactor: DEVICE_SCALE,
      // Render the page in its calm, final state: respect reduced-motion and
      // freeze CSS animations to their end frame when we shoot.
      reducedMotion: 'reduce',
    });
    // tsx/esbuild (keepNames) wraps functions sent to page.evaluate() in
    // __name(...) calls that don't exist in the page world → shim it as identity.
    await context.addInitScript(() => {
      const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
      if (!g.__name) g.__name = (fn) => fn;
    });
    const page = await context.newPage();

    await page.goto(input.url, { waitUntil: 'load', timeout: 60_000 });
    // networkidle is best-effort — sites with long-poll/analytics never idle.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Collapse entrance animations/transitions to ~instant so scroll-reveal
    // sections land on their final (visible) frame instead of being captured
    // mid-fade. Pairs with the opacity sweep below for JS-driven reveals.
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation-duration:.001s!important;animation-delay:0s!important;' +
        'transition-duration:.001s!important;transition-delay:0s!important;scroll-behavior:auto!important}',
    });

    // Trigger lazy images + scroll-reveal animations, then return to the top.
    await primePage(page);

    // Belt-and-suspenders for JS reveals (framer-motion `whileInView`, etc.):
    // force any element left semi-transparent to fully visible. Opacity only —
    // we deliberately leave transforms alone so we don't displace UI.
    await page.evaluate(() => {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        if (parseFloat(getComputedStyle(el).opacity) < 1) {
          (el as HTMLElement).style.setProperty('opacity', '1', 'important');
        }
      }
    });

    // Web fonts in before the shot (avoid capturing a fallback-font flash).
    await page.evaluate(() => (document as Document & { fonts?: FontFaceSet }).fonts?.ready);
    await page.waitForTimeout(600);

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      animations: 'disabled',
      type: 'png',
      timeout: 60_000,
    });
  } finally {
    await browser?.close();
  }

  // ── 2. Collapse big empty bands so the scroll stays content-dense ───────
  const depadded = await depadScreenshot(screenshotPath, input.depad === false);
  const panSource = depadded.path;

  // ── 3. Normalise dimensions + compute the pan ──────────────────────────
  const shot = await probeDimensions(panSource);
  const needScale = shot.width !== OUT_W;
  const pageHeightPx = needScale ? Math.round((shot.height * OUT_W) / shot.width) : shot.height;
  const panDistance = pageHeightPx - OUT_H;
  if (panDistance <= 0) {
    throw new Error(
      `page too short to scroll: captured ${OUT_W}×${pageHeightPx}, need height > ${OUT_H}. ` +
        `(${input.url})`,
    );
  }

  const durationSec =
    input.durationSec ??
    (input.speedPxPerSec ? panDistance / input.speedPxPerSec : DEFAULT_DURATION_SEC);
  const frames = Math.max(2, Math.round(durationSec * fps));
  const durFinal = frames / fps;
  const ratePxPerSec = panDistance / durFinal; // exact: pan hits bottom at the end

  // Crop a 1080×1920 window whose y grows linearly. min() clamps the final
  // sub-frame so we never read out of bounds (leave a 2px safety margin for the
  // width-normalise rounding). No division in the expression, no `/N:` form.
  const maxOffset = Math.max(0, panDistance - 2);
  const cropY = `min(${ratePxPerSec.toFixed(4)}*t\\,${maxOffset})`;
  const vf =
    (needScale ? `scale=${OUT_W}:-2,` : '') +
    `crop=${OUT_W}:${OUT_H}:0:${cropY},format=yuv420p`;

  // ── 4. Render the pan ──────────────────────────────────────────────────
  await runFfmpeg([
    '-y',
    '-loop', '1',
    '-framerate', String(fps),
    '-t', durFinal.toFixed(3),
    '-i', panSource,
    '-vf', vf,
    '-r', String(fps),
    '-c:v', 'libx264',
    '-preset', X264_PRESET,
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    input.outPath,
  ]);

  return {
    outPath: input.outPath,
    durationSec: durFinal,
    width: OUT_W,
    height: OUT_H,
    fps,
    pageHeightPx,
    panSpeedPxPerSec: ratePxPerSec,
    screenshotPath,
    collapsedPx: depadded.collapsedPx,
  };
}

/**
 * Scroll the page top→bottom in steps (firing IntersectionObserver reveals and
 * loading lazy images), wait for those images to settle, then scroll back up.
 */
async function primePage(page: import('playwright').Page): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
    const maxY = () => document.body.scrollHeight - window.innerHeight;
    for (let y = 0; y < maxY(); y += step) {
      window.scrollTo(0, y);
      await sleep(120);
    }
    window.scrollTo(0, maxY());
    await sleep(400);
    // Wait for any images that started loading during the pass.
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise<void>((res) => {
              img.addEventListener('load', () => res(), { once: true });
              img.addEventListener('error', () => res(), { once: true });
            }),
        ),
    );
    window.scrollTo(0, 0);
    await sleep(400);
  });
}

// Empty-band collapse tunables.
const DEPAD_MIN_GAP = 520; // device px — only bands at least this tall collapse
const DEPAD_BREATH = 150; // device px each collapsed band keeps (a small breath)
const DEPAD_EDGE_EMPTY = 3; // per-row edge energy at/below this = "empty"

/**
 * Collapse tall empty bands (large flat gaps with no content) in a full-page
 * screenshot down to a small fixed "breath", re-stitching the kept slices with
 * one FFmpeg vstack. Detection is background-agnostic: it profiles per-row edge
 * energy (edgedetect → averaged to a 1px column), so it works on dark and light
 * themes alike. Returns the source untouched when nothing big is found.
 */
async function depadScreenshot(
  src: string,
  disabled: boolean,
): Promise<{ path: string; collapsedPx: number }> {
  if (disabled) return { path: src, collapsedPx: 0 };

  const { width, height } = await probeDimensions(src);
  // Per-row edge energy: edges→bright, flat background→~0, averaged to width 1.
  const profile = await runRaw(FFMPEG, [
    '-v', 'error',
    '-i', src,
    '-vf', 'format=gray,edgedetect=low=0.1:high=0.3,format=gray,scale=1:ih',
    '-f', 'rawvideo',
    '-pix_fmt', 'gray',
    '-',
  ]);
  const rows = Math.min(profile.length, height);

  // Maximal runs of empty rows that are tall enough to be worth collapsing.
  const gaps: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let y = 0; y < rows; y++) {
    const empty = (profile[y] ?? 255) <= DEPAD_EDGE_EMPTY;
    if (empty && runStart < 0) runStart = y;
    if ((!empty || y === rows - 1) && runStart >= 0) {
      const end = empty ? y + 1 : y; // exclusive
      if (end - runStart >= DEPAD_MIN_GAP) gaps.push({ start: runStart, end });
      runStart = -1;
    }
  }
  if (gaps.length === 0) return { path: src, collapsedPx: 0 };

  // Kept slices: content between gaps + a BREATH-tall slice cropped from inside
  // each gap (so the bg colour/gradient is preserved, not a hard cut).
  const slices: Array<{ y: number; h: number }> = [];
  let cursor = 0;
  let collapsedPx = 0;
  for (const g of gaps) {
    if (g.start > cursor) slices.push({ y: cursor, h: g.start - cursor });
    const breath = Math.min(DEPAD_BREATH, g.end - g.start);
    slices.push({ y: g.start, h: breath });
    collapsedPx += g.end - g.start - breath;
    cursor = g.end;
  }
  if (cursor < height) slices.push({ y: cursor, h: height - cursor });

  // One split → per-slice crop → vstack, all from the same source image.
  const n = slices.length;
  const splitLabels = slices.map((_, i) => `[a${i}]`).join('');
  const crops = slices.map((s, i) => `[a${i}]crop=${width}:${s.h}:0:${s.y}[s${i}]`).join(';');
  const stackInputs = slices.map((_, i) => `[s${i}]`).join('');
  const fc = `[0:v]split=${n}${splitLabels};${crops};${stackInputs}vstack=inputs=${n}[o]`;

  const dst = src.replace(/\.png$/i, '.depad.png');
  await runFfmpeg([
    '-v', 'error',
    '-i', src,
    '-filter_complex', fc,
    '-map', '[o]',
    '-frames:v', '1',
    dst,
  ]);
  return { path: dst, collapsedPx };
}

// ── FFmpeg / FFprobe helpers ─────────────────────────────────────────────

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

/** Spawn a binary and resolve its raw stdout as a Buffer (rejects non-zero). */
function runRaw(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (d) => chunks.push(d as Buffer));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`${bin} exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}
