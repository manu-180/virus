/**
 * GET /api/li-accounts/connect/callback?code=...&state=...
 *
 * Redirect target del diálogo OAuth de LinkedIn:
 *   1. Verificar state (CSRF + cookie)
 *   2. Intercambiar code → access_token (+ refresh_token si aplica)
 *   3. Obtener perfil (person URN + nombre)
 *   4. Upsert en li_accounts vía RPC con Vault
 *   5. Redirigir a settings con flag de resultado
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  decodeOAuthState,
  exchangeCodeForToken,
  getLinkedInProfile,
} from '@/lib/linkedin-api';

export const dynamic = 'force-dynamic';

function envOrNull(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function publicOrigin(req: NextRequest): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  return raw.replace(/\/$/, '');
}

function redirectWithFlag(req: NextRequest, target: string, flag: string, message?: string) {
  const url = new URL(target, publicOrigin(req));
  url.searchParams.set('connect', flag);
  if (message) url.searchParams.set('msg', message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const RETURN_TO = '/dashboard/settings/linkedin';

  // ── 1. Verificar state / CSRF ─────────────────────────────────────
  const code       = req.nextUrl.searchParams.get('code');
  const stateRaw   = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');
  const errorDesc  = req.nextUrl.searchParams.get('error_description');

  if (errorParam) {
    const cancelled = errorParam === 'user_cancelled_login' || errorParam === 'access_denied';
    return redirectWithFlag(req, RETURN_TO, cancelled ? 'cancelled' : 'error',
      cancelled ? 'Cancelaste la autorización de LinkedIn' : (errorDesc ?? errorParam));
  }
  if (!code || !stateRaw) {
    return redirectWithFlag(req, RETURN_TO, 'error', 'missing_code_or_state');
  }

  const state = decodeOAuthState(stateRaw);
  if (!state) return redirectWithFlag(req, RETURN_TO, 'error', 'bad_state');

  const csrfCookie   = req.cookies.get('li_oauth_csrf')?.value ?? '';
  const expectedCsrf = `${user.id}.${csrfCookie}`;
  if (!csrfCookie || expectedCsrf !== state.csrf) {
    return redirectWithFlag(req, RETURN_TO, 'error', 'csrf_mismatch');
  }

  // ── 2. Token exchange ─────────────────────────────────────────────
  const clientId     = envOrNull('LINKEDIN_CLIENT_ID');
  const clientSecret = envOrNull('LINKEDIN_CLIENT_SECRET');
  const baseUrl      = envOrNull('NEXT_PUBLIC_APP_URL') ?? req.nextUrl.origin;

  if (!clientId || !clientSecret) {
    return redirectWithFlag(req, RETURN_TO, 'error', 'linkedin_app_not_configured');
  }

  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/li-accounts/connect/callback`;

  let tokenResult: Awaited<ReturnType<typeof exchangeCodeForToken>>;
  try {
    tokenResult = await exchangeCodeForToken({ code, clientId, clientSecret, redirectUri });
  } catch (err) {
    console.error('[li-oauth] token exchange failed', err);
    return redirectWithFlag(req, RETURN_TO, 'error',
      err instanceof Error ? err.message.slice(0, 120) : 'token_exchange_failed');
  }

  // ── 3. Perfil ─────────────────────────────────────────────────────
  let profile: Awaited<ReturnType<typeof getLinkedInProfile>>;
  try {
    profile = await getLinkedInProfile(tokenResult.accessToken);
  } catch (err) {
    console.error('[li-oauth] profile fetch failed', err);
    return redirectWithFlag(req, RETURN_TO, 'error',
      err instanceof Error ? err.message.slice(0, 120) : 'profile_failed');
  }

  // ── 4. Upsert en Supabase (service-role) ─────────────────────────
  const admin      = createAdminClient();
  const accessExp  = new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString();
  const refreshExp = tokenResult.refreshTokenExpiresIn
    ? new Date(Date.now() + tokenResult.refreshTokenExpiresIn * 1000).toISOString()
    : null;

  let accountId: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.rpc as any)('li_account_upsert', {
      p_project_id:            state.projectId,
      p_li_person_urn:         profile.personUrn,
      p_li_username:           profile.email ?? profile.name,
      p_display_name:          profile.name,
      p_access_token:          tokenResult.accessToken,
      p_access_token_expires:  accessExp,
      p_refresh_token:         tokenResult.refreshToken,
      p_refresh_token_expires: refreshExp,
    });
    if (error) {
      console.error('[li-oauth] upsert RPC failed', error);
      return redirectWithFlag(req, RETURN_TO, 'error', 'upsert_failed');
    }
    accountId = String(data);
  } catch (err) {
    console.error('[li-oauth] upsert exception', err);
    return redirectWithFlag(req, RETURN_TO, 'error', 'upsert_exception');
  }

  // ── 5. Limpiar cookie + success ───────────────────────────────────
  const res = redirectWithFlag(req, state.returnTo, 'ok',
    `Cuenta de LinkedIn conectada (${profile.name}) — id: ${accountId}`);
  res.cookies.delete('li_oauth_csrf');
  return res;
}
