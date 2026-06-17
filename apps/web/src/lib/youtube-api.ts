/**
 * Server-side Google OAuth + YouTube Data API helpers.
 * Usados por los routes /api/yt-accounts/connect/*.
 */
import 'server-only';

export const YT_OAUTH_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ── State (CSRF) — mismo patrón que instagram-graph.ts ───────────────

export interface YtOAuthState {
  csrf: string;
  projectId: string;
  returnTo: string;
}

export function encodeYtOAuthState(state: YtOAuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

export function decodeYtOAuthState(raw: string): YtOAuthState | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<YtOAuthState>;
    if (!parsed.csrf || !parsed.projectId) return null;
    return {
      csrf: String(parsed.csrf),
      projectId: String(parsed.projectId),
      returnTo: typeof parsed.returnTo === 'string' ? parsed.returnTo : '/dashboard/settings/youtube',
    };
  } catch {
    return null;
  }
}

// ── Authorize URL ─────────────────────────────────────────────────────

/**
 * Construye la URL de autorización de Google OAuth 2.0.
 * - `access_type=offline` → Google devuelve un refresh_token
 * - `prompt=consent`      → fuerza el diálogo aunque el usuario ya autorizó
 *   (necesario para siempre obtener un nuevo refresh_token en reconexiones)
 */
export function buildYouTubeAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(GOOGLE_AUTH_BASE);
  u.searchParams.set('client_id', opts.clientId);
  u.searchParams.set('redirect_uri', opts.redirectUri);
  u.searchParams.set('scope', YT_OAUTH_SCOPE);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', opts.state);
  return u.toString();
}

// ── Token exchange ────────────────────────────────────────────────────

export interface YtTokenResult {
  accessToken: string;
  refreshToken: string;
  /** Segundos hasta expiración (normalmente 3600). */
  expiresIn: number;
}

export class YtOAuthError extends Error {
  readonly httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = 'YtOAuthError';
    this.httpStatus = httpStatus;
  }
}

/** Intercambia el código de autorización por access_token + refresh_token. */
export async function exchangeCodeForYtTokens(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<YtTokenResult> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new YtOAuthError(`Token exchange failed (${res.status}): ${text.slice(0, 200)}`, res.status);
  }

  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!json.refresh_token) {
    throw new YtOAuthError(
      'Google no devolvió un refresh_token. ' +
      'Asegurate de que el usuario revocó el acceso previo en myaccount.google.com/permissions ' +
      'o usá prompt=consent (ya está configurado).',
      200,
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
  };
}

// ── Channel discovery ─────────────────────────────────────────────────

export interface YtChannelInfo {
  channelId: string;
  channelTitle: string;
}

/** Obtiene el canal de YouTube del usuario autenticado. */
export async function getMyYouTubeChannel(accessToken: string): Promise<YtChannelInfo> {
  const url = new URL(`${YT_API_BASE}/channels`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('mine', 'true');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new YtOAuthError(`Channel discovery failed (${res.status}): ${text.slice(0, 200)}`, res.status);
  }

  const json = JSON.parse(text) as {
    items?: Array<{ id: string; snippet: { title: string } }>;
  };

  const channel = json.items?.[0];
  if (!channel) {
    throw new YtOAuthError('La cuenta de Google no tiene ningún canal de YouTube asociado.', 200);
  }

  return {
    channelId: channel.id,
    channelTitle: channel.snippet.title,
  };
}
