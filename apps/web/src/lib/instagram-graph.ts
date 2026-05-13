/**
 * Server-side Meta Graph API helpers used by the OAuth + refresh routes.
 * Mirrors apps/worker/src/lib/instagram-graph.ts but only the bits the web
 * needs (token exchange, account discovery). Keep them in sync.
 *
 * Uses the NEW Instagram Business Login API (api.instagram.com / graph.instagram.com).
 * No Facebook Pages required — the user authorizes directly with their IG account.
 */
import 'server-only';

const GRAPH_VERSION = 'v21.0';
/** New Instagram Graph API base (replaces graph.facebook.com for IG operations) */
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
/** Instagram OAuth authorization dialog */
const IG_AUTH_BASE = `https://www.instagram.com`;
/** Instagram token exchange endpoint */
const IG_TOKEN_BASE = `https://api.instagram.com`;

/**
 * Permission scopes for the new Instagram Business Login API.
 *
 * - instagram_business_basic: read IG account profile and media
 * - instagram_business_content_publish: post media (the whole point)
 *
 * No Facebook Pages scopes needed — the new API works directly with the
 * Instagram Business / Creator account token.
 */
export const META_OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
].join(',');

export interface OAuthState {
  csrf: string;
  projectId: string;
  /** Where to send the user after a successful connect. */
  returnTo: string;
}

export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

export function decodeOAuthState(raw: string): OAuthState | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<OAuthState>;
    if (!parsed.csrf || !parsed.projectId) return null;
    return {
      csrf: String(parsed.csrf),
      projectId: String(parsed.projectId),
      returnTo: typeof parsed.returnTo === 'string' ? parsed.returnTo : '/dashboard/settings/instagram',
    };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(`${IG_AUTH_BASE}/oauth/authorize`);
  u.searchParams.set('client_id', opts.appId);
  u.searchParams.set('redirect_uri', opts.redirectUri);
  u.searchParams.set('scope', META_OAUTH_SCOPES);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('state', opts.state);
  return u.toString();
}

interface GraphErrorPayload {
  error?: { message?: string; type?: string; code?: number };
}

async function throwOnError<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: T | GraphErrorPayload;
  try {
    body = text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new Error(`Instagram API returned non-JSON: HTTP ${res.status} ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    const e = (body as GraphErrorPayload).error;
    throw new Error(
      `Instagram API error ${e?.code ?? res.status}: ${e?.message ?? `HTTP ${res.status}`}`,
    );
  }
  return body as T;
}

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: 'GET' });
  return throwOnError<T>(res);
}

// ── Token exchange ────────────────────────────────────────────────────

/**
 * Exchange the OAuth code for a short-lived Instagram user token.
 * Uses the new Instagram Business Login endpoint (POST form body).
 */
export async function exchangeCodeForUserToken(opts: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const form = new URLSearchParams();
  form.set('client_id', opts.appId);
  form.set('client_secret', opts.appSecret);
  form.set('grant_type', 'authorization_code');
  form.set('redirect_uri', opts.redirectUri);
  form.set('code', opts.code);

  const res = await fetch(`${IG_TOKEN_BASE}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await throwOnError<{ access_token: string; expires_in?: number }>(res);
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

/**
 * Exchange the short-lived token for a long-lived Instagram token (~60 days).
 * Uses graph.instagram.com (not graph.facebook.com).
 */
export async function exchangeForLongLivedUserToken(opts: {
  shortLivedToken: string;
  appId: string;
  appSecret: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_id', opts.appId);
  url.searchParams.set('client_secret', opts.appSecret);
  url.searchParams.set('access_token', opts.shortLivedToken);

  const res = await fetch(url, { method: 'GET' });
  const body = await throwOnError<{ access_token: string; expires_in: number }>(res);
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

// ── Account discovery ─────────────────────────────────────────────────

export interface DiscoveredAccount {
  /** Same as igUserId in the new Instagram Business Login API (no Pages). */
  pageId: string;
  pageName: string;
  /** The long-lived Instagram user token (used directly for publishing). */
  pageAccessToken: string;
  igUserId: string;
  igUsername: string;
}

/**
 * Resolve the authenticated user's Instagram Business / Creator account.
 *
 * New Instagram Business Login: no Facebook Pages needed. We query /me
 * directly on graph.instagram.com to get the IG user ID and username.
 */
export async function discoverPublishableAccounts(
  longLivedUserToken: string,
): Promise<DiscoveredAccount[]> {
  const me = await graphGet<{ id: string; username?: string; name?: string }>(
    '/me',
    {
      access_token: longLivedUserToken,
      fields: 'id,username,name',
    },
  );

  if (!me.id) return [];

  return [
    {
      pageId: me.id,
      pageName: me.name ?? me.username ?? me.id,
      pageAccessToken: longLivedUserToken,
      igUserId: me.id,
      igUsername: me.username ?? me.id,
    },
  ];
}
