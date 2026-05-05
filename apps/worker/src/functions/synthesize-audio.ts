/**
 * synthesize-audio — Inngest function for the video generation pipeline.
 *
 * Trigger: `virus/script.generated`
 * Payload: { videoId: string }
 *
 * Flow:
 *  1. Load the videos row by videoId only (internal pipeline event — no userId
 *     in payload, no ownership check).
 *  2. Prepare output directory: /tmp/virus/<videoId>/audio/
 *  3. Call generateAudioFromScript() from @virus/shared/audio.
 *  4. Upload processed MP3 to Supabase Storage bucket 'audios' at
 *     <userId>/<videoId>/processed.mp3.
 *  5. Generate a signed URL (expires 7 days) for AssemblyAI to access.
 *  6. Update DB: setVideoStatus(videoId, 'captions', { audio_url: signedUrl }).
 *  7. Log job event.
 *  8. Cleanup temp files in finally.
 *  9. Send virus/audio.synthesized with { videoId, audioPath: signedUrl }.
 *
 * On any failure: set video status to 'failed', persist error message, and
 * send virus/render.failed so downstream can clean up.
 *
 * Idempotency: storage upload uses upsert:true; video update is a SET of the
 * same derived value; job_events insert is append-only (audit log).
 */

import { rm, mkdir, readFile } from 'node:fs/promises';
import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { withQuota } from '../lib/quotas.js';
import { setVideoStatus, logJobEvent } from '../utils/index.js';
import type { VideoRow } from '../utils/index.js';
import { generateAudioFromScript, VOICE_PRESETS } from '@virus/shared/audio';
import type { VoicePreset } from '@virus/shared/audio';

// ---------------------------------------------------------------------------
// Internal ScriptOutput shape (stored as JSONB in videos.script)
// ---------------------------------------------------------------------------

interface ScriptSegment {
  index: number;
  voiceover: string;
}

interface ScriptOutput {
  segments: ScriptSegment[];
  totalDurationSec: number;
  recommendedTemplate: string;
  musicMood: string;
}

// ---------------------------------------------------------------------------
// Voice preset selection
// ---------------------------------------------------------------------------

