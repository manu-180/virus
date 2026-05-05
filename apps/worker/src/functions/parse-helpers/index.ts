import { getAdminClient, PROJECT_FILES_BUCKET } from '../../lib/supabase.js';
import type {
  ProjectFile,
  ProjectFileParseStatus,
} from '../../lib/supabase.js';
import type { ProjectFileKind } from '../../events/project-events.js';
import type { ProjectPatterns, ProjectBrand } from '@virus/shared/viral';
import { extractFromPdf } from './pdf.js';
import { extractFromImage } from './image.js';

// ---------- MIME helpers ----------

/** Treat these as plain text (read via blob.text()). */
const TEXT_MIMES = new Set(['text/markdown', 'text/plain', 'text/x-markdown']);

/** Treat these as JSON. */
const JSON_MIMES = new Set(['application/json', 'application/x-json']);

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

/**
 * Normalize the mime so the deterministic parser can pick its branch:
 * - text/markdown for md/plain/image-extracted markdown
 * - application/json for JSON
 */
function canonicalParserMime(mime: string): string {
  if (JSON_MIMES.has(mime)) return 'application/json';
  if (TEXT_MIMES.has(mime)) return 'text/markdown';
  return 'text/markdown';
}

// ---------- extractText ----------

/**
 * Pull plain text out of an uploaded blob, dispatching by MIME.
 *
 * `kind` is REQUIRED when `mime` is `image/*` — it controls which vision
 * prompt (patterns vs brand) is sent to Claude. For text, JSON, and PDF
 * inputs `kind` is optional and may be omitted.
 *
 * Throws `Error('extractText: kind is required for image MIME types')` if
 * an image MIME is passed without a `kind`.
 */
export async function extractText(
  blob: Blob,
  mime: string,
  kind?: ProjectFileKind,
): Promise<{ text: string; mimeType: string }> {
  if (TEXT_MIMES.has(mime)) {
    return { text: await blob.text(), mimeType: 'text/markdown' };
  }
  if (JSON_MIMES.has(mime)) {
    return { text: await blob.text(), mimeType: 'application/json' };
  }
  if (mime === 'application/pdf') {
    const { text } = await extractFromPdf(blob);
    return { text, mimeType: 'text/markdown' };
  }
  if (isImageMime(mime)) {
    if (!kind) {
      throw new Error('extractText: kind is required for image MIME types');
    }
    const { text } = await extractFromImage(blob, kind);
    return { text, mimeType: 'text/markdown' };
  }
  // Fallback: try to read as text. The deterministic parser will likely fail
  // and Claude will be asked to normalize.
  return { text: await blob.text(), mimeType: canonicalParserMime(mime) };
}

// ---------- Storage download ----------

export async function downloadFromStorage(storagePath: string): Promise<Blob> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(
      `storage_download_failed: ${error?.message ?? 'no data returned'} (path=${storagePath})`,
    );
  }
  return data;
}

// ---------- DB helpers ----------

/** Fetch a project_files row by id (admin client, RLS bypassed). */
export async function loadProjectFile(fileId: string): Promise<ProjectFile> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('id', fileId)
    .single();
  if (error || !data) {
    throw new Error(`load_project_file_failed: ${error?.message ?? 'not_found'} (id=${fileId})`);
  }
  return data as ProjectFile;
}

/**
 * Upsert the parsed payload into project_patterns or project_brand.
 *
 * Conflict target is (project_id, source_file_id) — that's what makes retries
 * idempotent. The DB trigger is responsible for flipping is_current=false on
 * the previous winning row when this insert lands; we only assert is_current=true
 * here for the row we're writing.
 */
export async function persistParsed(
  file: ProjectFile,
  data: ProjectPatterns | ProjectBrand,
): Promise<void> {
  const supabase = getAdminClient();
  const table = file.kind === 'viral_patterns' ? 'project_patterns' : 'project_brand';

  const row = {
    project_id: file.project_id,
    source_file_id: file.id,
    is_current: true,
    data,
    parsed_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(table)
    .upsert(row, { onConflict: 'project_id,source_file_id' });

  if (error) {
    throw new Error(`persist_parsed_failed: ${error.message} (table=${table})`);
  }
}

/**
 * Stamp the project_files row with the final parse outcome.
 *
 * Note on warnings: callers may pass `error = 'warning:too_few_hooks'` together
 * with status='ok' — the UI parses the `warning:` prefix to render an inline
 * warning instead of a hard failure.
 */
export async function markFileStatus(
  fileId: string,
  status: ProjectFileParseStatus,
  error?: string,
): Promise<void> {
  const supabase = getAdminClient();
  const update: Record<string, unknown> = {
    parse_status: status,
    parsed_at: new Date().toISOString(),
  };
  if (error !== undefined) update['parse_error'] = error;
  else if (status === 'ok') update['parse_error'] = null;

  const { error: dbError } = await supabase
    .from('project_files')
    .update(update)
    .eq('id', fileId);

  if (dbError) {
    throw new Error(`mark_file_status_failed: ${dbError.message} (id=${fileId})`);
  }
}

// ---------- Re-exports ----------

export { extractFromPdf } from './pdf.js';
export { extractFromImage } from './image.js';
export { claudeNormalize } from './claude-normalize.js';
export type { NormalizeInput, NormalizeResult } from './claude-normalize.js';
