/**
 * transcribe-audio — Inngest function for the video generation pipeline.
 *
 * Trigger: `virus/audio.synthesized`
 * Payload: { videoId: string, audioPath: string }
 *
 * Flow:
 *  1. Load the videos row by videoId only (internal pipeline event — no userId
 *     in payload, no ownership check).
 *  2. Call generateCaptions() from @virus/shared/captions.
 *     audioPath is a Supabase Storage signed URL — AssemblyAI fetches it
 *     directly over HTTPS.
 *  3. Update DB: setVideoStatus(videoId, 'rendering', { captions: captionsResult.captions })
 *  4. Log job event.
 *  5. Send virus/captions.ready with { videoId }.
 *
 * On any failure: set video status to 'failed', persist error message, and
 * send virus/render.failed so downstream can clean up.
 *
 * Idempotency: video update is a SET of the same derived value; job_events
 * insert is append-only (audit log).
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { withQuota } from '../lib/quotas.js';
import { setVideoStatus, logJobEvent } from '../utils/index.js';
import type { VideoRow } from '../utils/index.js';
import { generateCaptions } from '@virus/shared/captions';
import type { Captions } from '@virus/shared/captions';

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
  language?: string;
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const transcribeAudio = inngest.createFunction(
  {
    id: 'transcribe-audio',
    retries: 3,
    concurrency: { limit: 5 },
    onFailure: async ({ event, error }) => {
      // Inngest wraps the original event in event.data.event when invoking
      // onFailure — same pattern as synthesize-audio.ts.
      const original = (
        event as unknown as { data: { event: { data: { videoId?: string } } } }
      ).data.event;

      const videoId = original?.data?.videoId;

      console.log({
        fn: 'transcribe-audio',
        step: 'onFailure',
        videoId,
        error: error?.message,
      });

      if (!videoId) return;

      const db = getAdminClient();

      try {
        await setVideoStatus(videoId, 'failed', { error: error?.message ?? 'unknown_error' });
      } catch (setErr) {
        console.error('[transcribe-audio] onFailure setVideoStatus failed', setErr);
      }

      try {
        await inngest.send({
          name: 'virus/render.failed',
          data: { videoId, error: error?.message ?? 'unknown_error' },
        });
      } catch (sendErr) {
        console.error('[transcribe-audio] onFailure send render.failed failed', sendErr);
      }

      // Fire-and-forget audit for the failure
      try {
        await db.from('job_events').insert({
          video_id: videoId,
          step: 'transcribe-audio',
          status: 'failed',
          payload: { error: error?.message ?? 'unknown_error' },
        });
      } catch (auditErr) {
        console.error('[transcribe-audio] onFailure job_events insert failed', auditErr);
      }
    },
  },
  { event: 'virus/audio.synthesized' },
  async ({ event, step }) => {
    const { videoId, audioPath } = event.data;

    console.log({ fn: 'transcribe-audio', step: 'start', videoId });

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
      console.log({ fn: 'transcribe-audio', step: 'load-video', videoId, status: row.status });
      return row;
    });

    // ------------------------------------------------------------------
    // 2. Transcribe audio and generate captions
    // ------------------------------------------------------------------
    const language = (video.language ?? 'es').startsWith('es') ? 'es' : ('en' as 'es' | 'en');

    const script = video.script as ScriptOutput | null;
    const segments =
      script?.segments?.map((s) => ({ index: s.index, voiceover: s.voiceover })) ?? [];

    const captionsResult: { captions: Captions } = await step.run('transcribe', async () => {
      console.log({
        fn: 'transcribe-audio',
        step: 'transcribe',
        videoId,
        language,
        segmentCount: segments.length,
      });

      const result = await withQuota('assemblyai', video.user_id, 0, async () => {
        const captions = await generateCaptions({ audioPath, language, segments });
        const actualSec = captions.captions.totalDurationMs / 1000;
        // AssemblyAI pricing ~$0.00022/second
        return { result: captions, actualCost: actualSec * 0.00022, actualUnits: actualSec };
      });

      console.log({
        fn: 'transcribe-audio',
        step: 'transcribe',
        videoId,
        wordCount: result.captions.words.length,
        lineCount: result.captions.lines.length,
        totalDurationMs: result.captions.totalDurationMs,
      });

      return result;
    });

    // ------------------------------------------------------------------
    // 3. Update DB: status → 'rendering', persist captions JSONB
    // ------------------------------------------------------------------
    await step.run('update-video', () => {
      console.log({
        fn: 'transcribe-audio',
        step: 'update-video',
        videoId,
        status: 'rendering',
      });
      return setVideoStatus(videoId, 'rendering', { captions: captionsResult.captions });
    });

    // ------------------------------------------------------------------
    // 4. Log job event
    // ------------------------------------------------------------------
    await step.run('log-job-event', () => {
      console.log({ fn: 'transcribe-audio', step: 'log-job-event', videoId });
      return logJobEvent(videoId, 'transcribe-audio', 'completed', {
        language,
        wordCount: captionsResult.captions.words.length,
        lineCount: captionsResult.captions.lines.length,
        totalDurationMs: captionsResult.captions.totalDurationMs,
        segmentCount: segments.length,
      });
    });

    // ------------------------------------------------------------------
    // 5. Emit virus/captions.ready
    // ------------------------------------------------------------------
    await step.sendEvent('emit-captions-ready', {
      name: 'virus/captions.ready',
      data: { videoId },
    });

    console.log({ fn: 'transcribe-audio', step: 'done', videoId });

    return { ok: true, videoId, wordCount: captionsResult.captions.words.length };
  },
);
