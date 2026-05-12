/**
 * Server-side Meta Graph API helpers used by the OAuth + refresh routes.
 * Mirrors apps/worker/src/lib/instagram-graph.ts but only the bits the web
 * needs (token exchange, page enumeration). Keep them in sync.
 */
import 'server-only';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FB_LOGIN_BASE = `https://www.facebook.com/${GRAPH_VERSION}`;

/**
 * Permission scopes we ask for during OAuth.
 *
 * - instagram_basic: read IG account profile
 * - instagram_content_publish: post media (the whole point)
 * - pages_show_list / pages_read_engagement: enumerate the user's pages
 *   to find the one linked to the IG Business account
 * - business_management: optional, helps when account is inside a Meta
 *   Business portfolio (the modern default)
 */
export const META_OAUTH_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
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
  const u = new URL(`${FB_LOGIN_BASE}/dialog/oauth`);
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

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  let body: T | GraphErrorPayload;
  try {
    body = text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new Error(`Meta returned non-JSON: HTTP ${res.status} ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    const e = (body as GraphErrorPayload).error;
    throw new Error(
      `Meta error ${e?.code ?? res.status}: ${e?.message ?? `HTTP ${res.status}`}`,
    );
  }
  return body as T;
}

// ── Token exchange ────────────────────────────────────────────────────

export async function exchangeCodeForUserToken(opts: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const body = await graphGet<{ access_token: string; expires_in?: number }>(
    '/oauth/access_token',
    {
      client_id: opts.appId,
      client_secret: opts.appSecret,
      redirect_uri: opts.redirectUri,
      code: opts.code,
    },
  );
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

export async function exchangeForLongLivedUserToken(opts: {
  shortLivedToken: string;
  appId: string;
  appSecret: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const body = await graphGet<{ access_token: string; expires_in: number }>(
    '/oauth/access_token',
    {
      grant_type: 'fb_exchange_token',
      client_id: opts.appId,
      client_secret: opts.appSecret,
      fb_exchange_token: opts.shortLivedToken,
    },
  );
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

// ── Page + IG discovery ───────────────────────────────────────────────

export interface DiscoveredAccount {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId: string;
  igUsername: string;
}

/**
 * Walk the user's pages, find any with a linked Instagram Business account,
 * and return the ones we can actually publish to. The page access token in
 * each row is long-lived (no expiry as long as the user token is valid).
 */
export async function discoverPublishableAccounts(
  longLivedUserToken: string,
): Promise<DiscoveredAccount[]> {
  const pagesRes = await graphGet<{
    data: Array<{ id: string; name: string; access_token: string }>;
  }>('/me/accounts', {
    access_token: longLivedUserToken,
    fields: 'id,name,access_token',
    limit: '50',
  });

  const out: DiscoveredAccount[] = [];
  for (const page of pagesRes.data ?? []) {
    try {
      const pageRes = await graphGet<{
        instagram_business_account?: { id: string };
      }>(`/${page.id}`, {
        access_token: page.access_token,
        fields: 'instagram_business_account',
      });
      const igId = pageRes.instagram_business_account?.id;
      if (!igId) continue;

      let username = `ig_${igId}`;
      try {
        const igRes = await graphGet<{ username: string }>(`/${igId}`, {
          access_token: page.access_token,
          fields: 'username',
        });
        username = igRes.username;
      } catch {
        // Keep the fallback username
      }

      out.push({
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        igUserId: igId,
        igUsername: username,
      });
    } catch {
      // skip pages we can't query
    }
  }
  return out;
}
