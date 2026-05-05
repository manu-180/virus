import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseISO, addDays } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';

const BatchSchema = z.object({
  days: z.number().int().min(1).max(30),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pillarMix: z.record(z.string(), z.number()).optional(),
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = BatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 },
      );
    }

    const { days, startDate } = parsed.data;
    const admin = createAdminClient();

    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!project) {
      return NextResponse.json(
        { error: { code: 'NO_PROJECT', message: 'No active project found. Create a project first.' } },
        { status: 400 },
      );
    }

    const videoIds: string[] = [];
    const ideaIds: string[] = [];
    const scheduledDates: string[] = [];

    const baseDate = parseISO(startDate); // YYYY-MM-DD

    for (let i = 0; i < days; i++) {
      // Compute the target date (startDate + i days) at 09:00 UTC
      const targetDay = addDays(baseDate, i);
      const scheduledFor = new Date(Date.UTC(
        targetDay.getFullYear(),
        targetDay.getMonth(),
        targetDay.getDate(),
        9, 0, 0, 0,
      )).toISOString();

      // 1. Insert video_idea
      const { data: idea, error: ideaError } = await admin
        .from('video_ideas')
        .insert({
          user_id: user.id,
          project_id: project.id,
          status: 'approved',
          hook: 'Batch generated idea',
          angle: 'educational',
          format: 'short',
          metadata: {},
        })
        .select('id')
        .single();

      if (ideaError || !idea) {
        // Clean up successfully created ideas (no videos yet for this iteration)
        if (ideaIds.length > 0) {
          await admin.from('video_ideas').delete().in('id', ideaIds);
        }
        if (videoIds.length > 0) {
          await admin.from('videos').delete().in('id', videoIds);
        }
        return NextResponse.json(
          {
            error: {
              code: 'DB_ERROR',
              message: ideaError?.message ?? 'Failed to create video idea',
            },
          },
          { status: 400 },
        );
      }

      ideaIds.push(idea.id);

      // 2. Insert video
      const { data: video, error: videoError } = await (admin.from('videos') as any)
        .insert({
          user_id: user.id,
          project_id: project.id,
          template: 'default',
          language: 'es',
          status: 'pending',
          scheduled_for: scheduledFor,
          idea_id: idea.id,
        })
        .select('id')
        .single();

      if (videoError || !video) {
        // Clean up all collected rows including the idea just inserted
        if (ideaIds.length > 0) {
          await admin.from('video_ideas').delete().in('id', ideaIds);
        }
        if (videoIds.length > 0) {
          await admin.from('videos').delete().in('id', videoIds);
        }
        return NextResponse.json(
          {
            error: {
              code: 'DB_ERROR',
              message: videoError?.message ?? 'Failed to create video',
            },
          },
          { status: 400 },
        );
      }

      videoIds.push(video.id);
      scheduledDates.push(scheduledFor);
    }

    // 3. Fire Inngest events — functions already have built-in throttling (10/min)
    await Promise.all(
      videoIds.map((videoId) =>
        inngest.send({
          name: 'virus/idea.approved',
          data: { videoId, userId: user.id },
        }),
      ),
    );

    // 4. Generate a deterministic batchId from the first video ID
    const batchId = `batch_${startDate}_${videoIds[0] ?? 'empty'}`;

    return NextResponse.json(
      { batchId, videoIds, scheduledDates },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
