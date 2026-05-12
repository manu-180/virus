/**
 * DELETE /api/ig-accounts/[id]
 *   Soft-delete an IG account (sets deleted_at). Vault secrets stay
 *   linked but the account is invisible to the publisher and the UI.
 *   The user can reconnect anytime via the OAuth flow.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('ig_accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('id')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/ig-accounts/[id]]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
