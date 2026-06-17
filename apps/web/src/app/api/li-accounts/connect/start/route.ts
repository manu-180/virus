/**
 * GET /api/li-accounts/connect/start?projectId=<uuid>
 *
 * Inicia el flujo OAuth de LinkedIn:
 *   1. Valida que el usuario es dueño del proyecto
 *   2. Genera un token CSRF y lo binda a la cookie de sesión
 *   3. Redirige al diálogo de autorización de LinkedIn
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import {
  buildAuthorizeUrl,
  encodeOAuthState,
} from '@/lib/linkedin-api';

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

  const clientId = envOrNull('LINKEDIN_CLIENT_ID');
  const baseUrl  = envOrNull('NEXT_PUBLIC_APP_URL') ?? req.nextUrl.origin;

  if (!clientId) {
    const setupUrl = new URL('/dashboard/settings/linkedin', req.url);
    setupUrl.searchParams.set('setup', 'missing_app');
    return NextResponse.redirect(setupUrl);
  }

  const csrf  = crypto.randomBytes(16).toString('hex');
  const state = encodeOAuthState({
    csrf:      `${user.id}.${csrf}`,
    projectId,
    returnTo:  '/dashboard/settings/linkedin',
  });

  const redirectUri   = `${baseUrl.replace(/\/$/, '')}/api/li-accounts/connect/callback`;
  const authorizeUrl  = buildAuthorizeUrl({ clientId, redirectUri, state });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set('li_oauth_csrf', csrf, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   600,
    path:     '/',
  });
  return res;
}
