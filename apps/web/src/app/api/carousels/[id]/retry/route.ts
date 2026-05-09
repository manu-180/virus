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
    const { id } = await params;
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = await createClient();

    const { data: project, error: projectError } = await supabase
      .from('carousel_projects')
      .select('id, user_id, project_id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    if (project.status !== 'failed') {
      return NextResponse.json(
        { error: 'only_failed_carousels_can_be_retried' },
        { status: 409 },
      );
    }

    const admin = createAdminClient();

    // CAS update: only flip to pending if still failed (prevents duplicate dispatches)
    const { data: updated, error: updateError } = await admin
      .from('carousel_projects')
      .update({ status: 'pending', error: null })
      .eq('id', id)
      .eq('status', 'failed')
      .select('id');

    if (updateError) {
      console.error('[POST /api/carousels/[id]/retry] update error:', updateError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'only_failed_carousels_can_be_retried' }, { status: 409 });
    }

    try {
      await inngest.send({
        name: 'virus/carousel.created',
        data: {
          carouselId: id,
          userId: user.id,
          projectId: project.project_id,
        },
      });
    } catch (inngestErr) {
      console.error('[POST /api/carousels/[id]/retry] inngest.send failed:', inngestErr);
      await admin
        .from('carousel_projects')
        .update({ status: 'failed', error: 'Failed to dispatch event' })
        .eq('id', id);
      return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/carousels/[id]/retry]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
