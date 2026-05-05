/**
 * generate-caption — Inngest function for the video generation pipeline.
 *
 * Trigger: `virus/render.completed`
 * Payload: { videoId: string; videoUrl: string }
 *
 * Flow:
 *  1. Load video row by videoId (no ownership check — internal pipeline event)
 *  2. Load project_brand row (is_current=true for video.project_id) → build ProjectBrand
 *  3. Call writeCaption() from @virus/shared/ai
 *  4. Update DB: setVideoStatus(videoId, 'ready', { caption_instagram, caption_tiktok,
 *     caption_shorts, hashtags }) — Supabase Realtime will notify subscribed frontend
 *  5. Log job event
 *  6. Send virus/caption.generated with { videoId }
 *
 * Idempotency: all DB writes are safe on retry — the video update is a SET of
 * the same derived values; the job_events insert is append-only (audit log).
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { setVideoStatus, logJobEvent } from '../utils/index.js';
import type { VideoRow } from '../utils/index.js';
import { writeCaption } from '@virus/shared/ai';
import type { CaptionOutput, ScriptOutput } from '@virus/shared/ai';
import type { ProjectBrand } from '@virus/shared/viral';

// ---------------------------------------------------------------------------
// Types for DB rows
// ---------------------------------------------------------------------------

interface ProjectBrandRow {
  brand_name: unknown;
  one_liner: unknown;
  voice_tone: unknown;
  ctas: unknown;
  do_not_say: unknown;
  audience: unknown;
}


// ---------------------------------------------------------------------------
// Helper: reconstruct ProjectBrand from flat DB columns
// ---------------------------------------------------------------------------

function buildBrand(projectId: string, row: ProjectBrandRow): ProjectBrand {
  return {
    projectId,
    brandName: (row.brand_name as string) ?? '',
    oneLiner: (row.one_liner as string) ?? '',
    voiceTone: (row.voice_tone as string) ?? 'conversacional',
    ctas: (row.ctas as ProjectBrand['ctas']) ?? [],
    doNotSay: (row.do_not_say as string[]) ?? [],
    audience: (row.audience as ProjectBrand['audience']) ?? { who: '', where: '', pains: [] },
    valueProps: [],
    features: [],
    caseStudies: [],
    parsedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const generateCaption = inngest.createFunction(
  {
    id: 'generate-caption',
    retries: 2,
    concurrency: { limit: 5 },
    onFailure: async ({ event, error }) => {
      // Inngest wraps the original event in event.data.event when invoking
      // onFailure — same pattern as other functions in this worker.
      const original = (
        event as unknown as { data: { event: { data: { videoId?: string } } } }
      ).data.event;

      const videoId = original?.data?.videoId;

      console.log({
        fn: 'generate-caption',
        step: 'onFailure',
        videoId,
        error: error?.message,
      });

      if (!videoId) return;

      const db = getAdminClient();

      try {
        await setVideoStatus(videoId, 'failed', { error: error?.message ?? 'unknown_error' });
      } catch (setErr) {
        console.error('[generate-caption] onFailure setVideoStatus failed', setErr);
      }

      try {
        await inngest.send({
          name: 'virus/render.failed',
          data: { videoId, error: error?.message ?? 'unknown_error' },
        });
      } catch (sendErr) {
        console.error('[generate-caption] onFailure send render.failed failed', sendErr);
      }

      // Fire-and-forget audit for the failure
      try {
        await db.from('job_events').insert({
          video_id: videoId,
          step: 'generate-caption',
          status: 'failed',
          payload: { error: error?.message ?? 'unknown_error' },
        });
      } catch (auditErr) {
        console.error('[generate-caption] onFailure job_events insert failed', auditErr);
      }
    },
  },
  { event: 'virus/render.completed' },
  async ({ event, step }) => {
    const { videoId } = event.data;

    console.log({ fn: 'generate-caption', step: 'start', videoId });

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
      console.log({ fn: 'generate-caption', step: 'load-video', videoId, status: row.status });
      return row;
    });

    // ------------------------------------------------------------------
    // 2. Load project_brand row (is_current=true)
    // ------------------------------------------------------------------
    const brand: ProjectBrand = await step.run('load-brand', async () => {
      const { data, error } = await getAdminClient()
        .from('project_brand')
        .select('brand_name, one_liner, voice_tone, ctas, do_not_say, audience')
        .eq('project_id', video.project_id)
        .eq('is_current', true)
        .single();

      if (error || !data) {
        throw new Error(
          `brand_not_found:${video.project_id} — ${error?.message ?? 'no data'}`,
        );
      }

      console.log({
        fn: 'generate-caption',
        step: 'load-brand',
        videoId,
        projectId: video.project_id,
      });
      return buildBrand(video.project_id, data as ProjectBrandRow);
    });

    // ------------------------------------------------------------------
    // 3. Call writeCaption() (Claude)
    // ------------------------------------------------------------------
    const captionResult: CaptionOutput = await step.run('generate-caption', async () => {
      const script = video.script as ScriptOutput | null;

      if (!script) {
        throw new Error(`caption_missing_script:${videoId} — video has no script`);
      }

      // Find the hook segment voiceover; fall back to '' if absent
      const hook = script.segments.find((s) => s.role === 'hook')?.voiceover ?? '';

      console.log({
        fn: 'generate-caption',
        step: 'generate-caption',
        videoId,
        hook: hook.slice(0, 60),
      });

      return writeCaption({ script, hook, brand });
    });

    // ------------------------------------------------------------------
    // 4. Update DB: status='ready' + all caption fields
    //    Supabase Realtime picks up the row change automatically.
    // ------------------------------------------------------------------
    await step.run('update-video', async () => {
      console.log({ fn: 'generate-caption', step: 'update-video', videoId, status: 'ready' });

      const hashtags = [
        ...Array.from(new Set([
          ...captionResult.instagram.hashtags,
          ...captionResult.tiktok.hashtags,
          ...captionResult.shorts.hashtags,
        ])),
      ];

      return setVideoStatus(videoId, 'ready', {
        caption_instagram: captionResult.instagram.caption,
        caption_tiktok: captionResult.tiktok.caption,
        caption_shorts: captionResult.shorts.caption,
        hashtags,
      });
    });

    // ------------------------------------------------------------------
    // 5. Log job event
    // ------------------------------------------------------------------
    await step.run('log-job-event', async () => {
      console.log({ fn: 'generate-caption', step: 'log-job-event', videoId });
      return logJobEvent(videoId, 'generate-caption', 'completed', {
        instagramHashtags: captionResult.instagram.hashtags.length,
        tiktokHashtags: captionResult.tiktok.hashtags.length,
        shortsHashtags: captionResult.shorts.hashtags.length,
      });
    });

    // ------------------------------------------------------------------
    // 6. Emit virus/caption.generated
    // ------------------------------------------------------------------
    await step.sendEvent('emit-caption-generated', {
      name: 'virus/caption.generated',
      data: { videoId },
    });

    console.log({ fn: 'generate-caption', step: 'done', videoId });

    return { ok: true, videoId };
  },
);
