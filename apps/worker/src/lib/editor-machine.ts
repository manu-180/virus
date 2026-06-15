/**
 * editor_machine client (Vidriera-Video §3.5 / §8) — submit a job to the CLOSED
 * editor_machine engine and pull the finished render. editor_machine trims a raw
 * video to the length of a voice-over and burns karaoke word-by-word subtitles;
 * it is consumed purely by API (never reopened).
 *
 * Flow (mirrors the engine's own panel + e2e test):
 *   1. upload raw video + VO audio → `sources` bucket (jobs/{id}/source-*.{ext})
 *   2. insert em_jobs (mode, params.style_overrides, params.language) status=queued
 *   3. POST {engine}/kick  (Authorization: Bearer ENGINE_KICK_SECRET) — wakes the
 *      live Railway drain loop; empty body, returns {accepted:true}
 *   4. poll em_jobs.status until 'done' / 'error' / 'canceled'
 *   5. sign render_path (renders bucket) + download to a local file
 *
 * Cross-project creds come from the worker env (Railway in prod, never the repo):
 *   EDITOR_MACHINE_SUPABASE_URL, EDITOR_MACHINE_SERVICE_KEY,
 *   EDITOR_MACHINE_ENGINE_URL, ENGINE_KICK_SECRET
 */
import { readFile, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SOURCES_BUCKET = 'sources';
const RENDERS_BUCKET = 'renders';
const DEFAULT_POLL_EVERY_MS = 3000;
const DEFAULT_POLL_TIMEOUT_MS = 12 * 60 * 1000;

/**
 * formato-video-apex caption style as editor_machine `style_overrides`
 * (engine SubtitleStyle keys). Karaoke is NOT a preset — it's set here:
 * highlight=cyan #22d3ee, base/fill=#F4F3FF, border=#090910, Inter bold.
 */
export const KARAOKE_CYAN_STYLE = {
  karaoke: true,
  karaoke_color: '#22d3ee',
  primary_color: '#F4F3FF',
  outline_color: '#090910',
  font_family: 'Inter',
  font_weight: 700,
  // Short lines (≤ ~3 words) so cards never wrap to 3-4 rows, and lifted well
  // off the bottom so they clear Instagram's caption/username/button chrome.
  max_chars_per_line: 18,
  max_lines: 2,
  margin_v_pct: 24,
} as const;

export interface SubmitEditorJobInput {
  /** Local raw video (1080×1920 scroll). */
  videoPath: string;
  /** Local VO audio (mp3). */
  audioPath: string;
  /** Local path to save the downloaded render. */
  outPath: string;
  /** Caption style_overrides. Default: karaoke cyan (APEX format). */
  styleOverrides?: Record<string, unknown>;
  /** Whisper language hint. Default 'es'. */
  language?: string;
  /** Optional subtitle preset id (null = engine defaults + style_overrides). */
  presetId?: string | null;
  /** 'fast' (no Gemini analysis) or 'smart'. Default 'fast'. */
  mode?: 'fast' | 'smart';
  /** Reuse a specific job id (else a uuid is generated). */
  jobId?: string;
  /** Progress callback fired on each status/stage change. */
  onProgress?: (tag: string, elapsedSec: number) => void;
  pollEveryMs?: number;
  pollTimeoutMs?: number;
}

export interface SubmitEditorJobResult {
  jobId: string;
  renderPath: string;
  localPath: string;
  renderBytes: number;
  videoDurationS: number | null;
  audioDurationS: number | null;
  tookSec: number;
}

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing from worker env (editor_machine §8 wiring)`);
  return v;
}

/** A Supabase client bound to editor_machine's project (service-role). */
export function editorMachineClient(): SupabaseClient {
  return createClient(reqEnv('EDITOR_MACHINE_SUPABASE_URL'), reqEnv('EDITOR_MACHINE_SERVICE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function submitEditorJob(input: SubmitEditorJobInput): Promise<SubmitEditorJobResult> {
  const engine = reqEnv('EDITOR_MACHINE_ENGINE_URL').replace(/\/$/, '');
  const kickSecret = reqEnv('ENGINE_KICK_SECRET');
  const em = editorMachineClient();

  const jobId = input.jobId ?? globalThis.crypto.randomUUID();
  const videoKey = `jobs/${jobId}/source-video.mp4`;
  const audioKey = `jobs/${jobId}/source-audio.mp3`;
  const pollEvery = input.pollEveryMs ?? DEFAULT_POLL_EVERY_MS;
  const pollTimeout = input.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const report = (tag: string, t: number) => input.onProgress?.(tag, t);

  // 1. upload sources
  const [videoBytes, audioBytes] = await Promise.all([readFile(input.videoPath), readFile(input.audioPath)]);
  const upV = await em.storage
    .from(SOURCES_BUCKET)
    .upload(videoKey, videoBytes, { contentType: 'video/mp4', upsert: true });
  if (upV.error) throw new Error(`video upload failed: ${upV.error.message}`);
  const upA = await em.storage
    .from(SOURCES_BUCKET)
    .upload(audioKey, audioBytes, { contentType: 'audio/mpeg', upsert: true });
  if (upA.error) throw new Error(`audio upload failed: ${upA.error.message}`);

  // 2. insert job (supabase-js serializes params as proper UTF-8 JSON)
  const ins = await em
    .from('em_jobs')
    .insert({
      id: jobId,
      status: 'queued',
      mode: input.mode ?? 'fast',
      video_path: videoKey,
      audio_path: audioKey,
      params: {
        preset_id: input.presetId ?? null,
        language: input.language ?? 'es',
        style_overrides: input.styleOverrides ?? KARAOKE_CYAN_STYLE,
      },
    })
    .select('id')
    .single();
  if (ins.error) throw new Error(`em_jobs insert failed: ${ins.error.message}`);

  // 3. kick the live engine (idempotent, empty body)
  const kick = await fetch(`${engine}/kick`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kickSecret}` },
  });
  const kickBody = await kick.text();
  if (kick.status === 401) throw new Error(`/kick rejected the secret (401): ${kickBody}`);

  // 4. poll until terminal
  const t0 = Date.now();
  let last = '';
  let renderPath: string | null = null;
  let videoDurationS: number | null = null;
  let audioDurationS: number | null = null;
  for (;;) {
    const { data, error } = await em
      .from('em_jobs')
      .select('status,stage,progress,error,render_path,video_duration_s,audio_duration_s')
      .eq('id', jobId)
      .single();
    if (error) throw new Error(`poll failed: ${error.message}`);

    const tag = `${data.status}${data.stage ? `/${data.stage}` : ''} ${data.progress ?? 0}%`;
    if (tag !== last) {
      report(tag, (Date.now() - t0) / 1000);
      last = tag;
    }

    if (data.status === 'done') {
      renderPath = data.render_path;
      videoDurationS = data.video_duration_s ?? null;
      audioDurationS = data.audio_duration_s ?? null;
      break;
    }
    if (data.status === 'error' || data.status === 'canceled') {
      throw new Error(`job ${data.status}: ${data.error ?? '(no error message)'}`);
    }
    if (Date.now() - t0 > pollTimeout) {
      throw new Error(`timed out after ${pollTimeout / 60000}min in status=${data.status} (job ${jobId})`);
    }
    await sleep(pollEvery);
  }
  if (!renderPath) throw new Error('status=done but render_path is null');

  // 5. sign + download the render (render_path = key inside the renders bucket)
  const signed = await em.storage.from(RENDERS_BUCKET).createSignedUrl(renderPath, 3600);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`sign render failed: ${signed.error?.message ?? 'no url'}`);
  }
  const dl = await fetch(signed.data.signedUrl);
  if (!dl.ok) throw new Error(`render download failed: HTTP ${dl.status}`);
  const renderBuf = Buffer.from(await dl.arrayBuffer());
  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, renderBuf);

  return {
    jobId,
    renderPath,
    localPath: input.outPath,
    renderBytes: renderBuf.length,
    videoDurationS,
    audioDurationS,
    tookSec: (Date.now() - t0) / 1000,
  };
}
