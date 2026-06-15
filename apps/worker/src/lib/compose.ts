/**
 * Outro composition (Vidriera-Video C3) — stitch the editor_machine render to
 * the APEX neon outro with a smooth crossfade, in the mandatory APEX format
 * (1080×1920, 9:16, H.264 + AAC, 30fps). This is the "outro + transición"
 * step the pipeline used to do by hand (formato-video-apex §"outro"); here it's
 * a reusable, deterministic FFmpeg pass.
 *
 * The outro asset is a different aspect ratio (the APEX logo clip is 978×2118),
 * so we DON'T letterbox with black bars: a blurred, zoomed copy fills the
 * 1080×1920 frame behind the aspect-correct logo (a "blurred-fill" background).
 *
 * FFmpeg gotchas honoured (formato-video-apex):
 *   - argv array, no shell → no escaping needed.
 *   - overlay/crop use LITERAL integer coords (computed here from the probed
 *     outro size) instead of the `(W-w)/2:` expression form that the editor
 *     sandbox mis-reads as a path — and which is brittle across contexts.
 *   - every branch feeding xfade gets `settb=1/fps` so the two inputs share a
 *     timebase (xfade silently mis-times otherwise).
 *
 * Reuses the FFmpeg/FFprobe runners from the recorder (one place spawns
 * processes) so this module stays pure filter-graph logic.
 */
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runFfmpeg, probeDurationSec, probeDimensions } from './recorder.js';

const OUT_W = 1080;
const OUT_H = 1920;
const DEFAULT_FPS = 30;
const DEFAULT_XFADE_SEC = 0.7;

// x264 preset for the FINAL composed reel. Quality matters more here (this is
// the published file), but at crf 18 the visual delta between presets is small —
// set COMPOSE_X264_PRESET=veryfast on a loaded machine to keep the encode quick.
const X264_PRESET = process.env['COMPOSE_X264_PRESET'] ?? 'medium';

export interface ComposeOutroInput {
  /** Main clip (the editor_machine render): 1080×1920 with an audio track. */
  inPath: string;
  /** Outro clip (apex-outro.mp4), any size/aspect, with or without audio. */
  outroPath: string;
  /** Absolute path for the final .mp4. */
  outPath: string;
  /** Crossfade duration in seconds. Default 0.7 (formato-video-apex). */
  xfadeSec?: number;
  /** Output frame rate. Default 30 (APEX standard). */
  fps?: number;
}

export interface ComposeOutroResult {
  outPath: string;
  /** Final composed duration (main + outro − xfade). */
  durationSec: number;
  mainSec: number;
  outroSec: number;
  xfadeSec: number;
}

/** Largest even integer ≤ n (libx264 needs even dimensions). */
function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r - 1;
}

/**
 * Compose `inPath` → crossfade → `outroPath` into a 1080×1920 mp4 at `outPath`.
 * The outro is fitted (aspect-preserving) over a blurred fill of itself.
 */
export async function composeWithOutro(input: ComposeOutroInput): Promise<ComposeOutroResult> {
  const fps = input.fps ?? DEFAULT_FPS;
  const xfade = input.xfadeSec ?? DEFAULT_XFADE_SEC;
  await mkdir(dirname(input.outPath), { recursive: true });

  const [mainSec, outroSec, outroDim] = await Promise.all([
    probeDurationSec(input.inPath),
    probeDurationSec(input.outroPath),
    probeDimensions(input.outroPath),
  ]);
  if (mainSec <= 0) throw new Error(`could not read main duration: ${input.inPath}`);
  if (outroSec <= 0) throw new Error(`could not read outro duration: ${input.outroPath}`);

  // Fit the outro inside 1080×1920 preserving aspect, then centre it (literal
  // coords). Outro is taller-than-9:16 → fits by height; the generic branch
  // also covers a wider outro.
  const fitByHeight = outroDim.width / outroDim.height < OUT_W / OUT_H;
  const fgW = fitByHeight ? even((OUT_H * outroDim.width) / outroDim.height) : OUT_W;
  const fgH = fitByHeight ? OUT_H : even((OUT_W * outroDim.height) / outroDim.width);
  const xOff = Math.max(0, Math.round((OUT_W - fgW) / 2));
  const yOff = Math.max(0, Math.round((OUT_H - fgH) / 2));

  // xfade starts xfade-seconds before the main clip ends.
  const offset = Math.max(0, mainSec - xfade);
  const tb = `settb=1/${fps}`;

  const fc = [
    // blurred fill background from the outro itself (cover then centre-crop)
    `[1:v]scale=${OUT_W}:-2,crop=${OUT_W}:${OUT_H},boxblur=24:2,setsar=1,fps=${fps},format=yuv420p,${tb}[obg]`,
    // aspect-correct outro logo
    `[1:v]scale=${fgW}:${fgH},setsar=1[ofg]`,
    `[obg][ofg]overlay=${xOff}:${yOff},format=yuv420p,${tb}[outv]`,
    // normalise the main clip to the exact format/timebase
    `[0:v]fps=${fps},scale=${OUT_W}:${OUT_H},setsar=1,format=yuv420p,${tb}[mainv]`,
    // crossfade video + audio
    `[mainv][outv]xfade=transition=fade:duration=${xfade}:offset=${offset.toFixed(3)}[vout]`,
    `[0:a][1:a]acrossfade=d=${xfade}[aout]`,
  ].join(';');

  await runFfmpeg([
    '-y',
    '-i', input.inPath,
    '-i', input.outroPath,
    '-filter_complex', fc,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', X264_PRESET,
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    input.outPath,
  ]);

  return {
    outPath: input.outPath,
    durationSec: offset + outroSec,
    mainSec,
    outroSec,
    xfadeSec: xfade,
  };
}