function selectVoicePreset(script: ScriptOutput): VoicePreset {
  const map: Record<string, string> = {
    tip: 'educational',
    hot_take: 'hotTake',
    speed_build: 'speedBuild',
    story: 'story',
    listicle: 'educational',
    comparison: 'educational',
  };
  const key = map[script.recommendedTemplate] ?? 'educational';
  return VOICE_PRESETS[key] ?? VOICE_PRESETS['educational']!;
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const synthesizeAudio = inngest.createFunction(
  {
    id: 'synthesize-audio',
    retries: 3,
    concurrency: { limit: 3 },
    onFailure: async ({ event, error }) => {
      // Inngest wraps the original event in event.data.event when invoking
      // onFailure — same pattern as generate-script.ts.
      const original = (
        event as unknown as { data: { event: { data: { videoId?: string } } } }
      ).data.event;

      const videoId = original?.data?.videoId;

      console.log({
        fn: 'synthesize-audio',
        step: 'onFailure',
        videoId,
        error: error?.message,
      });

      if (!videoId) return;

      const db = getAdminClient();

      try {
        await setVideoStatus(videoId, 'failed', { error: error?.message ?? 'unknown_error' });
      } catch (setErr) {
        console.error('[synthesize-audio] onFailure setVideoStatus failed', setErr);
      }

      try {
        await inngest.send({
          name: 'virus/render.failed',
          data: { videoId, error: error?.message ?? 'unknown_error' },
        });
      } catch (sendErr) {
        console.error('[synthesize-audio] onFailure send render.failed failed', sendErr);
      }

      // Fire-and-forget audit for the failure
      try {
        await db.from('job_events').insert({
          video_id: videoId,
          step: 'synthesize-audio',
          status: 'failed',
          payload: { error: error?.message ?? 'unknown_error' },
        });
      } catch (auditErr) {
        console.error('[synthesize-audio] onFailure job_events insert failed', auditErr);
      }
    },
  },
  { event: 'virus/script.generated' },
  async ({ event, step }) => {
    const { videoId } = event.data;

    console.log({ fn: 'synthesize-audio', step: 'start', videoId });

    // ------------------------------------------------------------------
    // 1. Load video row (no ownership check — internal pipeline event)
    // ------------------------------------------------------------------
    const video: VideoRow = await step.run('load-video', async () => {
      const { data, error } = await getAdminClient()
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (error || !data) throw new Error(`video_not_found:${videoId}`);

      const row = data as VideoRow;
      console.log({ fn: 'synthesize-audio', step: 'load-video', videoId, status: row.status });
      return row;
    });

    // ------------------------------------------------------------------
    // 2 & 3. Generate audio (mkdir + TTS + post-process) with cleanup in finally
    // ------------------------------------------------------------------
    const outputDir = `/tmp/virus/${videoId}/audio`;

    const audioResult = await step.run('generate-audio', async () => {
      console.log({ fn: 'synthesize-audio', step: 'generate-audio', videoId, outputDir });

      await mkdir(outputDir, { recursive: true });

      try {
        const script = video.script as ScriptOutput;
        const preset = selectVoicePreset(script);

        // Count chars upfront for the quota pre-check
        const totalChars = script.segments.reduce((s, seg) => s + seg.voiceover.length, 0);

        const result = await withQuota('elevenlabs', video.user_id, 0, async () => {
          const audio = await generateAudioFromScript({
            segments: script.segments,
            preset,
            outputDir,
          });
          // ElevenLabs pricing ~$0.30/1000 chars
          return { result: audio, actualCost: totalChars * 0.0003, actualUnits: totalChars };
        });

        console.log({
          fn: 'synthesize-audio',
          step: 'generate-audio',
          videoId,
          durationSec: result.durationSec,
          processedMp3: result.processedMp3,
        });

        return result;
      } catch (err) {
        // Cleanup on generation failure before re-throwing so Inngest retries
        // don't accumulate orphan tmp dirs.
        await rm(`/tmp/virus/${videoId}`, { recursive: true, force: true }).catch(() => undefined);
        throw err;
      }
    });

    // ------------------------------------------------------------------
    // 4. Upload processed MP3 to Supabase Storage
    // ------------------------------------------------------------------
    const storagePath = `${video.user_id}/${videoId}/processed.mp3`;

    await step.run('upload-audio', async () => {
      console.log({ fn: 'synthesize-audio', step: 'upload-audio', videoId, storagePath });

      const mp3Buffer = await readFile(audioResult.processedMp3);
      const db = getAdminClient();

      const { error: uploadError } = await db.storage
        .from('audio')
        .upload(storagePath, mp3Buffer, { contentType: 'audio/mpeg', upsert: true });

      if (uploadError) throw new Error(`upload_failed: ${uploadError.message}`);

      // File is in Supabase Storage — no longer needed locally. Clean up now
      // so subsequent retries of this step don't accumulate stale tmp files.
      await rm(`/tmp/virus/${videoId}`, { recursive: true, force: true }).catch(() => undefined);

      console.log({ fn: 'synthesize-audio', step: 'upload-audio', videoId, ok: true });
    });

    // ------------------------------------------------------------------
    // 5. Generate signed URL (7 days) for AssemblyAI
    // ------------------------------------------------------------------
    const signedUrl: string = await step.run('create-signed-url', async () => {
      console.log({ fn: 'synthesize-audio', step: 'create-signed-url', videoId, storagePath });

      const db = getAdminClient();
      const { data: urlData, error: urlError } = await db.storage
        .from('audio')
        .createSignedUrl(storagePath, 604800); // 7 days

      if (urlError || !urlData) {
        throw new Error(`signed_url_failed: ${urlError?.message ?? 'no data'}`);
      }

      console.log({ fn: 'synthesize-audio', step: 'create-signed-url', videoId, ok: true });
      return urlData.signedUrl;
    });

    // ------------------------------------------------------------------
    // 6. Update DB: status → 'captions', persist audio storage PATH (not the
    //    signed URL). Signed URLs expire; storing the path allows generating
    //    fresh signed URLs in future steps or by the frontend on demand.
    // ------------------------------------------------------------------
    await step.run('update-video', async () => {
      console.log({ fn: 'synthesize-audio', step: 'update-video', videoId, status: 'captions' });
      return setVideoStatus(videoId, 'captions', { audio_url: storagePath });
    });

    // ------------------------------------------------------------------
    // 7. Log job event
    // ------------------------------------------------------------------
    await step.run('log-job-event', () => {
      console.log({ fn: 'synthesize-audio', step: 'log-job-event', videoId });
      return logJobEvent(videoId, 'synthesize-audio', 'completed', {
        durationSec: audioResult.durationSec,
        storagePath,
        perSegmentCount: audioResult.perSegmentTimings.length,
      });
    });

    // ------------------------------------------------------------------
    // 8. Emit virus/audio.synthesized
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // 9. Emit virus/audio.synthesized
    // ------------------------------------------------------------------
    await step.sendEvent('emit-audio-synthesized', {
      name: 'virus/audio.synthesized',
      data: { videoId, audioPath: signedUrl },
    });

    console.log({ fn: 'synthesize-audio', step: 'done', videoId });

    return { ok: true, videoId, durationSec: audioResult.durationSec };
  },
);
