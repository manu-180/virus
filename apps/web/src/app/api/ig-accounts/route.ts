/**
 * GET /api/ig-accounts?projectId=<uuid>
 *   Returns the user's Instagram accounts, optionally scoped to a project.
 *   Used by the carousel detail UI to decide whether to show a "publish"
 *   button, and by the settings page to list connected accounts.
 *
 * No write endpoints — onboarding goes through the CLI because IG often
 * triggers a challenge that requires the user's phone in real-time.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ig_accounts is not yet in the generated DB types. Cast through `any` until
// `pnpm db:types` regenerates from migration 0028.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const projectId = req.nextUrl.searchParams.get('projectId');

    let query = (supabase as AnyTable)
      .from('ig_accounts')
      .select(
        'id, project_id, ig_username, display_name, status, session_updated_at, last_post_at, post_count_24h, daily_post_limit, last_error',
      )
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error: qErr } = await query;
    if (qErr) {
      console.error('[GET /api/ig-accounts]', qErr);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    return NextResponse.json({ accounts: data ?? [] });
  } catch (err) {
    console.error('[GET /api/ig-accounts]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
