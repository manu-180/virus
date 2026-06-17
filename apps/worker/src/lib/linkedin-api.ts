/**
 * LinkedIn API client — lado worker (publicación de videos).
 *
 * Flujo de publicación de video:
 *   1. initializeVideoUpload() → upload URLs + videoUrn + uploadToken
 *   2. uploadVideoChunks()     → PUT a cada URL presignada, colectar ETags
 *   3. finalizeVideoUpload()   → confirmar upload
 *   4. waitForVideoReady()     → poll hasta status AVAILABLE (~15-60s)
 *   5. createVideoPost()       → POST /rest/posts con el videoUrn
 *
 * Ref:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
 *   https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */

const LI_API_BASE = 'https://api.linkedin.com';
const LI_VERSION  = '202502'; // Feb 2025

function liHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization:               `Bearer ${accessToken}`,
    'LinkedIn-Version':          LI_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type':              'application/json',
  };
}

// ── Error handling ────────────────────────────────────────────────────

export interface LiApiError {
  code: string;
  message: string;
  httpStatus: number;
  terminal: boolean;
  authError: boolean;
}

const TERMINAL_LI_STATUSES = new Set([400, 403, 404, 422]);
const AUTH_LI_STATUSES     = new Set([401]);

export class LinkedInApiError extends Error {
  readonly info: LiApiError;
  constructor(info: LiApiError) {
    super(info.message);
    this.name  = 'LinkedInApiError';
    this.info  = info;
  }
}

async function liRequest<T>(
  method: string,
  url: string,
  accessToken: string,
  body?: unknown,
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(url, {
    method,
    headers: liHeaders(accessToken),
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) {
    const terminal  = TERMINAL_LI_STATUSES.has(res.status);
    const authError = AUTH_LI_STATUSES.has(res.status);
    throw new LinkedInApiError({
      code:       `LI_${res.status}`,
      message:    `LinkedIn API error ${res.status}: ${text.slice(0, 300)}`,
      httpStatus: res.status,
      terminal,
      authError,
    });
  }

  const data = text ? (JSON.parse(text) as T) : ({} as T);
  return { data, headers: res.headers };
}

// ── Video Upload — Step 1: Initialize ────────────────────────────────

export interface UploadInstruction {
  uploadUrl: string;
  firstByte: number;
  lastByte:  number;
}

export interface InitVideoUploadResult {
  videoUrn:     string;
  uploadToken:  string;
  instructions: UploadInstruction[];
}

export async function initializeVideoUpload({
  accessToken,
  personUrn,
  fileSizeBytes,
}: {
  accessToken:   string;
  personUrn:     string;
  fileSizeBytes: number;
}): Promise<InitVideoUploadResult> {
  const { data } = await liRequest<{
    value: {
      video:                string;
      uploadToken:          string;
      uploadUrlsExpireAt:   number;
      uploadInstructions:   UploadInstruction[];
    };
  }>(
    'POST',
    `${LI_API_BASE}/rest/videos?action=initializeUpload`,
    accessToken,
    {
      initializeUploadRequest: {
        owner:          personUrn,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    },
  );

  return {
    videoUrn:     data.value.video,
    uploadToken:  data.value.uploadToken,
    instructions: data.value.uploadInstructions,
  };
}

// ── Video Upload — Step 2: Upload chunks ─────────────────────────────

export async function uploadVideoChunks({
  instructions,
  fileBuffer,
}: {
  instructions: UploadInstruction[];
  fileBuffer:   Buffer;
}): Promise<string[]> {
  const etags: string[] = [];

  for (const chunk of instructions) {
    const slice = fileBuffer.subarray(chunk.firstByte, chunk.lastByte + 1);

    const res = await fetch(chunk.uploadUrl, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body:    new Uint8Array(slice),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.status.toString());
      throw new LinkedInApiError({
        code:       `LI_UPLOAD_CHUNK_${res.status}`,
        message:    `Video chunk upload failed: ${res.status} ${text.slice(0, 200)}`,
        httpStatus: res.status,
        terminal:   true,
        authError:  false,
      });
    }

    const etag = res.headers.get('etag') ?? res.headers.get('ETag') ?? '';
    etags.push(etag);
  }

  return etags;
}

// ── Video Upload — Step 3: Finalize ──────────────────────────────────

export async function finalizeVideoUpload({
  accessToken,
  videoUrn,
  uploadToken,
  etags,
}: {
  accessToken:  string;
  videoUrn:     string;
  uploadToken:  string;
  etags:        string[];
}): Promise<void> {
  await liRequest<void>(
    'POST',
    `${LI_API_BASE}/rest/videos?action=finalizeUpload`,
    accessToken,
    {
      finalizeUploadRequest: {
        video:           videoUrn,
        uploadToken,
        uploadedPartIds: etags,
      },
    },
  );
}

// ── Video Upload — Step 4: Wait for processing ───────────────────────

export async function waitForVideoReady({
  accessToken,
  videoUrn,
  timeoutMs = 120_000,
  pollMs    = 5_000,
}: {
  accessToken: string;
  videoUrn:    string;
  timeoutMs?:  number;
  pollMs?:     number;
}): Promise<void> {
  // LinkedIn video URN format: urn:li:video:D4E10AQF...
  // API endpoint: /rest/videos/{encodedUrn}
  const encodedUrn = encodeURIComponent(videoUrn);
  const deadline   = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data } = await liRequest<{ status: string }>(
      'GET',
      `${LI_API_BASE}/rest/videos/${encodedUrn}`,
      accessToken,
    );

    if (data.status === 'AVAILABLE') return;
    if (data.status === 'FAILED' || data.status === 'DELETED') {
      throw new LinkedInApiError({
        code:       'LI_VIDEO_PROCESSING_FAILED',
        message:    `Video processing failed with status: ${data.status}`,
        httpStatus: 422,
        terminal:   true,
        authError:  false,
      });
    }

    await new Promise(r => setTimeout(r, pollMs));
  }

  throw new LinkedInApiError({
    code:       'LI_VIDEO_PROCESSING_TIMEOUT',
    message:    `Video did not become AVAILABLE in ${timeoutMs / 1000}s`,
    httpStatus: 408,
    terminal:   false, // retryable
    authError:  false,
  });
}

