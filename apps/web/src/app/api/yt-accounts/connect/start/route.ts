/**
 * GET /api/yt-accounts/connect/start?projectId=<uuid>
 *
 * Inicia el flujo OAuth de Google para conectar un canal de YouTube:
 *   1. Valida que el usuario es dueño del proyecto
 *   2. Genera un state token con CSRF
 *   3. Redirige al diálogo de autorización de Google
 *
 * Después de que el usuario aprueba, Google redirige a
 * /api/yt-accounts/connect/callback con el código de autorización.
 *
 * Env vars requeridas:
 *   GOOGLE_CLIENT_ID     — OAuth 2.0 Client ID (Web Application)
 *   NEXT_PUBLIC_APP_URL  — URL pública de la app (para redirect_uri)
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { buildYouTubeAuthorizeUrl, encodeYtOAuthState } from '@/lib/youtube-api';

export const dynamic = 'force-dynamic';

function envOrNull(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'missing_projectId' }, { status: 400 });
  }

  // Confirmar que el usuario es dueño del proyecto
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
  }

  const clientId = envOrNull('GOOGLE_CLIENT_ID');
  const baseUrl = envOrNull('NEXT_PUBLIC_APP_URL') ?? req.nextUrl.origin;
  if (!clientId) {
    const setupUrl = new URL('/dashboard/settings/youtube', req.url);
    setupUrl.searchParams.set('setup', 'missing_app');
    return NextResponse.redirect(setupUrl);
  }

  // CSRF state
  const csrf = crypto.randomBytes(16).toString('hex');
  const state = encodeYtOAuthState({
    csrf: `${user.id}.${csrf}`,
    projectId,
    returnTo: '/dashboard/settings/youtube',
  });

  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/yt-accounts/connect/callback`;
  const authorizeUrl = buildYouTubeAuthorizeUrl({ clientId, redirectUri, state });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set('yt_oauth_csrf', csrf, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });
  return res;
}
