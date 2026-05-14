/**
 * Server-side Meta Graph API helpers used by the OAuth + refresh routes.
 *
 * Uses Facebook Login + Instagram Graph API — the standard approach used by
 * Buffer, Later, Metricool. The user authenticates with their Facebook
 * account, we walk their Pages to find the ones linked to an Instagram
 * Business/Creator account, and we publish via `graph.facebook.com` using
 * the long-lived Page access token.
 *
 * Why not the new Instagram Business Login API? It's still gated by Meta's
 * dev-mode tester model and the UI to add testers is broken at the time
 * of writing. The Facebook Login path is mature, well documented, and the
 * same one every third-party scheduler uses.
 *
 * Mirrors apps/worker/src/lib/instagram-graph.ts — keep them in sync.
 */
import 'server-only';

const GRAPH_VERSION = 'v21.0';
/** Facebook Graph API base. Used for both Pages discovery and IG publishing. */
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
/** Facebook Login OAuth dialog (user-facing). */
const FB_LOGIN_BASE = `https://www.facebook.com/${GRAPH_VERSION}`;

/**
 * Permission scopes for Facebook Login + Instagram Graph publishing.
 *
 * - `instagram_basic`: read IG account profile and media
 * - `instagram_content_publish`: post media (the whole point)
 * - `pages_show_list`: enumerate the user's Facebook Pages
 * - `pages_read_engagement`: read page metadata (incl. linked IG account)
 * - `business_management`: required when the page/IG lives inside a Meta
 *   Business Portfolio (the modern default for any new IG Business setup)
 */
export const META_OAUTH_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

// ── State (CSRF) ──────────────────────────────────────────────────────

export interface OAuthState {
  csrf: string;
  projectId: string;
  /** Where to send the user after a successful connect. */
  returnTo: string;
}

/** Encode the OAuth state as base64url JSON. */
export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

/** Decode an OAuth state string, returning `null` on any malformed input. */
export function decodeOAuthState(raw: string): OAuthState | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<OAuthState>;
    if (!parsed.csrf || !parsed.projectId) return null;
    return {
      csrf: String(parsed.csrf),
      projectId: String(parsed.projectId),
      returnTo:
        typeof parsed.returnTo === 'string'
          ? parsed.returnTo
          : '/dashboard/settings/instagram',
    };
  } catch {
    return null;
  }
}

// ── Authorize URL ─────────────────────────────────────────────────────

/**
 * Build the Facebook Login OAuth dialog URL.
 *
 * `auth_type=rerequest` forces Facebook to re-show the permissions screen
 * even if the user previously denied a scope — important when a user comes
 * back to reconnect after their token expired or after we added new scopes.
 */
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
  // Re-prompt for scopes if the user previously declined any.
  u.searchParams.set('auth_type', 'rerequest');
  return u.toString();
}

// ── HTTP helpers ──────────────────────────────────────────────────────

interface GraphErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/** Codes that almost always indicate a missing/invalid scope. */
const SCOPE_ERROR_CODES = new Set<number>([10, 200, 294, 4]);
/** Codes that indicate an invalid or expired access token. */
const TOKEN_ERROR_CODES = new Set<number>([102, 190, 459, 463, 467]);

export class MetaGraphError extends Error {
  readonly httpStatus: number;
  readonly metaCode: number | null;
  readonly kind: 'network' | 'parse' | 'scope' | 'token' | 'business' | 'unknown';
  constructor(
    message: string,
    opts: {
      httpStatus: number;
      metaCode?: number | null;
      kind: MetaGraphError['kind'];
    },
  ) {
    super(message);
    this.name = 'MetaGraphError';
    this.httpStatus = opts.httpStatus;
    this.metaCode = opts.metaCode ?? null;
    this.kind = opts.kind;
  }
}

function classifyGraphError(metaCode: number | undefined): MetaGraphError['kind'] {
  if (metaCode === undefined) return 'unknown';
  if (SCOPE_ERROR_CODES.has(metaCode)) return 'scope';
  if (TOKEN_ERROR_CODES.has(metaCode)) return 'token';
  return 'business';
}

/**
 * Low-level fetch wrapper for Graph API calls.
 * - 15s timeout via AbortController
 * - Distinguishes network / parse / scope / token / business errors
 */
