import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// POST /api/carousels/[id]/captions/[variantIdx]/select
// Exclusively selects one caption variant, deselecting all others.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; variantIdx: string }> },
) {
  try {
    const { id, variantIdx: variantIdxStr } = await params;
    const variantIdx = parseInt(variantIdxStr, 10);

    if (isNaN(variantIdx) || variantIdx < 0 || variantIdx > 2) {
      return NextResponse.json({ error: 'invalid_variant_idx' }, { status: 400 });
    }

    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const supabase = await createClient();

    // Verify user owns the carousel
    const { data: project, error: projectError } = await supabase
      .from('carousel_projects')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Deselect all variants for this carousel
    const { error: deselectError } = await supabase
      .from('carousel_captions')
      .update({ selected: false })
      .eq('carousel_id', id)
      .eq('user_id', user.id);

    if (deselectError) {
      console.error('[POST /api/carousels/[id]/captions/[variantIdx]/select] deselect', deselectError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    // Select the requested variant
    const { error: selectError } = await supabase
      .from('carousel_captions')
      .update({ selected: true })
      .eq('carousel_id', id)
      .eq('user_id', user.id)
      .eq('variant_idx', variantIdx);

    if (selectError) {
      console.error('[POST /api/carousels/[id]/captions/[variantIdx]/select] select', selectError);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/carousels/[id]/captions/[variantIdx]/select]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
