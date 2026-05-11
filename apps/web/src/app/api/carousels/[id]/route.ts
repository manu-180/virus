import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// Stuck-state watchdog thresholds (ms). If a carousel sits in a non-terminal
// status longer than its threshold, we mark it failed so the UI surfaces a
// retry banner instead of looking frozen forever.
//
// Why this exists: if Inngest Cloud can't reach the worker (worker offline,
// app not synced after redeploy, wrong signing key), `inngest.send()` accepts
// the event but no function ever runs — including the onFailure hook that
// would normally set status='failed'. Without this watchdog the row sits in
// 'pending' indefinitely with no error message.
const STUCK_THRESHOLDS_MS: Record<string, number> = {
  pending:             90_000,   // 1.5 min — plan step is fast
  generating_slides:   600_000,  // 10 min — N slides at concurrency 3
  composing:           300_000,  // 5 min  — satori+sharp composition
  generating_captions: 180_000,  // 3 min  — claude call
};

interface CarouselProjectLike {
  id: string;
  status: string;
  error: string | null;
  updated_at: string;
  created_at: string;
}

/**
 * Mutates `project` in place if it crossed the stuck threshold. Returns true
 * if the DB was updated. The CAS on status prevents overwriting a row that
 * just transitioned naturally between the GET and the UPDATE.
 */
async function failIfStuck(project: CarouselProjectLike): Promise<boolean> {
  const threshold = STUCK_THRESHOLDS_MS[project.status];
  if (!threshold) return false;

  // For 'pending' use created_at (no upstream UPDATE yet); for the rest use
  // updated_at (the last status transition).
  const anchor = project.status === 'pending' ? project.created_at : project.updated_at;
  const ageMs = Date.now() - new Date(anchor).getTime();
  if (ageMs <= threshold) return false;

  const admin = createAdminClient();
  const errorPayload = JSON.stringify({
    step: `watchdog:${project.status}`,
    message: `Stuck in ${project.status} for ${Math.round(ageMs / 1000)}s. ` +
             `Worker likely offline or Inngest app not synced.`,
    ts: new Date().toISOString(),
  });

  const { data, error } = await admin
    .from('carousel_projects')
    .update({ status: 'failed', error: errorPayload })
    .eq('id', project.id)
    .eq('status', project.status) // CAS — don't clobber a fresh transition
    .select('id, status, error, updated_at')
    .maybeSingle();

  if (error) {
    console.error('[GET /api/carousels/[id]] watchdog update failed:', error);
    return false;
  }
  if (!data) return false; // status changed mid-flight, leave it alone

  console.log(JSON.stringify({
    route: 'GET /api/carousels/[id]',
    watchdog: true,
    carouselId: project.id,
    fromStatus: project.status,
    ageSec: Math.round(ageMs / 1000),
  }));

  project.status = 'failed';
  project.error = errorPayload;
  project.updated_at = data.updated_at as string;
  return true;
}

export async function GET(
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
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    await failIfStuck(project as unknown as CarouselProjectLike);

    const { data: slides, error: slidesError } = await supabase
      .from('carousel_slides')
      .select('*')
      .eq('carousel_id', id)
      .order('idx', { ascending: true });

    if (slidesError) {
      console.error('[GET /api/carousels/[id]] slides error:', slidesError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    const { data: captions, error: captionsError } = await supabase
      .from('carousel_captions')
      .select('*')
      .eq('carousel_id', id)
      .order('variant_idx', { ascending: true });

    if (captionsError) {
      console.error('[GET /api/carousels/[id]] captions error:', captionsError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    return NextResponse.json({
      project,
      slides: slides ?? [],
      captions: captions ?? [],
    });
  } catch (err) {
    console.error('[GET /api/carousels/[id]]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
