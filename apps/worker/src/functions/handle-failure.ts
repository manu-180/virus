/**
 * handle-failure — Inngest function for the video generation pipeline.
 *
 * Trigger: `virus/render.failed`
 * Payload: { videoId: string; error: string }
 *
 * Flow:
 *  1. Load video row by videoId
 *  2. Update DB: set status='failed', set error column
 *  3. Log job event
 *
 * retries: 0 — failure handlers must not retry; if this function itself errors
 * the run is abandoned and the error is surfaced in the Inngest dashboard.
 *
 * No onFailure handler: Inngest does not call onFailure for functions with
 * retries:0 because there are no retry attempts to exhaust.
 */

import { inngest } from '../inngest/index.js';
import { setVideoStatus, logJobEvent } from '../utils/index.js';
import type { VideoRow } from '../utils/index.js';
import { getAdminClient } from '../lib/supabase.js';

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const handleFailure = inngest.createFunction(
  {
    id: 'handle-failure',
    retries: 0,
  },
  { event: 'virus/render.failed' },
  async ({ event, step }) => {
    const { videoId, error } = event.data;

    console.log({ fn: 'handle-failure', step: 'start', videoId, error });

    // ------------------------------------------------------------------
    // 1. Load video row
    // ------------------------------------------------------------------
    const video: VideoRow = await step.run('load-video', async () => {
      const { data, dbError } = await getAdminClient()
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single()
        .then(({ data, error: e }) => ({ data, dbError: e }));

      if (dbError || !data) {
        throw new Error(`video_not_found:${videoId} — ${dbError?.message ?? 'no data'}`);
      }

      const row = data as VideoRow;
      console.log({
        fn: 'handle-failure',
        step: 'load-video',
        videoId,
        status: row.status,
        userId: row.user_id,
      });
      return row;
    });

    // ------------------------------------------------------------------
    // 2. Update DB: status='failed', persist error message
    // ------------------------------------------------------------------
    await step.run('update-video', () => {
      console.log({ fn: 'handle-failure', step: 'update-video', videoId, status: 'failed' });
      return setVideoStatus(videoId, 'failed', { error });
    });

    // ------------------------------------------------------------------
    // 3. Log job event
    //    Note: if video.user_id exists an email notification could be sent
    //    here, but for now we only log.
    // ------------------------------------------------------------------
    await step.run('log-job-event', () => {
      console.log({
        fn: 'handle-failure',
        step: 'log-job-event',
        videoId,
        userId: video.user_id,
      });
      return logJobEvent(videoId, 'handle-failure', 'failed', { error });
    });

    console.log({ fn: 'handle-failure', step: 'done', videoId });

    return { ok: true, videoId, error };
  },
);
