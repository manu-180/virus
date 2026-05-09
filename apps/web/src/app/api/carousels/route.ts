import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';
import { CreateCarouselSchema } from '@/lib/validators/carousels';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = CreateCarouselSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_error', details: parsed.error.errors },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('id, user_id')
      .eq('id', input.projectId)
      .is('deleted_at', null)
      .single();

    if (projectError || !project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const { data: carousel, error: insertError } = await admin
      .from('carousel_projects')
      .insert({
        project_id: input.projectId,
        user_id: user.id,
        status: 'pending',
        brief: input.brief,
        style_preset: input.stylePreset,
        slide_count: input.brief.slideCount,
      })
      .select('id')
      .single();

    if (insertError || !carousel) {
      console.error('[POST /api/carousels] insert error:', insertError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    try {
      await inngest.send({
        name: 'virus/carousel.created',
        data: { carouselId: carousel.id, userId: user.id, projectId: input.projectId },
      });
    } catch (inngestErr) {
      console.error('[POST /api/carousels] inngest.send failed:', inngestErr);
      await admin
        .from('carousel_projects')
        .update({ status: 'failed', error: 'Failed to dispatch event' })
        .eq('id', carousel.id);
      return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 });
    }

    return NextResponse.json({ carouselId: carousel.id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/carousels]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from('carousel_projects')
      .select('id, project_id, status, style_preset, slide_count, created_at, updated_at, error')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    const items = (rows ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      stylePreset: row.style_preset,
      slideCount: row.slide_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      error: row.error,
    }));

    return NextResponse.json({ items });
  } catch (err) {
    console.error('[GET /api/carousels]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
