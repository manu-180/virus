/**
 * Meta Graph API — Instagram Content Publishing
 *
 * Official API for posting carousels (and single media) to Instagram
 * Business / Creator accounts. Replaces the brittle instagrapi private-API
 * client for accounts onboarded via OAuth.
 *
 * Reference:
 *   https://developers.facebook.com/docs/instagram-platform/content-publishing
 *
 * Carousel publishing is a 3-step flow:
 *   1. Create a media container per image (with `is_carousel_item=true`)
 *   2. Create a CAROUSEL parent container referencing the child IDs
 *   3. Publish the parent container
 *
 * Each container has a `status_code` that goes through:
 *   IN_PROGRESS → FINISHED (ready to publish) or ERROR / EXPIRED
 *
 * We poll the parent container until FINISHED before calling /media_publish.
 *
 * Errors are mapped to a stable code set so the caller can decide
 * `terminal` vs `retryable` without parsing Meta's free-form messages.
 */

const GRAPH_VERSION = 'v21.0';
/** New Instagram Graph API — replaces graph.facebook.com for IG Business operations */
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

// ── Types ──────────────────────────────────────────────────────────────

export interface GraphPublishInput {
  /** Instagram Business Account ID (numeric, from `me/accounts` → instagram_business_account.id) */
  igUserId: string;
  /** Long-lived page access token */
  accessToken: string;
  /** 2-10 publicly fetchable HTTPS image URLs. Order = slide order. */
  imageUrls: string[];
  /** Caption text (≤2200 chars). Hashtags included. */
  caption: string;
}

export interface GraphPublishResult {
  /** Instagram media id (e.g. "17912345678901234") */
  mediaId: string;
  /** Permalink like https://www.instagram.com/p/CODE/ — fetched in a follow-up call */
  permalink: string | null;
}

/**
 * Errors that mean "stop retrying, surface to the user".
 * Anything else gets retried by the caller (Inngest).
 */
const TERMINAL_GRAPH_ERROR_CODES = new Set<number>([
  // Authentication / permission — token bad or scope missing
  102, 190, 200, 294, 459, 463, 467,
  // Content errors — image format, size, etc.
  9007, 36000, 36001, 36002, 36003,
]);

/** Token-validity errors that should flip the account to `challenge`/disabled. */
const AUTH_ERROR_CODES = new Set<number>([102, 190, 200, 459, 463, 467]);

export interface GraphApiError {
  code: string;
  message: string;
  httpStatus: number;
  metaCode?: number;
  terminal: boolean;
  authError: boolean;
}

export class InstagramGraphError extends Error {
  readonly info: GraphApiError;
  constructor(info: GraphApiError) {
    super(info.message);
    this.name = 'InstagramGraphError';
    this.info = info;
  }
}

// ── HTTP helper ─────────────────────────────────────────────────────────

interface GraphErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

