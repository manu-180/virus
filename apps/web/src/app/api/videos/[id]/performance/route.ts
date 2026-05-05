import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const PerformanceSchema = z.object({
  platform: z.enum(['reels', 'tiktok', 'shorts', 'x', 'linkedin']),
  views: z.number().int().min(0),
  likes: z.number().int().min(0).default(0),
  comments: z.number().int().min(0).default(0),
  saves: z.number().int().min(0).default(0),
  shares: z.number().int().min(0).default(0),
  avg_watch_time: z.number().min(0).nullable(),
  hook_retention: z.number().min(0).max(100).nullable(),
  measured_at: z.string().datetime({ offset: true }),
});

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      );
    }

    const { id } = await params;

    // Verify the video exists and belongs to the authenticated user
    const supabase = await createClient();
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Video not found or access denied' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = PerformanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 },
      );
    }

    const { data, error: insertError } = await supabase
      .from('video_performance')
      .insert({
        video_id: id,
        platform: parsed.data.platform,
        views: parsed.data.views,
        likes: parsed.data.likes,
        comments: parsed.data.comments,
        saves: parsed.data.saves,
        shares: parsed.data.shares,
        avg_watch_time: parsed.data.avg_watch_time,
        hook_retention: parsed.data.hook_retention,
        measured_at: parsed.data.measured_at,
      })
      .select()
      .single();

    if (insertError || !data) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to save performance data' } },
        { status: 500 },
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    console.error('[POST /api/videos/[id]/performance]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
