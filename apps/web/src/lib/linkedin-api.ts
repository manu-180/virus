/**
 * LinkedIn OAuth 2.0 helpers — lado web (OAuth start/callback).
 *
 * Flujo:
 *   1. buildAuthorizeUrl()  → redirigir al usuario a LinkedIn
 *   2. exchangeCodeForToken() → code → access_token + refresh_token
 *   3. getLinkedInProfile() → person URN + nombre
 *
 * Scopes necesarios:
 *   openid, profile, w_member_social, offline_access
 *
 * LinkedIn no soporta `refresh_token` fuera de partners, pero
 * incluimos `offline_access` para el caso en que lo habiliten.
 * El access_token dura 60 días.
 */
import 'server-only';

export const LI_OAUTH_SCOPES = [
  'openid',
  'profile',
  'w_member_social',
  'offline_access',
].join(' ');

const LI_OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const LI_API_BASE   = 'https://api.linkedin.com';
const LI_VERSION    = '202502'; // Feb 2025 — versión estable

// ── State (CSRF) ─────────────────────────────────────────────────────

export interface LiOAuthState {
  csrf: string;
  projectId: string;
  returnTo: string;
}

export function encodeOAuthState(state: LiOAuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

export function decodeOAuthState(raw: string): LiOAuthState | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<LiOAuthState>;
    if (!parsed.csrf || !parsed.projectId || !parsed.returnTo) return null;
    return parsed as LiOAuthState;
  } catch {
    return null;
  }
}

// ── Authorization URL ─────────────────────────────────────────────────

export function buildAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`${LI_OAUTH_BASE}/authorization`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', LI_OAUTH_SCOPES);
  url.searchParams.set('state', state);
  return url.toString();
}

// ── Token Exchange ────────────────────────────────────────────────────

export interface LiTokenResult {
  accessToken: string;
  /** Segundos hasta expiración (normalmente 5183999 ≈ 60 días). */
  expiresIn: number;
  refreshToken: string | null;
  refreshTokenExpiresIn: number | null;
  scope: string;
}

export async function exchangeCodeForToken({
  code,
  clientId,
  clientSecret,
  redirectUri,
}: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<LiTokenResult> {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${LI_OAUTH_BASE}/accessToken`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`linkedin_token_exchange_failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = await res.json() as {
    access_token:              string;
    expires_in:                number;
    refresh_token?:            string;
    refresh_token_expires_in?: number;
    scope:                     string;
  };

  return {
    accessToken:             json.access_token,
    expiresIn:               json.expires_in,
    refreshToken:            json.refresh_token ?? null,
    refreshTokenExpiresIn:   json.refresh_token_expires_in ?? null,
    scope:                   json.scope,
  };
}

// ── Profile ───────────────────────────────────────────────────────────

export interface LiProfile {
  /** Ej: "urn:li:person:ABC123" */
  personUrn: string;
  /** Nombre y apellido del usuario. */
  name: string;
  email: string | null;
}

export async function getLinkedInProfile(accessToken: string): Promise<LiProfile> {
  const res = await fetch(`${LI_API_BASE}/v2/userinfo`, {
    headers: {
      Authorization:                `Bearer ${accessToken}`,
      'LinkedIn-Version':           LI_VERSION,
      'X-Restli-Protocol-Version':  '2.0.0',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`linkedin_profile_failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = await res.json() as {
    sub:    string;
    name?:  string;
    email?: string;
  };

  // `sub` devuelve el person ID numérico (sin el prefijo URN en OpenID Connect).
  // LinkedIn lo documenta como el URN completo en algunos endpoints y como ID
  // numérico en otros. Normalizamos siempre a URN completo.
  const personUrn = json.sub.startsWith('urn:li:person:')
    ? json.sub
    : `urn:li:person:${json.sub}`;

  return {
    personUrn,
    name:  json.name ?? 'LinkedIn User',
    email: json.email ?? null,
  };
}
