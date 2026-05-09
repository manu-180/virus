import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const patchSchema = z.object({
  text: z.string().min(1).max(2200),
  hashtags: z.array(z.string()).optional(),
});

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// PATCH /api/carousels/[id]/captions/[variantIdx]
// Updates the text (and optional hashtags) for a caption variant.
export async function PATCH(
  req: NextRequest,
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

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const { text, hashtags } = parsed.data;

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

    const combinedText =
      hashtags && hashtags.length > 0
        ? `${text}\n\n${hashtags.map((h) => `#${h}`).join(' ')}`
        : text;

    const { error: updateError } = await supabase
      .from('carousel_captions')
      .update({ text: combinedText })
      .eq('carousel_id', id)
      .eq('variant_idx', variantIdx)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[PATCH /api/carousels/[id]/captions/[variantIdx]]', updateError);
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/carousels/[id]/captions/[variantIdx]]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
