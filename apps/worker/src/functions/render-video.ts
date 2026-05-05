/**
 * render-video — Inngest function for the video generation pipeline.
 *
 * Trigger: `virus/captions.ready`
 * Payload: { videoId: string }
 *
 * Flow:
 *  1. Load the videos row by videoId only (internal pipeline event — no
 *     ownership check).
 *  2. Guard: ensure audio_url and captions are non-null.
 *  3. Build RenderInputProps from the video row.
 *  4. Call startRender(inputProps) → { renderId, bucketName }.
 *  5. Poll pollRender(renderId, bucketName) every 30 s until done:true or
 *     errorMessage is set (max 20 polls = ~10 min).
 *  6. Download the rendered MP4 from outputUrl to
 *     /tmp/virus/<videoId>/render/final.mp4.
 *  7. Upload MP4 to Supabase Storage bucket 'videos' at
 *     <userId>/<videoId>/final.mp4 and obtain a 1-year signed URL.
 *  8. Update DB: video_url + duration_seconds (status stays 'rendering').
 *  9. Log job event.
 * 10. Cleanup temp directory.
 * 11. Send virus/render.completed with { videoId, videoUrl }.
 *
 * On any failure: set video status to 'failed', persist error message, and
 * send virus/render.failed so downstream can clean up.
 *
 * Idempotency: storage upload uses upsert:true; video update is a SET of the
 * same derived value; job_events insert is append-only (audit log).
 */