async function graphCall<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string | undefined>,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {},
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);

  // For POST we still pass params as query-string — Meta accepts either, and
  // query-string is easier to log/redact.
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { method, signal: controller.signal });
  } catch (err) {
    throw new InstagramGraphError({
      code: 'network_error',
      message: err instanceof Error ? err.message : 'network failure',
      httpStatus: 0,
      terminal: false,
      authError: false,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: T | GraphErrorPayload;
  try {
    body = text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new InstagramGraphError({
      code: 'invalid_response',
      message: `non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
      httpStatus: res.status,
      terminal: res.status >= 400 && res.status < 500,
      authError: false,
    });
  }

  if (!res.ok) {
    const e = (body as GraphErrorPayload).error ?? {};
    const metaCode = e.code;
    const info: GraphApiError = {
      code: e.type ?? 'graph_error',
      message: e.message ?? `HTTP ${res.status}`,
      httpStatus: res.status,
      terminal: metaCode !== undefined && TERMINAL_GRAPH_ERROR_CODES.has(metaCode),
      authError: metaCode !== undefined && AUTH_ERROR_CODES.has(metaCode),
    };
    if (metaCode !== undefined) info.metaCode = metaCode;
    throw new InstagramGraphError(info);
  }

  return body as T;
}

// ── Token operations ──────────────────────────────────────────────────

export interface ExchangeShortLivedResult {
  accessToken: string;
  /** Seconds until expiry, as returned by Meta. */
  expiresIn: number;
}

/**
 * Exchange a short-lived USER access token (from the OAuth code exchange)
 * for a long-lived one. The long-lived user token lasts ~60 days.
 *
 * Then call {@link getPagesWithIgAccounts} with it.
 */
export async function exchangeForLongLivedUserToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
): Promise<ExchangeShortLivedResult> {
  // New Instagram Business Login: long-lived token via graph.instagram.com
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('access_token', shortLivedToken);
  const res = await fetch(url);
  const body = await res.json() as { access_token: string; expires_in: number };
  if (!res.ok) throw new InstagramGraphError({
    code: 'token_exchange_failed',
    message: JSON.stringify(body),
    httpStatus: res.status,
    terminal: true,
    authError: true,
  });
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

/**
 * Exchange the OAuth `code` (from the redirect) for a short-lived user token.
 * New Instagram Business Login: POST form body to api.instagram.com.
 */
export async function exchangeCodeForUserToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
): Promise<ExchangeShortLivedResult> {
  const form = new URLSearchParams();
  form.set('client_id', appId);
  form.set('client_secret', appSecret);
  form.set('grant_type', 'authorization_code');
  form.set('redirect_uri', redirectUri);
  form.set('code', code);
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await res.json() as { access_token: string; expires_in?: number };
  if (!res.ok) throw new InstagramGraphError({
    code: 'code_exchange_failed',
    message: JSON.stringify(body),
    httpStatus: res.status,
    terminal: true,
    authError: true,
  });
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

export interface PageWithIgAccount {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId: string | null;
  igUsername: string | null;
}

/**
 * Fetch the user's pages and resolve each to its linked Instagram Business
 * account. Returns one entry per page (even if it has no IG). The caller
 * picks the right one (usually the page linked to apex.stack).
 *
 * Page access tokens generated from a long-lived user token are themselves
 * long-lived (effectively no expiry as long as the user token is valid).
 */
export async function getPagesWithIgAccounts(
  longLivedUserToken: string,
): Promise<PageWithIgAccount[]> {
  const pagesRes = await graphCall<{
    data: Array<{ id: string; name: string; access_token: string }>;
  }>('GET', '/me/accounts', {
    access_token: longLivedUserToken,
    fields: 'id,name,access_token',
    limit: '50',
  });

  const result: PageWithIgAccount[] = [];
  for (const page of pagesRes.data ?? []) {
    let igUserId: string | null = null;
    let igUsername: string | null = null;
    try {
      const pageRes = await graphCall<{
        instagram_business_account?: { id: string };
      }>('GET', `/${page.id}`, {
        access_token: page.access_token,
        fields: 'instagram_business_account',
      });
      const igId = pageRes.instagram_business_account?.id;
      if (igId) {
        igUserId = igId;
        // Fetch the IG username (cheap, single call)
        try {
          const igRes = await graphCall<{ username: string }>(
            'GET',
            `/${igId}`,
            {
              access_token: page.access_token,
              fields: 'username',
            },
          );
          igUsername = igRes.username;
        } catch {
          // Username fetch failed — leave null but keep the IG ID
        }
      }
    } catch {
      // page query failed — leave both null
    }
    result.push({
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      igUserId,
      igUsername,
    });
  }
  return result;
}

// ── Container + publish flow ──────────────────────────────────────────

interface ContainerStatus {
  status_code: 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';
}

/**
 * Create a single carousel child container. Returns the container ID.
 */
async function createChildContainer(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
): Promise<string> {
  const res = await graphCall<{ id: string }>(
    'POST',
    `/${igUserId}/media`,
    {
      image_url: imageUrl,
      is_carousel_item: 'true',
      access_token: accessToken,
    },
  );
  return res.id;
}

/**
 * Create the parent CAROUSEL container.
 */
async function createCarouselContainer(
  igUserId: string,
  accessToken: string,
  childIds: string[],
  caption: string,
): Promise<string> {
  const res = await graphCall<{ id: string }>(
    'POST',
    `/${igUserId}/media`,
    {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: accessToken,
    },
  );
  return res.id;
}

/**
 * Poll until the parent container reaches FINISHED. Throws on ERROR / EXPIRED
 * or if we exceed maxWaitMs.
 *
 * Meta typically takes 5-30s to process a carousel. We poll every 3s.
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  { maxWaitMs = 90_000, pollIntervalMs = 3_000 }: { maxWaitMs?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  let lastStatus = 'IN_PROGRESS';
  while (Date.now() < deadline) {
    const res = await graphCall<ContainerStatus>(
      'GET',
      `/${containerId}`,
      { fields: 'status_code', access_token: accessToken },
    );
    lastStatus = res.status_code;
    if (lastStatus === 'FINISHED') return;
    if (lastStatus === 'ERROR' || lastStatus === 'EXPIRED') {
      throw new InstagramGraphError({
        code: 'container_processing_failed',
        message: `container ${containerId} status=${lastStatus}`,
        httpStatus: 502,
        terminal: true,
        authError: false,
      });
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new InstagramGraphError({
    code: 'container_timeout',
    message: `container ${containerId} stuck at ${lastStatus} after ${maxWaitMs}ms`,
    httpStatus: 504,
    terminal: false,
    authError: false,
  });
}

async function publishContainer(
  igUserId: string,
  accessToken: string,
  containerId: string,
): Promise<string> {
  const res = await graphCall<{ id: string }>(
    'POST',
    `/${igUserId}/media_publish`,
    { creation_id: containerId, access_token: accessToken },
  );
  return res.id;
}

async function getPermalink(
  mediaId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await graphCall<{ permalink: string }>('GET', `/${mediaId}`, {
      fields: 'permalink',
      access_token: accessToken,
    });
    return res.permalink ?? null;
  } catch {
    return null;
  }
}

/**
 * Run the full carousel publish flow end-to-end. Idempotency lives at the
 * Inngest function layer (one Inngest run per ig_publications row).
 */
export async function publishCarousel(
  input: GraphPublishInput,
): Promise<GraphPublishResult> {
  if (input.imageUrls.length < 2 || input.imageUrls.length > 10) {
    throw new InstagramGraphError({
      code: 'invalid_payload',
      message: `carousels need 2-10 images, got ${input.imageUrls.length}`,
      httpStatus: 400,
      terminal: true,
      authError: false,
    });
  }
  if (!input.caption.trim()) {
    throw new InstagramGraphError({
      code: 'invalid_payload',
      message: 'caption is required',
      httpStatus: 400,
      terminal: true,
      authError: false,
    });
  }
  if (input.caption.length > 2200) {
    throw new InstagramGraphError({
      code: 'invalid_payload',
      message: `caption is ${input.caption.length} chars (max 2200)`,
      httpStatus: 400,
      terminal: true,
      authError: false,
    });
  }

  // 1. Create all child containers (sequentially so we don't burst Meta)
  const childIds: string[] = [];
  for (const url of input.imageUrls) {
    const id = await createChildContainer(input.igUserId, input.accessToken, url);
    childIds.push(id);
  }

  // 2. Create the parent carousel container
  const parentId = await createCarouselContainer(
    input.igUserId,
    input.accessToken,
    childIds,
    input.caption,
  );

  // 3. Wait for the parent to be FINISHED
  await waitForContainerReady(parentId, input.accessToken);

  // 4. Publish
  const mediaId = await publishContainer(input.igUserId, input.accessToken, parentId);

  // 5. Fetch permalink (best-effort)
  const permalink = await getPermalink(mediaId, input.accessToken);

  return { mediaId, permalink };
}

// ── Debug introspection (used by token-refresh job) ───────────────────

export interface DebugTokenInfo {
  isValid: boolean;
  appId: string;
  type: string;
  expiresAt: Date | null;
  scopes: string[];
}

/**
 * Inspect a token via /debug_token. Used by the refresh cron to detect
 * expired/invalid tokens early so we can warn the user.
 */
export async function debugToken(
  inputToken: string,
  appAccessToken: string,
): Promise<DebugTokenInfo> {
  const res = await graphCall<{
    data: {
      is_valid: boolean;
      app_id: string;
      type: string;
      expires_at: number; // unix seconds, 0 = never
      scopes?: string[];
    };
  }>('GET', '/debug_token', {
    input_token: inputToken,
    access_token: appAccessToken,
  });
  const d = res.data;
  return {
    isValid: d.is_valid,
    appId: d.app_id,
    type: d.type,
    expiresAt: d.expires_at && d.expires_at > 0 ? new Date(d.expires_at * 1000) : null,
    scopes: d.scopes ?? [],
  };
}

/**
 * App access token = "{app_id}|{app_secret}". Cheap to compute, no network.
 * Used for /debug_token calls.
 */
export function buildAppAccessToken(appId: string, appSecret: string): string {
  return `${appId}|${appSecret}`;
}
