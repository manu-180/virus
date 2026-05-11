import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';
import { CreateCarouselSchema } from '@/lib/validators/carousels';
import { bumpTopicUsage } from '@/server/topics/queries';

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
        // brief column is text — store a serialized JSON string so the worker
        // can `JSON.parse(row.brief)`. Passing the raw object only "worked"
        // because PostgREST coerces JSON→text on insert; making this explicit
        // restores type-safety with the generated supabase types.
        brief: JSON.stringify(input.brief),
        style_preset: input.stylePreset,
        slide_count: input.brief.slideCount,
      })
      .select('id')
      .single();

    if (insertError || !carousel) {
      console.error('[POST /api/carousels] insert error:', insertError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    // Bump contador de topic + dimension_usage. NO crítico — si falla,
    // logueamos y seguimos. El carrusel ya está creado; los contadores
    // son metadata para mejorar UX, no para gating.
    try {
      await bumpTopicUsage({
        carouselId: carousel.id,
        rawTitle: input.brief.topic,
        angle: input.brief.angle,
        tone: input.brief.tone,
        selectedTopicId: input.selectedTopicId ?? null,
      });
    } catch (bumpErr) {
      console.error('[POST /api/carousels] bumpTopicUsage failed:', bumpErr);
    }

    let dispatchedEventId: string | null = null;
    try {
      const sendResult = await inngest.send({
        name: 'virus/carousel.created',
        data: { carouselId: carousel.id, userId: user.id, projectId: input.projectId },
      });
      // `inngest.send` returns { ids: string[] } in v3. Persist the first id
      // so we can correlate Inngest Cloud runs with DB rows when debugging.
      const ids = (sendResult as { ids?: string[] } | undefined)?.ids;
      dispatchedEventId = ids?.[0] ?? null;
      console.log(JSON.stringify({
        route: 'POST /api/carousels',
        carouselId: carousel.id,
        userId: user.id,
        event: 'virus/carousel.created',
        eventId: dispatchedEventId,
        ok: true,
      }));
    } catch (inngestErr) {
      console.error('[POST /api/carousels] inngest.send failed:', inngestErr);
      await admin
        .from('carousel_projects')
        .update({ status: 'failed', error: 'Failed to dispatch event' })
        .eq('id', carousel.id);
      return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 });
    }

    // Non-critical: persist the inngest event id for diagnostics. Don't fail
    // the request if this update errors.
    if (dispatchedEventId) {
      try {
        await admin
          .from('carousel_projects')
          .update({ inngest_run_id: dispatchedEventId })
          .eq('id', carousel.id);
      } catch (idErr) {
        console.error('[POST /api/carousels] failed to persist inngest_run_id:', idErr);
      }
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
