/**
 * Shared utilities for video pipeline Inngest functions.
 *
 * Three responsibilities:
 *  1. `getVideoOrFail`  — load + ownership-verify a videos row
 *  2. `setVideoStatus`  — update status (and optional fields) with updated_at
 *  3. `logJobEvent`     — fire-and-forget audit insert into job_events
 *
 * All DB access goes through the lazy admin singleton from lib/supabase.ts.
 * Structured logging uses `console.log({ fn, action, videoId, ...extra })`.
 */

import { getAdminClient } from '../lib/supabase.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoStatus =
  | 'pending'
  | 'scripting'
  | 'audio'
  | 'captions'
  | 'rendering'
  | 'ready'
  | 'published'
  | 'failed';

/** Shape of a row from the `videos` table. */
export interface VideoRow {
  id: string;
  project_id: string;
  user_id: string;
  idea_id: string | null;
  template: string | null;
  status: VideoStatus;
  theme_color: string | null;
  language: string | null;
  script: unknown;
  audio_url: string | null;
  captions: unknown;
  video_url: string | null;
  duration_seconds: number | null;
  caption_instagram: string | null;
  caption_tiktok: string | null;
  caption_shorts: string | null;
  hashtags: string[] | null;
  inngest_run_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Internal type guard
// ---------------------------------------------------------------------------

function isVideoRow(d: unknown): d is VideoRow {
  if (typeof d !== 'object' || d === null) return false;
  const r = d as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    typeof r['user_id'] === 'string' &&
    typeof r['project_id'] === 'string' &&
    typeof r['status'] === 'string'
  );
}

// ---------------------------------------------------------------------------
// getVideoOrFail
// ---------------------------------------------------------------------------

/**
 * Load a video row and verify ownership.
 *
 * Throws:
 *  - `Error('video_not_found:<videoId>')` when no row exists for the given id.
 *  - `Error('video_ownership_mismatch:<videoId>')` when the row's user_id does
 *    not match the supplied userId.
 */
export async function getVideoOrFail(
  videoId: string,
  userId: string,
): Promise<VideoRow> {
  console.log({ fn: 'utils', action: 'getVideoOrFail', videoId, userId });

  const { data, error } = await getAdminClient()
    .from('videos')
    .select('*')
    .eq('id', videoId)
    .single();

  if (error || !data) {
    console.log({
      fn: 'utils',
      action: 'getVideoOrFail:not_found',
      videoId,
      error: error?.message,
    });
    throw new Error(`video_not_found:${videoId}`);
  }

  if (!isVideoRow(data)) {
    throw new Error(`video_shape_invalid:${videoId}`);
  }
  const row = data;

  if (row.user_id !== userId) {
    console.log({
      fn: 'utils',
      action: 'getVideoOrFail:ownership_mismatch',
      videoId,
      expected: userId,
      actual: row.user_id,
    });
    throw new Error(`video_ownership_mismatch:${videoId}`);
  }

  return row;
}

// ---------------------------------------------------------------------------
// setVideoStatus
// ---------------------------------------------------------------------------

/**
 * Update the status of a video row and (optionally) additional fields.
 * Always stamps `updated_at` with the current UTC timestamp.
 */
export async function setVideoStatus(
  videoId: string,
  status: VideoStatus,
  fields?: Partial<
    Omit<VideoRow, 'id' | 'user_id' | 'project_id' | 'created_at' | 'updated_at'>
  >,
): Promise<void> {
  console.log({ fn: 'utils', action: 'setVideoStatus', videoId, status, fields });

  const { error, count } = await getAdminClient()
    .from('videos')
    .update({ ...fields, status, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', videoId);

  if (error) {
    console.log({
      fn: 'utils',
      action: 'setVideoStatus:error',
      videoId,
      status,
      error: error.message,
    });
    throw new Error(`setVideoStatus failed for ${videoId}: ${error.message}`);
  }
  if ((count ?? 0) === 0) {
    throw new Error(`setVideoStatus: no row matched for ${videoId}`);
  }
}

// ---------------------------------------------------------------------------
// logJobEvent
// ---------------------------------------------------------------------------

/**
 * Insert an audit row into `job_events`.
 *
 * This is fire-and-forget: errors are logged but never re-thrown so that a
 * failed audit write can never block or abort the pipeline.
 */
export async function logJobEvent(
  videoId: string,
  step: string,
  status: 'started' | 'completed' | 'failed' | 'retried',
  payload?: Record<string, unknown>,
): Promise<void> {
  console.log({ fn: 'utils', action: 'logJobEvent', videoId, step, status });

  const { error } = await getAdminClient()
    .from('job_events')
    .insert({
      video_id: videoId,
      step,
      status,
      payload: payload ?? null,
    });

  if (error) {
    // Audit failure must never propagate — log and continue.
    console.log({
      fn: 'utils',
      action: 'logJobEvent:error',
      videoId,
      step,
      status,
      error: error.message,
    });
  }
}
