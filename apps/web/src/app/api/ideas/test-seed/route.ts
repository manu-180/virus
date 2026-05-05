import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * POST /api/ideas/test-seed
 *
 * Creates a draft idea seeded from `viral_hooks_seed`, optionally approves it
 * immediately and triggers the rendering pipeline.
 *
 * Body: { projectId?: string, autoApprove?: boolean (default true) }
 * Returns: { ideaId, videoId | null }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string;
      autoApprove?: boolean;
    };

    const admin = createAdminClient();

    let projectId = body.projectId ?? null;
    if (!projectId) {
      const { data: project } = await admin
        .from('projects')
        .select('id')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      projectId = project?.id ?? null;
    } else {
      const { data: ownership } = await admin
        .from('projects')
        .select('id, user_id')
        .eq('id', projectId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!ownership || ownership.user_id !== user.id) {
        return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
      }
    }

    if (!projectId) {
      return NextResponse.json({ error: 'no_project' }, { status: 412 });
    }

    const { data: hookRow, error: hookErr } = await admin
      .from('viral_hooks_seed')
      .select('hook, hook_type')
      .eq('language', 'es-AR')
      .order('id', { ascending: false })
      .limit(50);

    if (hookErr || !hookRow || hookRow.length === 0) {
      return NextResponse.json({ error: 'no_hooks_available' }, { status: 500 });
    }

    const pick = hookRow[Math.floor(Math.random() * hookRow.length)]!;

    const { data: idea, error: ideaErr } = await admin
      .from('video_ideas')
      .insert({
        project_id: projectId,
        user_id: user.id,
        hook: pick.hook,
        angle: 'Prueba de pipeline end-to-end',
        format: 'tip',
        estimated_duration: 45,
        status: 'draft',
        metadata: { source: 'test-seed', hook_type: pick.hook_type },
      })
      .select('id, hook, format, estimated_duration, status, created_at, project_id')
      .single();

    if (ideaErr || !idea) {
      return NextResponse.json(
        { error: 'create_idea_failed', detail: ideaErr?.message },
        { status: 500 },
      );
    }

    const autoApprove = body.autoApprove !== false;

    if (!autoApprove) {
      return NextResponse.json({ ideaId: idea.id, videoId: null }, { status: 201 });
    }

    await admin.from('video_ideas').update({ status: 'approved' }).eq('id', idea.id);

    const { data: video, error: videoErr } = await admin
      .from('videos')
      .insert({
        project_id: projectId,
        user_id: user.id,
        idea_id: idea.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (videoErr || !video) {
      return NextResponse.json(
        { error: 'create_video_failed', detail: videoErr?.message },
        { status: 500 },
      );
    }

    await inngest.send({
      name: 'virus/idea.approved',
      data: { videoId: video.id, userId: user.id },
    });

    return NextResponse.json(
      { ideaId: idea.id, videoId: video.id, hook: pick.hook },
      { status: 202 },
    );
  } catch (err: unknown) {
    console.error('[POST /api/ideas/test-seed]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