async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', signal: controller.signal });
  } catch (err) {
    throw new MetaGraphError(
      err instanceof Error ? err.message : 'network failure',
      { httpStatus: 0, kind: 'network' },
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: T | GraphErrorPayload;
  try {
    body = text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new MetaGraphError(
      `non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
      { httpStatus: res.status, kind: 'parse' },
    );
  }

  if (!res.ok) {
    const e = (body as GraphErrorPayload).error ?? {};
    const kind = classifyGraphError(e.code);
    const friendlyMessage =
      kind === 'scope'
        ? `Permisos insuficientes: ${e.message ?? 'falta autorizar scopes requeridos'} (code=${e.code ?? '?'})`
        : (e.message ?? `HTTP ${res.status}`);
    throw new MetaGraphError(friendlyMessage, {
      httpStatus: res.status,
      metaCode: e.code ?? null,
      kind,
    });
  }

  return body as T;
}

// ── Token exchange ────────────────────────────────────────────────────

export interface TokenExchangeResult {
  accessToken: string;
  /** Seconds until expiry. Long-lived user tokens last ~60 days. */
  expiresIn: number;
}

/**
 * Exchange the OAuth `code` (from the callback redirect) for a short-lived
 * user access token. Facebook accepts GET with query-string params here.
 */
export async function exchangeCodeForUserToken(opts: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}): Promise<TokenExchangeResult> {
  const body = await graphGet<{ access_token: string; expires_in?: number }>(
    '/oauth/access_token',
    {
      client_id: opts.appId,
      client_secret: opts.appSecret,
      redirect_uri: opts.redirectUri,
      code: opts.code,
    },
  );
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? 3600,
  };
}

/**
 * Exchange a short-lived user token for a long-lived (~60 day) user token.
 * The long-lived token is what we use to derive long-lived Page tokens.
 */
export async function exchangeForLongLivedUserToken(opts: {
  shortLivedToken: string;
  appId: string;
  appSecret: string;
}): Promise<TokenExchangeResult> {
  const body = await graphGet<{ access_token: string; expires_in?: number }>(
    '/oauth/access_token',
    {
      grant_type: 'fb_exchange_token',
      client_id: opts.appId,
      client_secret: opts.appSecret,
      fb_exchange_token: opts.shortLivedToken,
    },
  );
  return {
    accessToken: body.access_token,
    // Long-lived tokens occasionally come back without `expires_in` (treated
    // as "never expires" by Meta — but we cap at 60 days for safety).
    expiresIn: body.expires_in ?? 60 * 24 * 3600,
  };
}

// ── Account discovery ─────────────────────────────────────────────────

export interface DiscoveredAccount {
  /** Facebook Page ID. */
  pageId: string;
  /** Human-readable Page name. */
  pageName: string;
  /**
   * Long-lived Page access token. Page tokens derived from a long-lived
   * user token are themselves long-lived (effectively no expiry as long as
   * the user token remains valid). This is what we store for publishing.
   */
  pageAccessToken: string;
  /** Instagram Business/Creator user ID linked to the page. */
  igUserId: string;
  /** Instagram @handle. */
  igUsername: string;
}

interface PagesListResponse {
  data?: Array<{ id: string; name: string; access_token: string }>;
}

interface PageDetailResponse {
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  };
}

/**
 * Discover every Instagram Business/Creator account publishable by the
 * authenticated user.
 *
 * Flow:
 *   1. Walk `/me/accounts` (FB Pages owned/managed by the user).
 *   2. For each page, query its `instagram_business_account` field in a
 *      single call (cheap — Meta inlines the IG sub-object).
 *   3. Skip pages with no linked IG; collect the rest.
 *
 * If a single page query fails (deleted page, permissions glitch, etc.) we
 * log a warning and continue — one broken page must not abort the whole
 * OAuth flow.
 */
export async function discoverPublishableAccounts(
  longLivedUserToken: string,
): Promise<DiscoveredAccount[]> {
  const pages = await graphGet<PagesListResponse>('/me/accounts', {
    access_token: longLivedUserToken,
    fields: 'id,name,access_token',
    limit: '100',
  });

  const out: DiscoveredAccount[] = [];
  for (const page of pages.data ?? []) {
    try {
      const detail = await graphGet<PageDetailResponse>(`/${page.id}`, {
        access_token: page.access_token,
        // Sub-object selection inlines the IG account in one call.
        fields:
          'instagram_business_account{id,username,name,profile_picture_url}',
      });
      const ig = detail.instagram_business_account;
      if (!ig?.id) continue; // page has no IG linked — skip
      out.push({
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        igUserId: ig.id,
        igUsername: ig.username ?? ig.name ?? ig.id,
      });
    } catch (err) {
      console.warn(
        `[ig-oauth] could not resolve IG for page ${page.id} (${page.name}):`,
        err instanceof Error ? err.message : err,
      );
      // Continue with the rest — partial failure is preferable to total abort.
    }
  }
  return out;
}
