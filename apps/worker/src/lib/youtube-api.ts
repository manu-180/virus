/**
 * YouTube Data API v3 client — lado worker (publicación de Shorts).
 *
 * Flujo de publicación:
 *   1. refreshYtAccessToken()   — si el access_token expiró, renovarlo con el refresh_token
 *   2. initYouTubeUpload()      — obtener la URL de upload resumable (POST /upload/…?uploadType=resumable)
 *   3. uploadVideoToYouTube()   — PUT del video binario a la URL de upload
 *
 * YouTube Shorts: video vertical (9:16), duración ≤ 60 s, #Shorts en título o descripción.
 * Nuestros Reels (1080×1920, ~30-40 s) cumplen los tres requisitos.
 *
 * Refs:
 *   https://developers.google.com/youtube/v3/docs/videos/insert
 *   https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
 */

const YT_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ── Error handling ────────────────────────────────────────────────────

export interface YtApiErrorInfo {
  code: string;
  message: string;
  httpStatus: number;
  terminal: boolean;
  authError: boolean;
}

export class YouTubeApiError extends Error {
  readonly info: YtApiErrorInfo;
  constructor(info: YtApiErrorInfo) {
    super(info.message);
    this.name = 'YouTubeApiError';
    this.info = info;
  }
}

const TERMINAL_YT_STATUSES = new Set([400, 403, 404, 422]);
const AUTH_YT_STATUSES = new Set([401]);

function makeYtError(status: number, message: string): YouTubeApiError {
  return new YouTubeApiError({
    code: `YT_${status}`,
    message,
    httpStatus: status,
    terminal: TERMINAL_YT_STATUSES.has(status),
    authError: AUTH_YT_STATUSES.has(status),
  });
}

// ── Token refresh ─────────────────────────────────────────────────────

export interface RefreshedYtToken {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Renueva el access_token de Google usando el refresh_token almacenado.
 * Los access_tokens de YouTube expiran en ~1 hora.
 */
export async function refreshYtAccessToken({
  refreshToken,
  clientId,
  clientSecret,
}: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<RefreshedYtToken> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw makeYtError(res.status, `Token refresh failed: ${text.slice(0, 200)}`);
  }

  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

// ── Resumable upload — Step 1: Initialize ────────────────────────────

interface YtSnippet {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
}

interface YtStatus {
  privacyStatus: 'public' | 'private' | 'unlisted';
  selfDeclaredMadeForKids: boolean;
}

/**
 * Inicializa una sesión de upload resumable y devuelve la URL de upload.
 * La URL es válida por 7 días; en la práctica la usamos en el mismo step.
 */
async function initYouTubeUpload({
  accessToken,
  fileSizeBytes,
  snippet,
  status,
}: {
  accessToken: string;
  fileSizeBytes: number;
  snippet: YtSnippet;
  status: YtStatus;
}): Promise<string> {
  const url = `${YT_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(fileSizeBytes),
    },
    body: JSON.stringify({ snippet, status }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw makeYtError(res.status, `Upload init failed: ${text.slice(0, 200)}`);
  }

  const uploadUrl = res.headers.get('location');
  if (!uploadUrl) {
    throw new YouTubeApiError({
      code: 'YT_INIT_NO_LOCATION',
      message: 'YouTube no devolvió Location header tras init de upload',
      httpStatus: 200,
      terminal: true,
      authError: false,
    });
  }
  return uploadUrl;
}

// ── Resumable upload — Step 2: Upload bytes ───────────────────────────

async function uploadVideoBytes(
  uploadUrl: string,
  videoBuffer: Buffer,
): Promise<{ id: string }> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoBuffer.byteLength),
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!res.ok) {
    const text = await res.text();
    throw makeYtError(res.status, `Video upload failed: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { id?: string };
  if (!data.id) {
    throw new YouTubeApiError({
      code: 'YT_UPLOAD_NO_ID',
      message: 'YouTube no devolvió el video ID tras el upload',
      httpStatus: 200,
      terminal: true,
      authError: false,
    });
  }
  return { id: data.id };
}

// ── High-level: Publish Short ─────────────────────────────────────────

export interface PublishYtShortInput {
  accessToken:  string;
  videoBuffer:  Buffer;
  title:        string;
  description:  string;
}

export interface PublishYtShortResult {
  videoId:   string;
  permalink: string;
}

/**
 * Publica un video vertical como YouTube Short.
 *
 * Agrega `#Shorts` al título y descripción si no están presentes —
 * esta es la señal que YouTube usa para clasificar el video como Short
 * (junto con formato 9:16 y duración ≤ 60 s).
 */
export async function publishYouTubeShort(
  input: PublishYtShortInput,
): Promise<PublishYtShortResult> {
  const { accessToken, videoBuffer, title, description } = input;

  const ytTitle = title.includes('#Shorts') ? title : `${title} #Shorts`;
  const ytDescription = description.includes('#Shorts')
    ? description
    : `${description}\n\n#Shorts`;

  const uploadUrl = await initYouTubeUpload({
    accessToken,
    fileSizeBytes: videoBuffer.byteLength,
    snippet: {
      title: ytTitle,
      description: ytDescription,
      tags: ['Shorts', 'WebDesign', 'APEX', 'desarrollo web', 'landing page'],
      categoryId: '28', // Science & Technology
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
    },
  });

  const { id: videoId } = await uploadVideoBytes(uploadUrl, videoBuffer);

  return {
    videoId,
    permalink: `https://www.youtube.com/shorts/${videoId}`,
  };
}
