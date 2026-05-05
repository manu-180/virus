import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';
import { loadGenerationContext } from '@/server/generate/load-context';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const projectId: string | undefined = body?.projectId;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'projectId_required' }, { status: 400 });
    }

    // Validate project ownership (shallow check — just id + user_id)
    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Pre-flight: check parsed patterns + brand exist
    const ctx = await loadGenerationContext(projectId);
    if (!ctx.patterns || !ctx.brand) {
      return NextResponse.json(
        {
          error: 'project_incomplete',
          detail: 'Subí los archivos de patrones y marca antes de generar.',
        },
        { status: 412 }
      );
    }

    // Create pending video row
    const { data: video, error: videoError } = await admin
      .from('videos')
      .insert({
        project_id: projectId,
        user_id: user.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (videoError || !video) {
      return NextResponse.json({ error: 'create_video_failed' }, { status: 500 });
    }

    // Dispatch Inngest event
    await inngest.send({
      name: 'virus/generate.requested',
      data: { videoId: video.id, projectId, userId: user.id },
    });

    return NextResponse.json({ ok: true, videoId: video.id }, { status: 202 });
  } catch (err: unknown) {
    console.error('[POST /api/generate]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
