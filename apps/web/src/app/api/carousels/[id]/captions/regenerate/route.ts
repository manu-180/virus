import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';

const REGEN_LIMIT = 3;

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// POST /api/carousels/[id]/captions/regenerate
// Deletes existing captions and dispatches a new caption generation event.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = await createClient();

    // Verify user owns the carousel and fetch regen count
    const { data: project, error: projectError } = await supabase
      .from('carousel_projects')
      .select('id, caption_regen_count')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    if (project.caption_regen_count >= REGEN_LIMIT) {
      return NextResponse.json({ error: 'regen_limit_reached' }, { status: 429 });
    }

    const admin = createAdminClient();

    // Delete existing captions
    await admin
      .from('carousel_captions')
      .delete()
      .eq('carousel_id', id);

    // Reset status and increment regen count
    await admin
      .from('carousel_projects')
      .update({
        status: 'generating_captions',
        caption_regen_count: project.caption_regen_count + 1,
      })
      .eq('id', id);

    // Dispatch Inngest caption generation event
    await inngest.send({
      name: 'virus/carousel.caption.requested' as never,
      data: { carouselId: id, userId: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/carousels/[id]/captions/regenerate]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
