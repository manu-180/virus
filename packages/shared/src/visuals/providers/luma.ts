/**
 * Luma Dream Machine provider — direct REST client.
 *
 * We use raw `fetch` (not the `lumaai` SDK) because the SDK's auth handling
 * has been flaky in our setup (returning 403 "Not authenticated" with valid
 * keys). The REST API is small and stable — wrapping it directly is simpler
 * and gives us deterministic auth behaviour: `Authorization: Bearer <key>`.
 *
 * API reference: https://docs.lumalabs.ai/docs/api
 */

const LUMA_API_BASE = 'https://api.lumalabs.ai/dream-machine/v1';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;

/** Luma Ray 2 at 720p: USD per second of generated video. */
const LUMA_RAY_2_USD_PER_SECOND = 0.06;

export interface LumaGenInput {
  /** Final prompt text (already includes style + negative tags). */
  prompt: string;
  /** Clip duration in seconds. Luma accepts 5..10 in `${n}s` form. */
  durationSec: number;
  /** Aspect ratio. Default `9:16` for vertical short-form. */
  aspectRatio?: '9:16' | '1:1' | '16:9';
  /**
   * Theme color — kept on the input shape for forward-compat. Luma doesn't
   * take a colour parameter today; the prompt builder bakes the accent in.
   */
  themeColor: string;
}

export interface LumaGenOutput {
  bytes: Buffer;
  durationSec: number;
  width: number;
  height: number;
  costUsd: number;
}

interface LumaGeneration {
  id: string;
  state: 'queued' | 'dreaming' | 'completed' | 'failed';
  failure_reason?: string | null;
  assets?: { video?: string | null } | null;
}

type LumaModel = 'ray-2' | 'ray-flash-2';

/**
 * Generate a short cinematic video clip with Luma Ray 2.
 *
 * - Reads `LUMA_API_KEY` from `process.env`. Throws if missing.
 * - Hard-times-out polling at 120s.
 * - Returns mp4 bytes (Node `Buffer`) so the caller can upload to storage.
 */
export async function generateVideoLuma(input: LumaGenInput): Promise<LumaGenOutput> {
  const apiKey = process.env['LUMA_API_KEY'];
  if (!apiKey) {
    throw new Error('LUMA_API_KEY is not set');
  }

  const model = resolveLumaModel(process.env['ASSETS_LUMA_MODEL']);
  const aspect = input.aspectRatio ?? '9:16';

  // ---- 1. Create generation -------------------------------------------------
  const createRes = await lumaFetch(`${LUMA_API_BASE}/generations`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: input.prompt,
      aspect_ratio: aspect,
      duration: `${input.durationSec}s`,
      model,
      resolution: '720p',
      loop: false,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`luma_create_failed: ${createRes.status} ${text.slice(0, 200)}`);
  }

  const created = (await createRes.json()) as LumaGeneration;
  if (!created.id) {
    throw new Error('luma_no_generation_id');
  }

  // ---- 2. Poll until complete ----------------------------------------------
  const startedAt = Date.now();
  let current = created;

  while (current.state !== 'completed' && current.state !== 'failed') {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('luma_timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const pollRes = await lumaFetch(`${LUMA_API_BASE}/generations/${current.id}`, apiKey);
    if (!pollRes.ok) {
      const text = await pollRes.text();
      throw new Error(`luma_poll_failed: ${pollRes.status} ${text.slice(0, 200)}`);
    }
    current = (await pollRes.json()) as LumaGeneration;
  }

  if (current.state === 'failed') {
    throw new Error(`luma_failed: ${current.failure_reason ?? 'unknown'}`);
  }

  const videoUrl = current.assets?.video;
  if (!videoUrl) {
    throw new Error('luma_no_video_url');
  }

  // ---- 3. Download mp4 ------------------------------------------------------
  const downloadRes = await fetch(videoUrl);
  if (!downloadRes.ok) {
    throw new Error(`luma_download_failed: ${downloadRes.status}`);
  }
  const bytes = Buffer.from(await downloadRes.arrayBuffer());

  const [width, height] = dimensionsFor720p(aspect);

  return {
    bytes,
    durationSec: input.durationSec,
    width,
    height,
    costUsd: LUMA_RAY_2_USD_PER_SECOND * input.durationSec,
  };
}

/** Wrapper around fetch that injects `Authorization: Bearer <key>`. */
async function lumaFetch(url: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${apiKey}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return fetch(url, { ...init, headers });
}

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
