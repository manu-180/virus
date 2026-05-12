/**
 * GET /api/ig-accounts/connect/callback?code=...&state=...
 *
 * The redirect target after Meta's OAuth dialog. Steps:
 *   1. Verify state (CSRF + bind to user via cookie)
 *   2. Exchange code → short-lived user token → long-lived user token
 *   3. Enumerate user's pages, find the IG Business account(s)
 *   4. Upsert each discovered IG account via Vault-backed RPC
 *   5. Redirect back to settings with a success/error flag
 *
 * If the user has more than one page with a linked IG, ALL of them get
 * upserted so they can publish from any of them. The carousel detail page
 * uses the active account for the current project (one per project by
 * convention) — but a user can have several across projects.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  decodeOAuthState,
  discoverPublishableAccounts,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
} from '@/lib/instagram-graph';

export const dynamic = 'force-dynamic';

function envOrNull(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function redirectWithFlag(req: NextRequest, target: string, flag: string, message?: string) {
  const url = new URL(target, req.url);
  url.searchParams.set('connect', flag);
  if (message) url.searchParams.set('msg', message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  // ── 1. Validate state ─────────────────────────────────────────────
  const code = req.nextUrl.searchParams.get('code');
  const stateRaw = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');

  if (errorParam) {
    return redirectWithFlag(
      req,
      '/dashboard/settings/instagram',
      'cancelled',
      errorParam,
    );
  }
  if (!code || !stateRaw) {
    return redirectWithFlag(req, '/dashboard/settings/instagram', 'error', 'missing_code_or_state');
  }

  const state = decodeOAuthState(stateRaw);
  if (!state) {
    return redirectWithFlag(req, '/dashboard/settings/instagram', 'error', 'bad_state');
  }

  const csrfCookie = req.cookies.get('ig_oauth_csrf')?.value ?? '';
  const expectedCsrf = `${user.id}.${csrfCookie}`;
  if (!csrfCookie || expectedCsrf !== state.csrf) {
    return redirectWithFlag(req, '/dashboard/settings/instagram', 'error', 'csrf_mismatch');
  }

  // ── 2. Token exchange ─────────────────────────────────────────────
  const appId = envOrNull('META_APP_ID');
  const appSecret = envOrNull('META_APP_SECRET');
  const baseUrl = envOrNull('META_OAUTH_REDIRECT_BASE_URL') ?? envOrNull('NEXT_PUBLIC_APP_URL') ?? req.nextUrl.origin;
  if (!appId || !appSecret) {
    return redirectWithFlag(req, '/dashboard/settings/instagram', 'error', 'meta_app_not_configured');
  }
  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/ig-accounts/connect/callback`;

  let longLivedToken: string;
  let expiresAt: Date | null;
  try {
    const short = await exchangeCodeForUserToken({ code, appId, appSecret, redirectUri });
    const long = await exchangeForLongLivedUserToken({
      shortLivedToken: short.accessToken,
      appId,
      appSecret,
    });
    longLivedToken = long.accessToken;
    expiresAt = long.expiresIn > 0 ? new Date(Date.now() + long.expiresIn * 1000) : null;
  } catch (err) {
    console.error('[ig-oauth] token exchange failed', err);
    return redirectWithFlag(
      req,
      state.returnTo,
      'error',
      err instanceof Error ? err.message.slice(0, 120) : 'token_exchange_failed',
    );
  }

  // ── 3. Discover IG accounts ───────────────────────────────────────
  let accounts;
  try {
    accounts = await discoverPublishableAccounts(longLivedToken);
  } catch (err) {
    console.error('[ig-oauth] discovery failed', err);
    return redirectWithFlag(
      req,
      state.returnTo,
      'error',
      err instanceof Error ? err.message.slice(0, 120) : 'discovery_failed',
    );
  }

  if (accounts.length === 0) {
    return redirectWithFlag(
      req,
      state.returnTo,
      'no_pages',
      'Tu cuenta de Facebook no tiene páginas con Instagram vinculado',
    );
  }

  // ── 4. Upsert via service-role RPC ────────────────────────────────
  const admin = createAdminClient();
  const created: string[] = [];
  for (const acct of accounts) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: accountId, error } = await (admin.rpc as any)(
        'ig_account_upsert_graph',
        {
          p_project_id: state.projectId,
          p_ig_username: acct.igUsername,
          p_display_name: acct.pageName,
          p_graph_user_id: acct.igUserId,
          p_graph_page_id: acct.pageId,
          p_access_token: acct.pageAccessToken,
          p_expires_at: expiresAt ? expiresAt.toISOString() : null,
        },
      );
      if (error) {
        console.error('[ig-oauth] upsert RPC failed', { username: acct.igUsername, error });
        continue;
      }
      if (accountId) created.push(String(accountId));
    } catch (err) {
      console.error('[ig-oauth] upsert exception', err);
    }
  }

  if (created.length === 0) {
    return redirectWithFlag(req, state.returnTo, 'error', 'no_accounts_saved');
  }

  // ── 5. Clean up + success redirect ────────────────────────────────
  const res = redirectWithFlag(
    req,
    state.returnTo,
    'ok',
    `${accounts.length} cuenta(s) conectada(s)`,
  );
  res.cookies.delete('ig_oauth_csrf');
  return res;
}
