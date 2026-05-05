import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/assets/:id/regenerate
 *
 * V1 STUB — returns 501. The single-asset regeneration flow needs a dedicated
 * Inngest handler that subscribes to `virus/assets.requested` with a
 * single-slot payload. That worker function is out of scope for the V1 ship;
 * for now this endpoint validates ownership and acknowledges the intent so
 * the dashboard UI can be wired without crashing.
 *
 * When the worker handler lands:
 *  - Body: optional `{ category?: 'hook'|'reveal'|'cta', prompt?: string }`
 *  - Behavior: emit `virus/assets.requested` with `{ assetId, ...overrides }`
 *  - Response: 202 with `{ jobId }`.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify the asset exists + caller owns it (via RLS).
    // NOTE: `visual_assets` is not yet in the generated Database types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: asset, error } = await (supabase as any)
      .from('visual_assets')
      .select('id, project_id, category, prompt')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[POST /api/assets/:id/regenerate] lookup error', error);
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
    }
    if (!asset) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        error: 'not_implemented',
        message:
          'Single-asset regeneration is not implemented in V1. Track the next iteration in the assets pipeline plan.',
      },
      { status: 501 },
    );
  } catch (err) {
    console.error('[POST /api/assets/:id/regenerate]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
