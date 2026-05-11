import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';
import { inferLastOkStep } from '@virus/shared/carousel';
import type { LastOkStep } from '@virus/shared/carousel';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// ---------------------------------------------------------------------------
// Build the Inngest dispatch plan based on last successful step
// ---------------------------------------------------------------------------

type DispatchPlan =
  | { event: 'virus/carousel.created'; data: { carouselId: string; userId: string; projectId: string }; targetStatus: 'pending' }
  | { event: 'virus/carousel.slides.requested'; data: { carouselId: string; userId: string }; targetStatus: 'generating_slides' }
  | { event: 'virus/carousel.slides.composed.requested'; data: { carouselId: string; userId: string; succeededIdxs: number[] }; targetStatus: 'composing' }
  | { event: 'virus/carousel.caption.requested'; data: { carouselId: string; userId: string }; targetStatus: 'generating_captions' }
  | null; // captions case — just mark ready, no dispatch

function buildDispatchPlan(
  lastOkStep: LastOkStep,
  carouselId: string,
  userId: string,
  projectId: string,
  readySlideIdxs: number[],
): DispatchPlan {
  switch (lastOkStep) {
    case 'none':
      return {
        event: 'virus/carousel.created',
        data: { carouselId, userId, projectId },
        targetStatus: 'pending',
      };
    case 'plan':
      return {
        event: 'virus/carousel.slides.requested',
        data: { carouselId, userId },
        targetStatus: 'generating_slides',
      };
    case 'slides':
      return {
        event: 'virus/carousel.slides.composed.requested',
        data: { carouselId, userId, succeededIdxs: readySlideIdxs },
        targetStatus: 'composing',
      };
    case 'composing':
      return {
        event: 'virus/carousel.caption.requested',
        data: { carouselId, userId },
        targetStatus: 'generating_captions',
      };
    case 'captions':
      return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

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

    if (project.status !== 'failed' && project.status !== 'pending') {
      return NextResponse.json(
        { error: 'only_failed_or_pending_carousels_can_be_retried' },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // Load slides + caption count to infer last successful step
    // ------------------------------------------------------------------
    const [slidesResult, captionsResult] = await Promise.all([
      supabase
        .from('carousel_slides')
        .select('status, image_path, composed_path')
        .eq('carousel_id', id)
        .is('deleted_at', null),
      supabase
        .from('carousel_captions')
        .select('id', { count: 'exact', head: true })
        .eq('carousel_id', id),
    ]);

    const slides = slidesResult.data ?? [];
    const captionCount = captionsResult.count ?? 0;

    const lastOkStep = inferLastOkStep({ slides, captionCount, status: project.status });

    // Slides with image_path for compose resumption
    const readySlideIdxs = (
      (slidesResult.data ?? []) as Array<{ image_path: string | null; composed_path: string | null; status: string }>
    )
      .map((s, i) => ({ ...s, idx: i }))
      .filter((s) => s.image_path !== null)
      .map((s) => s.idx);

    const plan = buildDispatchPlan(
      lastOkStep,
      id,
      user.id,
      project.project_id,
      readySlideIdxs,
    );

    const admin = createAdminClient();

    // Edge case: captions already exist but carousel is failed — just mark ready
    if (plan === null) {
      await admin
        .from('carousel_projects')
        .update({ status: 'ready', error: null })
        .eq('id', id)
        .eq('status', 'failed');
      return NextResponse.json({ ok: true, resumedFrom: lastOkStep });
    }

    // ------------------------------------------------------------------
    // CAS update: flip to target status only if still failed
    // ------------------------------------------------------------------
    const { data: updated, error: updateError } = await admin
      .from('carousel_projects')
      .update({ status: plan.targetStatus, error: null })
      .eq('id', id)
      .in('status', ['failed', 'pending'])
      .select('id');

    if (updateError) {
      console.error('[POST /api/carousels/[id]/retry] update error:', updateError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'only_failed_carousels_can_be_retried' }, { status: 409 });
    }

    // ------------------------------------------------------------------
    // Dispatch the resumption event
    // ------------------------------------------------------------------
    let dispatchedEventId: string | null = null;
    try {
      const sendResult = await inngest.send({
        name: plan.event,
        data: plan.data,
      } as Parameters<typeof inngest.send>[0]);
      const ids = (sendResult as { ids?: string[] } | undefined)?.ids;
      dispatchedEventId = ids?.[0] ?? null;
    } catch (inngestErr) {
      console.error('[POST /api/carousels/[id]/retry] inngest.send failed:', inngestErr);
      await admin
        .from('carousel_projects')
        .update({ status: 'failed', error: 'Failed to dispatch retry event' })
        .eq('id', id);
      return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 });
    }

    // Persist the new inngest event id (overwrite previous — we care about
    // the latest attempt for diagnostics).
    if (dispatchedEventId) {
      try {
        await admin
          .from('carousel_projects')
          .update({ inngest_run_id: dispatchedEventId })
          .eq('id', id);
      } catch (idErr) {
        console.error('[POST /api/carousels/[id]/retry] failed to persist inngest_run_id:', idErr);
      }
    }

    console.log(JSON.stringify({
      route: 'POST /api/carousels/[id]/retry',
      carouselId: id,
      lastOkStep,
      dispatchedEvent: plan.event,
      eventId: dispatchedEventId,
    }));

    return NextResponse.json({ ok: true, resumedFrom: lastOkStep });
  } catch (err) {
    console.error('[POST /api/carousels/[id]/retry]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
