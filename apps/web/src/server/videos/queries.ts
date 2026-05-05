import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { ScheduledVideo } from './types';

// ---------------------------------------------------------------------------
// fetchScheduledVideos
// ---------------------------------------------------------------------------

export async function fetchScheduledVideos(
  userId: string,
  from: string,
  to: string,
): Promise<ScheduledVideo[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('videos')
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
    .eq('user_id', userId)
    .gte('scheduled_for', from)
    .lte('scheduled_for', to)
    .is('deleted_at', null)
    .order('scheduled_for', { ascending: true });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    scheduledFor: row.scheduled_for ?? null,
    status: row.status,
    themeColor: row.theme_color,
    hookText:
      (row.video_ideas as { hook_text: string } | null)?.hook_text ?? null,
    template: row.template,
    videoUrl: row.video_url,
  }));
}

// ---------------------------------------------------------------------------
// fetchReadyVideos
// ---------------------------------------------------------------------------

export async function fetchReadyVideos(userId: string): Promise<ScheduledVideo[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('videos')
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
    .eq('user_id', userId)
    .eq('status', 'ready')
    .is('scheduled_for', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    scheduledFor: row.scheduled_for ?? null,
    status: row.status,
    themeColor: row.theme_color,
    hookText:
      (row.video_ideas as { hook_text: string } | null)?.hook_text ?? null,
    template: row.template,
    videoUrl: row.video_url,
  }));
}
