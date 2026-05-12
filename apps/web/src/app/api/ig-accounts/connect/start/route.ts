/**
 * GET /api/ig-accounts/connect/start?projectId=<uuid>
 *
 * Kicks off the Meta OAuth flow:
 *   1. Validate the user owns the project
 *   2. Mint a CSRF-signed state token (binds to the user's cookie session)
 *   3. Redirect to Facebook's authorize dialog
 *
 * After the user approves, Meta redirects to /api/ig-accounts/connect/callback.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import {
  buildAuthorizeUrl,
  encodeOAuthState,
} from '@/lib/instagram-graph';

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

  // Confirm the user owns the project
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

  // Validate Meta App config
  const appId = envOrNull('META_APP_ID');
  const baseUrl = envOrNull('META_OAUTH_REDIRECT_BASE_URL') ?? envOrNull('NEXT_PUBLIC_APP_URL') ?? req.nextUrl.origin;
  if (!appId) {
    const setupUrl = new URL('/dashboard/settings/instagram', req.url);
    setupUrl.searchParams.set('setup', 'missing_app');
    return NextResponse.redirect(setupUrl);
  }

  // CSRF: bake user id + random nonce into state so we can verify on callback
  const csrf = crypto.randomBytes(16).toString('hex');
  const state = encodeOAuthState({
    csrf: `${user.id}.${csrf}`,
    projectId,
    returnTo: '/dashboard/settings/instagram',
  });

  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/ig-accounts/connect/callback`;
  const authorizeUrl = buildAuthorizeUrl({ appId, redirectUri, state });

  const res = NextResponse.redirect(authorizeUrl);
  // Persist csrf in an httpOnly cookie so the callback can compare
  res.cookies.set('ig_oauth_csrf', csrf, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 min
    path: '/',
  });
  return res;
}
