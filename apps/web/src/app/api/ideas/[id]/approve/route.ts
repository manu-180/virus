import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id: ideaId } = await params;
    const admin = createAdminClient();

    // Load idea and verify ownership via project
    const { data: idea, error: ideaErr } = await admin
      .from('video_ideas')
      .select('id, project_id, user_id, status, hook, angle, format, estimated_duration')
      .eq('id', ideaId)
      .is('deleted_at', null)
      .single();

    if (ideaErr || !idea) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (idea.user_id !== user.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (idea.status === 'scripted') {
      return NextResponse.json({ error: 'already_scripted' }, { status: 409 });
    }

    // Mark idea approved (idempotent)
    await admin
      .from('video_ideas')
      .update({ status: 'approved' })
      .eq('id', ideaId);

    // Create pending video row linked to this idea
    const { data: video, error: videoErr } = await admin
      .from('videos')
      .insert({
        project_id: idea.project_id,
        user_id: user.id,
        idea_id: ideaId,
        status: 'pending',
      })
      .select('id')
      .single();

    if (videoErr || !video) {
      return NextResponse.json({ error: 'create_video_failed' }, { status: 500 });
    }

    // Kick off the pipeline
    await inngest.send({
      name: 'virus/idea.approved',
      data: { videoId: video.id, userId: user.id },
    });

    return NextResponse.json({ ok: true, videoId: video.id }, { status: 202 });
  } catch (err: unknown) {
    console.error('[POST /api/ideas/[id]/approve]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
