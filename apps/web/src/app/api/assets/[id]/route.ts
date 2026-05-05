import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const TagsPatchSchema = z.object({
  tags: z.array(z.string().min(1).max(64)).max(32),
});

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

/**
 * DELETE /api/assets/:id  → soft delete (sets `burned = true`).
 *
 * We never hard-delete because past videos may reference the asset row.
 * RLS handles ownership.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireUser();
    if (!ctx) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { supabase } = ctx;
    const { id } = await params;

    // NOTE: `visual_assets` is not yet in the generated Database types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, count } = await (supabase as any)
      .from('visual_assets')
      .update({ burned: true }, { count: 'exact' })
      .eq('id', id);

    if (error) {
      console.error('[DELETE /api/assets/:id] update error', error);
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }

    if ((count ?? 0) === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[DELETE /api/assets/:id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * PATCH /api/assets/:id  body { tags: string[] }
 *
 * Replaces the `tags` array. RLS enforces ownership.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireUser();
    if (!ctx) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { supabase } = ctx;
    const { id } = await params;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const parsed = TagsPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, data } = await (supabase as any)
      .from('visual_assets')
      .update({ tags: parsed.data.tags })
      .eq('id', id)
      .select('id, tags')
      .maybeSingle();

    if (error) {
      console.error('[PATCH /api/assets/:id] update error', error);
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, asset: data }, { status: 200 });
  } catch (err) {
    console.error('[PATCH /api/assets/:id]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