// ── Create Post ───────────────────────────────────────────────────────

export interface CreateVideoPostResult {
  postUrn:   string;
  permalink: string | null;
}

export async function createVideoPost({
  accessToken,
  personUrn,
  videoUrn,
  commentary,
  title,
}: {
  accessToken: string;
  personUrn:   string;
  videoUrn:    string;
  commentary:  string;
  title?:      string;
}): Promise<CreateVideoPostResult> {
  const { headers } = await liRequest<void>(
    'POST',
    `${LI_API_BASE}/rest/posts`,
    accessToken,
    {
      author:       personUrn,
      commentary:   commentary.slice(0, 3000), // límite LinkedIn
      visibility:   'PUBLIC',
      distribution: {
        feedDistribution:            'MAIN_FEED',
        targetEntities:              [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          ...(title ? { title } : {}),
          id: videoUrn,
        },
      },
      lifecycleState:            'PUBLISHED',
      isReshareDisabledByAuthor: false,
    },
  );

  // La API devuelve el URN del post en el header `x-restli-id`
  const postUrn = headers.get('x-restli-id') ?? headers.get('X-RestLi-Id') ?? null;

  // Permalink: linkedin.com/feed/update/{postUrn}
  const permalink = postUrn
    ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}`
    : null;

  return { postUrn: postUrn ?? 'unknown', permalink };
}

// ── High-level: Publish Video ─────────────────────────────────────────

export interface LiPublishVideoInput {
  accessToken:  string;
  personUrn:    string;
  videoBuffer:  Buffer;
  caption:      string;
  title?:       string;
}

export interface LiPublishVideoResult {
  postUrn:   string;
  permalink: string | null;
}

export async function publishVideo(input: LiPublishVideoInput): Promise<LiPublishVideoResult> {
  const { accessToken, personUrn, videoBuffer, caption, title } = input;
  const fileSizeBytes = videoBuffer.byteLength;

  // 1. Initialize
  const { videoUrn, uploadToken, instructions } = await initializeVideoUpload({
    accessToken,
    personUrn,
    fileSizeBytes,
  });

  // 2. Upload chunks
  const etags = await uploadVideoChunks({ instructions, fileBuffer: videoBuffer });

  // 3. Finalize
  await finalizeVideoUpload({ accessToken, videoUrn, uploadToken, etags });

  // 4. Wait for processing
  await waitForVideoReady({ accessToken, videoUrn });

  // 5. Create post
  return createVideoPost({ accessToken, personUrn, videoUrn, commentary: caption, ...(title ? { title } : {}) });
}
