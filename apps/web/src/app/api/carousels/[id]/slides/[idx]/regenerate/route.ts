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

// Cap the user-provided hint to keep the LLM/image prompt bounded and prevent
// abuse. 240 chars is enough for things like "más oscuro, sin manos, paleta
// más fría" without giving room for a prompt-injection essay.
const MAX_HINT_LEN = 240;

function sanitizeHint(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, MAX_HINT_LEN);
}

// POST /api/carousels/[id]/slides/[idx]/regenerate
// Body (optional): { hint?: string }  — free-form steer for the new image.
// Marks the slide as pending and dispatches a regeneration Inngest event.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    const { id, idx: idxStr } = await params;
    const idx = parseInt(idxStr, 10);

    if (isNaN(idx) || idx < 0) {
      return NextResponse.json({ error: 'invalid_idx' }, { status: 400 });
    }

    // Body is optional — older callers POST without one. Tolerate any
    // parse/content-type error and treat as "no hint".
    let hint: string | undefined;
    try {
      const body = (await req.json()) as { hint?: unknown };
      hint = sanitizeHint(body?.hint);
    } catch {
      hint = undefined;
    }

    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = await createClient();

    // Verify user owns the carousel
    const { data: project, error: projectError } = await supabase
      .from('carousel_projects')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Verify the slide exists
    const { data: slide, error: slideError } = await supabase
      .from('carousel_slides')
      .select('id, status')
      .eq('carousel_id', id)
      .eq('idx', idx)
      .single();

    if (slideError || !slide) {
      return NextResponse.json({ error: 'slide_not_found' }, { status: 404 });
    }

    // Mark slide as pending (optimistic — UI shows shimmer immediately)
    const admin = createAdminClient();
    await admin
      .from('carousel_slides')
      .update({ status: 'pending', error: null })
      .eq('carousel_id', id)
      .eq('idx', idx);

    // Dispatch Inngest event
    await inngest.send({
      name: 'virus/carousel.slide.regenerate.requested' as never,
      data: {
        carouselId: id,
        userId: user.id,
        idx,
        ...(hint ? { hint } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/carousels/[id]/slides/[idx]/regenerate]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
