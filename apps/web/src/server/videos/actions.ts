'use server';

import { isValid, parseISO, startOfDay, endOfDay } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchScheduledVideos, fetchReadyVideos } from './queries';
import type { ScheduledVideo } from './types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string } };
type Result<T> = Ok<T> | Err;

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

// ---------------------------------------------------------------------------
// getScheduledVideos
// ---------------------------------------------------------------------------

export async function getScheduledVideos(
  from: string,
  to: string,
): Promise<Result<ScheduledVideo[]>> {
  try {
    const user = await getUser();
    const data = await fetchScheduledVideos(user.id, from, to);
    return { ok: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// getReadyVideos
// ---------------------------------------------------------------------------

export async function getReadyVideos(): Promise<Result<ScheduledVideo[]>> {
  try {
    const user = await getUser();
    const items = await fetchReadyVideos(user.id);
    return { ok: true, data: items };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// scheduleVideo
// ---------------------------------------------------------------------------

export async function scheduleVideo(
  videoId: string,
  scheduledFor: string,
): Promise<Result<ScheduledVideo>> {
  if (!videoId || typeof videoId !== 'string') {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'videoId is required' } };
  }

  try {
    const user = await getUser();

    // Validate ISO date
    const parsed = parseISO(scheduledFor);
    if (!isValid(parsed)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'scheduledFor must be a valid ISO date' },
      };
    }

    const admin = createAdminClient();

    // Verify ownership of the video
    const { data: video, error: fetchError } = await admin
      .from('videos')
      .select('id, user_id, status, theme_color, template, video_url')
      .eq('id', videoId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !video) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Video not found' } };
    }
    if (video.user_id !== user.id) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    // Check for conflicts: another video already scheduled on the same day for this user
    const dayStart = startOfDay(parsed).toISOString();
    const dayEnd = endOfDay(parsed).toISOString();

    const { data: conflict, error: conflictError } = await admin
      .from('videos')
      .select('id')
      .eq('user_id', user.id)
      .neq('id', videoId)
      .gte('scheduled_for', dayStart)
      .lte('scheduled_for', dayEnd)
      .is('deleted_at', null)
      .maybeSingle();

    if (conflictError) {
      return { ok: false, error: { code: 'DB_ERROR', message: conflictError.message } };
    }
    if (conflict) {
      return {
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Another video is already scheduled for that day',
        },
      };
    }

    // Update scheduled_for
    const { data: updated, error: updateError } = await admin
      .from('videos')
      .update({ scheduled_for: scheduledFor })
      .eq('id', videoId)
      .select(
        `
        id,
        user_id,
        scheduled_for,
        status,
        theme_color,
        template,
        video_url,
        video_ideas ( hook_text:hook )
      `,
      )
      .single();

    if (updateError || !updated) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: updateError?.message ?? 'Update failed' },
      };
    }

    const result: ScheduledVideo = {
      id: updated.id,
      userId: updated.user_id,
      scheduledFor: updated.scheduled_for as string,
      status: updated.status,
      themeColor: updated.theme_color,
      hookText:
        (updated.video_ideas as { hook_text: string } | null)?.hook_text ?? null,
      template: updated.template,
      videoUrl: updated.video_url,
    };

    return { ok: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// unscheduleVideo
// ---------------------------------------------------------------------------

export async function unscheduleVideo(videoId: string): Promise<Result<void>> {
  if (!videoId || typeof videoId !== 'string') {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'videoId is required' } };
  }

  try {
    const user = await getUser();

    const admin = createAdminClient();

    // Verify ownership
    const { data: video, error: fetchError } = await admin
      .from('videos')
      .select('id, user_id')
      .eq('id', videoId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !video) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Video not found' } };
    }
    if (video.user_id !== user.id) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const { error: updateError } = await admin
      .from('videos')
      .update({ scheduled_for: null })
      .eq('id', videoId)
      .eq('user_id', user.id);

    if (updateError) {
      return { ok: false, error: { code: 'DB_ERROR', message: updateError.message } };
    }

    return { ok: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}