import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { withQuota } from '../lib/quotas.js';
import { setVideoStatus, logJobEvent } from '../utils/index.js';
import type { VideoRow } from '../utils/index.js';
import { startRender, pollRender } from '@virus/shared/render';
import type { VideoInput, CompositionId } from '@virus/shared/render';
import type { RenderAssets, AssetType, AssetCategory } from '@virus/shared/visuals';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_POLLS = 20;
const POLL_INTERVAL = '30s';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download_failed: HTTP ${response.status} from ${url}`);
  }
  const dest = createWriteStream(destPath);
  // Readable.fromWeb converts the WHATWG ReadableStream (fetch API) to a
  // Node.js Readable so node:stream/promises pipeline can consume it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await pipeline(Readable.fromWeb(response.body as any), dest);
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const renderVideo = inngest.createFunction(
  {
    id: 'render-video',
    retries: 1,
    concurrency: { limit: 3 },
    throttle: { limit: 5, period: '1m' },
    onFailure: async ({ event, error }) => {
      // Inngest wraps the original event in event.data.event when invoking
      // onFailure — same pattern as synthesize-audio.ts.
      const original = (
        event as unknown as { data: { event: { data: { videoId?: string } } } }
      ).data.event;

      const videoId = original?.data?.videoId;

      console.log({
        fn: 'render-video',
        step: 'onFailure',
        videoId,
        error: error?.message,
      });

      if (!videoId) return;

      const db = getAdminClient();

      try {
        await setVideoStatus(videoId, 'failed', { error: error?.message ?? 'unknown_error' });
      } catch (setErr) {
        console.error('[render-video] onFailure setVideoStatus failed', setErr);
      }

      try {
        await inngest.send({
          name: 'virus/render.failed',
          data: { videoId, error: error?.message ?? 'unknown_error' },
        });
      } catch (sendErr) {
        console.error('[render-video] onFailure send render.failed failed', sendErr);
      }

      // Fire-and-forget audit for the failure
      try {
        await db.from('job_events').insert({
          video_id: videoId,
          step: 'render-video',
          status: 'failed',
          payload: { error: error?.message ?? 'unknown_error' },
        });
      } catch (auditErr) {
        console.error('[render-video] onFailure job_events insert failed', auditErr);
      }
    },
  },
  { event: 'virus/captions.ready' },
  async ({ event, step }) => {
    const { videoId } = event.data;

    console.log({ fn: 'render-video', step: 'start', videoId });

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
      console.log({ fn: 'render-video', step: 'load-video', videoId, status: row.status });
      return row;
    });

    // ------------------------------------------------------------------
    // 2. Guard: ensure audio_url (storage PATH) and captions are present.
    //    Then generate a fresh signed URL for the audio — video.audio_url
    //    stores the storage path, not a signed URL, to avoid expiry issues.
    // ------------------------------------------------------------------
    if (!video.audio_url) {
      throw new Error(`render_missing_audio: videoId=${videoId} has no audio_url`);
    }
    if (video.captions === null || video.captions === undefined) {
      throw new Error(`render_missing_captions: videoId=${videoId} has no captions`);
    }

    // Generate a fresh signed URL for the audio file (1hr — enough for render)
    const audioSignedUrl: string = await step.run('sign-audio-url', async () => {
      const { data, error } = await getAdminClient().storage
        .from('audio')
        .createSignedUrl(video.audio_url!, 3600); // 1hr
      if (error || !data?.signedUrl) {
        throw new Error(`sign_audio_failed: ${error?.message ?? 'no url'}`);
      }
      return data.signedUrl;
    });

    const script = video.script as {
      segments: unknown[];
      totalDurationSec: number;
      recommendedTemplate: string;
      musicMood: string;
    } | null;

    const durationSec: number = script?.totalDurationSec ?? 30;

    // ------------------------------------------------------------------
    // 2b. Resolve cinematic visual assets (hook / reveal / cta) → signed URLs.
    //     This step is fully non-fatal: ANY failure (missing metadata,
    //     visual_assets row not ready, signing error, HEAD precheck failure)
    //     leaves the corresponding slot undefined so the Remotion template
    //     falls back to its black-background visual cue.
    //
    //     Wrapped in a single outer `step.run` so Inngest memoizes the entire
    //     resolution batch on retries. Signed URLs have a 1h TTL — long enough
    //     for the downstream render (10 min poll budget) but cheap to redo on
    //     a fresh retry. No external state mutation happens here.
    // ------------------------------------------------------------------
    // step.run serializes its return value through JSON, so an `undefined` result
    // is observed as `null`. Accept both shapes here and normalize below.
    const resolvedAssets: RenderAssets | null = await step.run('resolve-assets', async () => {
      try {
        // The select('*') above pulls metadata but VideoRow doesn't declare it.
        const metadata = (video as unknown as { metadata?: Record<string, unknown> | null })
          .metadata;
        const assetIds = (metadata?.['assets'] ?? null) as {
          hook?: string | null;
          reveal?: string | null;
          cta?: string | null;
        } | null;

        if (!assetIds) {
          console.log({ fn: 'render-video', step: 'resolve-assets', videoId, skipped: 'no_assets_metadata' });
          return null;
        }

        const db = getAdminClient();
        const result: RenderAssets = {};

        const slots: AssetCategory[] = ['hook', 'reveal', 'cta'];
        for (const slot of slots) {
          const id = assetIds[slot];
          if (!id) continue;

          // 1. Fetch the visual_assets row.
          const { data: row, error: selErr } = await db
            .from('visual_assets')
            .select('id, type, storage_path, duration_sec, status')
            .eq('id', id)
            .maybeSingle();

          if (selErr || !row) {
            console.log({
              fn: 'render-video',
              step: 'resolve-assets',
              videoId,
              slot,
              skipped: 'row_not_found',
              error: selErr?.message,
            });
            continue;
          }

          const assetRow = row as {
            id: string;
            type: AssetType;
            storage_path: string | null;
            duration_sec: number | null;
            status: string;
          };

          // 2. Defensive: skip rows that aren't ready or are missing the path.
          if (assetRow.status !== 'ready' || !assetRow.storage_path) {
            console.log({
              fn: 'render-video',
              step: 'resolve-assets',
              videoId,
              slot,
              skipped: 'not_ready_or_no_path',
              status: assetRow.status,
            });
            continue;
          }

          // 3. Generate a fresh 1h signed URL.
          const { data: signed, error: signErr } = await db.storage
            .from('visual-assets')
            .createSignedUrl(assetRow.storage_path, 3600);

          if (signErr || !signed?.signedUrl) {
            await db.from('job_events').insert({
              video_id: videoId,
              step: 'render.signed_url_failed',
              status: 'failed',
              payload: {
                slot,
                assetId: assetRow.id,
                storagePath: assetRow.storage_path,
                error: signErr?.message ?? 'no_signed_url',
              },
            });
            continue;
          }

          // 4. HEAD-check the signed URL — catches 4xx/5xx before render starts.
          let urlOk = false;
          try {
            const head = await fetch(signed.signedUrl, { method: 'HEAD' });
            urlOk = head.status < 400;
            if (!urlOk) {
              await db.from('job_events').insert({
                video_id: videoId,
                step: 'render.url_check_failed',
                status: 'failed',
                payload: {
                  slot,
                  assetId: assetRow.id,
                  httpStatus: head.status,
                },
              });
            }
          } catch (fetchErr) {
            await db.from('job_events').insert({
              video_id: videoId,
              step: 'render.url_check_failed',
              status: 'failed',
              payload: {
                slot,
                assetId: assetRow.id,
                error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
              },
            });
            urlOk = false;
          }

          if (!urlOk) continue;

          // 5. Slot resolved — attach AssetRef.
          result[slot] = {
            url: signed.signedUrl,
            type: assetRow.type,
            ...(assetRow.duration_sec != null ? { durationSec: assetRow.duration_sec } : {}),
          };
        }

        const resolved = Object.keys(result).filter((k) => result[k as AssetCategory]);
        console.log({
          fn: 'render-video',
          step: 'resolve-assets',
          videoId,
          resolved,
        });

        return Object.keys(result).length > 0 ? result : null;
      } catch (err) {
        // Any unexpected error: log and degrade to no assets (template will
        // fall back to black bg). The render still proceeds.
        console.error('[render-video] resolve-assets unexpected error', err);
        try {
          await getAdminClient()
            .from('job_events')
            .insert({
              video_id: videoId,
              step: 'render.resolve_assets_error',
              status: 'failed',
              payload: { error: err instanceof Error ? err.message : String(err) },
            });
        } catch {
          /* swallow audit failure */
        }
        return null;
      }
    });

    // Normalize null → undefined for the downstream consumer.
    const assets: RenderAssets | undefined = resolvedAssets ?? undefined;

    const compositionId = (video.template ?? script?.recommendedTemplate ?? 'tip') as CompositionId;
    // RenderInputProps is set to be extended in Phase 5 with `assets?: RenderAssets`.
    // Until that lands in the shared schema, attach it via an extended local type
    // so the value flows through to the Remotion bundle without runtime cost.
    const inputProps: VideoInput & { assets?: RenderAssets } = {
      totalDurationSec: durationSec,
      themeColor: video.theme_color ?? '#0175C2',
      // musicMood omitted until music files are added to Remotion bundle
      audioUrl: audioSignedUrl,
      captions: video.captions as VideoInput['captions'],
      // Strip soundEffect until SFX files are added to the Remotion bundle
      segments: ((script?.segments ?? []) as Array<Record<string, unknown>>).map(
        ({ soundEffect: _sfx, ...seg }) => seg,
      ) as VideoInput['segments'],
      language: ((video.language ?? 'es').startsWith('es') ? 'es' : 'en') as 'es' | 'en',
      brand: { handle: 'Apex' },
      ...(assets ? { assets } : {}),
    };

    console.log({
      fn: 'render-video',
      step: 'build-props',
      videoId,
      composition: compositionId,
      totalDurationSec: inputProps.totalDurationSec,
      language: inputProps.language,
      hasAssets: !!assets,
      assetSlots: assets ? Object.keys(assets) : [],
    });

    // ------------------------------------------------------------------
    // 3. Call startRender — durable step so the renderId survives retries.
    //    NOTE: if this step is retried (rare), a duplicate render job may
    //    be issued. Mitigation: retries:1 + Inngest memoization keeps this
    //    risk extremely low. renderId is stored in inngest_run_id for
    //    observability/manual recovery.
    // ------------------------------------------------------------------
    const { renderId, bucketName } = await step.run('start-render', async () => {
      return withQuota('remotionLambda', video.user_id, 0, async () => {
        const render = await startRender({ composition: compositionId, inputProps });
        console.log({
          fn: 'render-video',
          step: 'start-render',
          videoId,
          renderId: render.renderId,
          bucketName: render.bucketName,
        });
        // Store renderId for observability + manual recovery if needed
        await getAdminClient()
          .from('videos')
          .update({ inngest_run_id: render.renderId })
          .eq('id', videoId);
        // units=1 per render; cost≈$0.01 (Lambda + S3)
        return { result: render, actualCost: 0.01, actualUnits: 1 };
      });
    });

    // ------------------------------------------------------------------
    // 4. Poll for render completion (max 20 × 30 s = 10 min)
    // ------------------------------------------------------------------
    let renderResult: { done: boolean; outputFile?: string; errors?: string[] } = {
      done: false,
    };

    for (let i = 0; i < MAX_POLLS; i++) {
      renderResult = await step.run(`poll-render-${i}`, async () => {
        const result = await pollRender({ renderId, bucketName });
        console.log({
          fn: 'render-video',
          step: `poll-render-${i}`,
          videoId,
          renderId,
          done: result.done,
          overallProgress: result.overallProgress,
        });
        return result;
      });

      if (renderResult.done) break;

      if (renderResult.errors?.length) {
        throw new Error(`render_failed: ${renderResult.errors.join(', ')}`);
      }

      if (i < MAX_POLLS - 1) {
        await step.sleep(`wait-render-${i}`, POLL_INTERVAL);
      }
    }

    if (!renderResult.done || !renderResult.outputFile) {
      throw new Error(`render_timeout: exceeded ${MAX_POLLS} polls for videoId=${videoId}`);
    }

    const outputUrl = renderResult.outputFile;

    // ------------------------------------------------------------------
    // 5 & 6. Download MP4 from S3 and upload to Supabase Storage
    // ------------------------------------------------------------------
    const mp4Dir = `/tmp/virus/${videoId}/render`;
    const mp4Path = `${mp4Dir}/final.mp4`;
    const videoStoragePath = `${video.user_id}/${videoId}/final.mp4`;

    await step.run('download-video', async () => {
      console.log({ fn: 'render-video', step: 'download-video', videoId, outputUrl, mp4Path });

      await mkdir(mp4Dir, { recursive: true });

      try {
        await downloadFile(outputUrl, mp4Path);
        console.log({ fn: 'render-video', step: 'download-video', videoId, ok: true });
      } catch (err) {
        // Cleanup on download failure so retries don't accumulate orphan tmp dirs.
        await rm(`/tmp/virus/${videoId}`, { recursive: true, force: true }).catch(() => undefined);
        throw err;
      }
    });

    const storageVideoUrl: string = await step.run('upload-video', async () => {
      console.log({
        fn: 'render-video',
        step: 'upload-video',
        videoId,
        videoStoragePath,
      });

      const mp4Buffer = await readFile(mp4Path);
      const db = getAdminClient();

      const { error: uploadError } = await db.storage
        .from('videos')
        .upload(videoStoragePath, mp4Buffer, { contentType: 'video/mp4', upsert: true });

      if (uploadError) throw new Error(`video_upload_failed: ${uploadError.message}`);

      // MP4 is safely in Supabase Storage — clean up local temp files now.
      await rm(`/tmp/virus/${videoId}`, { recursive: true, force: true }).catch(() => undefined);

      const { data: urlData } = await db.storage
        .from('videos')
        .createSignedUrl(videoStoragePath, 60 * 60 * 24 * 365); // 1 year

      const signedUrl = urlData?.signedUrl;
      if (!signedUrl) {
        throw new Error(`signed_url_failed: createSignedUrl returned no URL for ${videoStoragePath}`);
      }

      console.log({ fn: 'render-video', step: 'upload-video', videoId, ok: true });
      return signedUrl;
    });

    // ------------------------------------------------------------------
    // 7. Update DB: video_url + duration_seconds; status stays 'rendering'
    // ------------------------------------------------------------------
    await step.run('update-video', async () => {
      console.log({
        fn: 'render-video',
        step: 'update-video',
        videoId,
        videoUrl: storageVideoUrl,
        durationSec,
      });
      return setVideoStatus(videoId, 'rendering', {
        video_url: storageVideoUrl,
        duration_seconds: durationSec,
      });
    });

    // ------------------------------------------------------------------
    // 8. Log job event
    // ------------------------------------------------------------------
    await step.run('log-job-event', () => {
      console.log({ fn: 'render-video', step: 'log-job-event', videoId });
      return logJobEvent(videoId, 'render-video', 'completed', {
        renderId,
        bucketName,
        durationSec,
        videoStoragePath,
      });
    });

    // ------------------------------------------------------------------
    // 9. Emit virus/render.completed
    // ------------------------------------------------------------------
    await step.sendEvent('emit-render-completed', {
      name: 'virus/render.completed',
      data: { videoId, videoUrl: storageVideoUrl },
    });

    console.log({ fn: 'render-video', step: 'done', videoId });

    return { ok: true, videoId, videoUrl: storageVideoUrl, durationSec };
  },
);
