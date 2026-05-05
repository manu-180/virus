import LumaAI from 'lumaai';

/**
 * Input for {@link generateVideoLuma}. Driven by the prompt builder + asset
 * choices: caller decides duration (5-10s) and aspect ratio per slot.
 */
export interface LumaGenInput {
  /** Final prompt text (already includes style + negative tags). */
  prompt: string;
  /** Clip duration in seconds. Luma accepts 5..10 in `${n}s` form. */
  durationSec: number;
  /** Aspect ratio. Default `9:16` for vertical short-form. */
  aspectRatio?: '9:16' | '1:1' | '16:9';
  /**
   * Theme color (e.g. `#3ECF8E`). Currently informational — Luma doesn't take
   * a colour parameter; the prompt builder bakes the accent into the text.
   * Kept on the input shape so callers don't have to re-wire if Luma adds it.
   */
  themeColor: string;
}

/** Successful Luma generation result. Includes raw mp4 bytes ready to upload. */
export interface LumaGenOutput {
  /** Raw mp4 bytes downloaded from `assets.video`. */
  bytes: Buffer;
  /** Echoed back from input — Luma doesn't reliably return this. */
  durationSec: number;
  /** Hardcoded for the 720p vertical preset we request. */
  width: number;
  height: number;
  /** USD cost based on Luma Ray 2 720p pricing ($0.06 / second). */
  costUsd: number;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;

/** Luma Ray 2 at 720p: USD per second of generated video. */
const LUMA_RAY_2_USD_PER_SECOND = 0.06;

/**
 * Generate a short cinematic video clip with Luma Ray 2.
 *
 * - Reads `LUMA_API_KEY` from `process.env`. Throws if missing.
 * - Hard-times-out polling at 120s.
 * - Returns mp4 bytes (Node `Buffer`) so the caller can upload to storage.
 *
 * Pricing as of 2026-05: Luma Ray 2 @ 720p = $0.06/sec. Override the model
 * via `ASSETS_LUMA_MODEL` env var if needed (defaults to `ray-2`).
 */
export async function generateVideoLuma(input: LumaGenInput): Promise<LumaGenOutput> {
  const apiKey = process.env['LUMA_API_KEY'];
  if (!apiKey) {
    throw new Error('LUMA_API_KEY is not set');
  }

  const client = new LumaAI({ authToken: apiKey });
  const model = resolveLumaModel(process.env['ASSETS_LUMA_MODEL']);

  const created = await client.generations.create({
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? '9:16',
    duration: `${input.durationSec}s` as `${number}s`,
    model,
    resolution: '720p',
    loop: false,
  });

  if (!created.id) {
    throw new Error('luma_no_generation_id');
  }

  const startedAt = Date.now();
  let current = created;

  while (current.state !== 'completed' && current.state !== 'failed') {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('luma_timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    current = await client.generations.get(current.id!);
  }

  if (current.state === 'failed') {
    throw new Error(`luma_failed: ${current.failure_reason ?? 'unknown'}`);
  }

  const videoUrl = current.assets?.video;
  if (!videoUrl) {
    throw new Error('luma_no_video_url');
  }

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`luma_download_failed: ${res.status}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());

  // 720p vertical: 720x1280. Luma's Ray-2 720p preset returns this for 9:16.
  // We hardcode because the SDK doesn't reliably expose dimensions at this layer.
  const aspectRatio = input.aspectRatio ?? '9:16';
  const [width, height] = dimensionsFor720p(aspectRatio);

  return {
    bytes,
    durationSec: input.durationSec,
    width,
    height,
    costUsd: LUMA_RAY_2_USD_PER_SECOND * input.durationSec,
  };
}

type LumaModel = 'ray-2' | 'ray-flash-2';

function resolveLumaModel(override: string | undefined): LumaModel {
  if (override === 'ray-2' || override === 'ray-flash-2') return override;
  return 'ray-2';
}

function dimensionsFor720p(aspectRatio: '9:16' | '1:1' | '16:9'): [number, number] {
  switch (aspectRatio) {
    case '9:16':
      return [720, 1280];
    case '16:9':
      return [1280, 720];
    case '1:1':
      return [720, 720];
  }
}
