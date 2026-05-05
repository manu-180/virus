import { createWriteStream } from 'node:fs';
import { stat, rename, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { VOICE_PRESETS } from './voice-config.js';
import type { SynthesizeOptions, SynthesizeResult } from './types.js';

const execFileAsync = promisify(execFile);

export class ElevenLabsApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'ElevenLabsApiError';
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

function statusToCode(status: number): string {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 403) return 'FORBIDDEN';
  if (status >= 500) return 'SERVER_ERROR';
  return 'API_ERROR';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FfprobeOutput {
  streams: Array<{ duration?: string }>;
}

async function getDurationSec(filePath: string, bytes: number): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as FfprobeOutput;
    const durationStr = parsed.streams[0]?.duration;
    if (durationStr !== undefined) {
      const parsedDuration = parseFloat(durationStr);
      if (!isNaN(parsedDuration)) return parsedDuration;
    }
  } catch {
    // ffprobe unavailable or failed — fall through to bitrate estimate
  }
  // 192kbps = 192000 bits/sec = 24000 bytes/sec
  return bytes / (192000 / 8);
}

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  use_speaker_boost: boolean;
  style?: number;
}

async function attemptRequest(
  voiceId: string,
  apiKey: string,
  body: Record<string, unknown>,
  outputPath: string,
): Promise<void> {
  const tmpPath = `${outputPath}.tmp`;
  const writeStream = createWriteStream(tmpPath);

  let response: Response;
  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    writeStream.destroy();
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }

  if (!response.ok) {
    writeStream.destroy();
    await unlink(tmpPath).catch(() => undefined);
    throw new ElevenLabsApiError(
      statusToCode(response.status),
      response.status,
      `ElevenLabs API error ${response.status}: ${response.statusText}`,
    );
  }

  if (response.body === null) {
    writeStream.destroy();
    await unlink(tmpPath).catch(() => undefined);
    throw new ElevenLabsApiError('EMPTY_RESPONSE', response.status, 'API returned empty body');
  }

  try {
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), writeStream);
  } catch (err) {
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }

  await rename(tmpPath, outputPath);
}

export async function synthesize(opts: SynthesizeOptions): Promise<SynthesizeResult> {
  if (opts.text.length === 0 || opts.text.length >= 5000) {
    throw new ElevenLabsApiError(
      'INVALID_TEXT',
      0,
      `text must be between 1 and 4999 characters, got ${opts.text.length}`,
    );
  }

  const apiKey = process.env['ELEVENLABS_API_KEY'];
  if (!apiKey) {
    throw new ElevenLabsApiError('MISSING_API_KEY', 0, 'ELEVENLABS_API_KEY environment variable is not set');
  }

  const voiceId = opts.voiceId ?? process.env['ELEVENLABS_VOICE_ID'];
  if (!voiceId) {
    throw new ElevenLabsApiError('MISSING_VOICE_ID', 0, 'voiceId must be provided or ELEVENLABS_VOICE_ID must be set');
  }

  if (!/^[a-zA-Z0-9]{20}$/.test(voiceId)) {
    throw new ElevenLabsApiError('INVALID_VOICE_ID', 0, `voiceId must match /^[a-zA-Z0-9]{20}$/`);
  }

  let modelId = 'eleven_multilingual_v2';
  let outputFormat: string = 'mp3_44100_192';
  let voiceSettings: VoiceSettings = {
    stability: 0.5,
    similarity_boost: 0.75,
    use_speaker_boost: true,
  };

  if (opts.preset !== undefined) {
    const preset = VOICE_PRESETS[opts.preset];
    if (preset === undefined) {
      throw new ElevenLabsApiError('INVALID_PRESET', 0, `Unknown preset: ${opts.preset}`);
    }
    modelId = preset.modelId;
    outputFormat = preset.outputFormat;
    const settings: VoiceSettings = {
      stability: preset.stability,
      similarity_boost: preset.similarityBoost,
      use_speaker_boost: preset.speakerBoost,
    };
    // Only include style when the preset explicitly provides it — avoids
    // sending style=undefined to models that don't support it
    if (preset.style !== undefined) {
      settings.style = preset.style;
    }
    voiceSettings = settings;
  }

  const requestBody: Record<string, unknown> = {
    text: opts.text,
    model_id: modelId,
    voice_settings: voiceSettings,
    output_format: outputFormat,
  };

  let lastError: ElevenLabsApiError | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await attemptRequest(voiceId, apiKey, requestBody, opts.outputPath);
      break;
    } catch (err) {
      if (!(err instanceof ElevenLabsApiError)) throw err;

      const isRetryable = RETRYABLE_STATUSES.has(err.httpStatus);
      const hasMoreAttempts = attempt < RETRY_DELAYS_MS.length;

      if (!isRetryable || !hasMoreAttempts) {
        throw err;
      }

      lastError = err;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await sleep(delay);
    }
  }

  const fileStat = await stat(opts.outputPath);
  const bytes = fileStat.size;
  const durationSec = await getDurationSec(opts.outputPath, bytes);

  return {
    filePath: opts.outputPath,
    durationSec,
    bytes,
  };
}
