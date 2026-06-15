import { spawn } from 'node:child_process';
import type { PostProcessOptions, PostProcessResult } from './types.js';

// Cached per-process so concurrent callers share one probe instead of racing.
let ffmpegAvailable: Promise<void> | undefined;

function checkFfmpeg(): Promise<void> {
  if (ffmpegAvailable !== undefined) return ffmpegAvailable;

  ffmpegAvailable = new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      ffmpegAvailable = undefined; // allow retry on transient failures
      if (err.code === 'ENOENT') {
        reject(new Error('ffmpeg not found in PATH. Please install ffmpeg: https://ffmpeg.org/download.html'));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        ffmpegAvailable = undefined; // allow retry
        reject(new Error(`ffmpeg probe exited with code ${code ?? 'null'}`));
      }
    });
  });

  return ffmpegAvailable;
}

function parseDurationSec(stderr: string): number {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (match === null) return 0;
  const [, h, m, s] = match;
  if (h === undefined || m === undefined || s === undefined) return 0;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export async function postProcess(opts: PostProcessOptions): Promise<PostProcessResult> {
  await checkFfmpeg();

  const speed = opts.speedMultiplier ?? 1.15;
  const hz = opts.highpassHz ?? 80;
  const lufs = opts.targetLufs ?? -15;

  const audioFilter = [
    `atempo=${speed}`,
    `highpass=f=${hz}`,
    `acompressor=threshold=-18dB:ratio=3:attack=20:release=250`,
    `loudnorm=I=${lufs}:LRA=11:TP=-1.5`,
  ].join(',');

  const args = [
    '-y',
    '-i', opts.inputPath,
    '-af', audioFilter,
    '-ar', '44100',
    '-b:a', '192k',
    opts.outputPath,
  ];

  return new Promise<PostProcessResult>((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

    const stderrChunks: string[] = [];
    let settled = false;

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    proc.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      const stderr = stderrChunks.join('');

      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code ?? 'null'}\n\nstderr:\n${stderr}`));
        return;
      }

      // `atempo=${speed}` scales duration by exactly 1/speed; ffmpeg's stderr
      // "Duration:" line is the INPUT length and no other filter here changes
      // length, so divide to get the true OUTPUT duration. (Parsing stderr
      // verbatim overstated it by the speed factor.) Keeps the
      // duration-anchored recorder honest in production.
      const inputDurationSec = parseDurationSec(stderr);
      resolve({
        filePath: opts.outputPath,
        durationSec: speed > 0 ? inputDurationSec / speed : inputDurationSec,
      });
    });
  });
}
