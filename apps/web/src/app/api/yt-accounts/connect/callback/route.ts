/**
 * GET /api/yt-accounts/connect/callback?code=...&state=...
 *
 * Destino del redirect de Google OAuth. Pasos:
 *   1. Verificar state (CSRF + bind al usuario via cookie)
 *   2. Intercambiar código → access_token + refresh_token
 *   3. Obtener info del canal de YouTube del usuario
 *   4. Upsert en yt_accounts via RPC (Vault-backed)
 *   5. Redirigir a settings con flag de éxito/error
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  decodeYtOAuthState,
  exchangeCodeForYtTokens,
  getMyYouTubeChannel,
  YtOAuthError,
} from '@/lib/youtube-api';

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

  // ── 1. Validar state ──────────────────────────────────────────────
  const code = req.nextUrl.searchParams.get('code');
  const stateRaw = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');

  if (errorParam) {
    const isCancelled = errorParam === 'access_denied';
    return redirectWithFlag(
      req,
      '/dashboard/settings/youtube',
      isCancelled ? 'cancelled' : 'error',
      isCancelled ? 'Cancelaste la autorización de Google' : errorParam,
    );
  }

  if (!code || !stateRaw) {
    return redirectWithFlag(req, '/dashboard/settings/youtube', 'error', 'missing_code_or_state');
  }

  const state = decodeYtOAuthState(stateRaw);
  if (!state) {
    return redirectWithFlag(req, '/dashboard/settings/youtube', 'error', 'bad_state');
  }

  const csrfCookie = req.cookies.get('yt_oauth_csrf')?.value ?? '';
  const expectedCsrf = `${user.id}.${csrfCookie}`;
  if (!csrfCookie || expectedCsrf !== state.csrf) {
    return redirectWithFlag(req, '/dashboard/settings/youtube', 'error', 'csrf_mismatch');
  }

  // ── 2. Token exchange ─────────────────────────────────────────────
  const clientId = envOrNull('GOOGLE_CLIENT_ID');
  const clientSecret = envOrNull('GOOGLE_CLIENT_SECRET');
  const baseUrl = envOrNull('NEXT_PUBLIC_APP_URL') ?? req.nextUrl.origin;
  if (!clientId || !clientSecret) {
    return redirectWithFlag(req, '/dashboard/settings/youtube', 'error', 'google_app_not_configured');
  }
  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/yt-accounts/connect/callback`;

  let accessToken: string;
  let refreshToken: string;
  let expiresAt: Date;
  try {
    const tokens = await exchangeCodeForYtTokens({ code, clientId, clientSecret, redirectUri });
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
  } catch (err) {
    console.error('[yt-oauth] token exchange failed', err);
    return redirectWithFlag(
      req,
      state.returnTo,
      'error',
      err instanceof YtOAuthError ? err.message.slice(0, 120) : 'token_exchange_failed',
    );
  }

  // ── 3. Obtener info del canal ─────────────────────────────────────
  let channelId: string;
  let channelTitle: string;
  try {
    const channel = await getMyYouTubeChannel(accessToken);
    channelId = channel.channelId;
    channelTitle = channel.channelTitle;
  } catch (err) {
    console.error('[yt-oauth] channel discovery failed', err);
    return redirectWithFlag(
      req,
      state.returnTo,
      'error',
      err instanceof YtOAuthError ? err.message.slice(0, 120) : 'channel_discovery_failed',
    );
  }

  // ── 4. Upsert via service-role RPC ────────────────────────────────
  const admin = createAdminClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: accountId, error } = await (admin.rpc as any)(
      'yt_account_upsert',
      {
        p_project_id:           state.projectId,
        p_yt_channel_id:        channelId,
        p_yt_channel_title:     channelTitle,
        p_display_name:         channelTitle,
        p_access_token:         accessToken,
        p_access_token_expires: expiresAt.toISOString(),
        p_refresh_token:        refreshToken,
      },
    );
    if (error || !accountId) {
      console.error('[yt-oauth] upsert RPC failed', error);
      return redirectWithFlag(req, state.returnTo, 'error', 'account_save_failed');
    }
  } catch (err) {
    console.error('[yt-oauth] upsert exception', err);
    return redirectWithFlag(req, state.returnTo, 'error', 'account_save_exception');
  }

  // ── 5. Éxito ──────────────────────────────────────────────────────
  const res = redirectWithFlag(
    req,
    state.returnTo,
    'ok',
    `Canal "${channelTitle}" conectado`,
  );
  res.cookies.delete('yt_oauth_csrf');
  return res;
}
