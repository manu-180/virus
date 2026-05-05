import { parser } from '@virus/shared/viral';
import type { ProjectPatterns, ProjectBrand } from '@virus/shared/viral';
import { inngest } from '../inngest/index.js';
import {
  downloadFromStorage,
  extractText,
  loadProjectFile,
  markFileStatus,
  persistParsed,
  claudeNormalize,
} from './parse-helpers/index.js';

/**
 * Parse a freshly uploaded project file.
 *
 * Flow:
 *   1. Load the project_files row
 *   2. Download the blob from Supabase Storage
 *   3. Extract text (mime-dispatched: md/json passthrough; pdf via pdf-parse;
 *      image via Claude Vision)
 *   4. Try the deterministic parser
 *   5. If it failed, ask Claude Sonnet 4.6 to normalize to the Zod schema
 *   6. Upsert into project_patterns / project_brand
 *   7. Mark project_files.parse_status = 'ok' (or 'failed')
 *
 * Sanity check for viral_patterns: < 5 hooks → still 'ok' but we record a
 * `warning:too_few_hooks` parse_error so the UI can nudge the user.
 *
 * Idempotency: the upsert keys on (project_id, source_file_id), so retries
 * land on the same row.
 *
 * Failures: onFailure marks the file as 'failed' so the UI doesn't get stuck
 * in 'pending'. We also throw so Inngest records the failure run.
 */

/** Inngest duration string for the function-level finish timeout. */
const PARSE_FINISH_TIMEOUT = '60s' as const;
const MIN_HOOKS_THRESHOLD = 5;

export const parseProjectFile = inngest.createFunction(
  {
    id: 'parse-project-file',
    retries: 3,
    concurrency: { limit: 5 },
    timeouts: {
      finish: PARSE_FINISH_TIMEOUT,
    },
    onFailure: async ({ event, error }) => {
      // Inngest wraps the original event in `event.data.event` when invoking
      // onFailure, so we have to reach in to find the fileId.
      const original = (event as unknown as { data: { event: { data: { fileId?: string } } } }).data
        .event;
      const fileId = original?.data?.fileId;
      if (!fileId) return;
      try {
        await markFileStatus(fileId, 'failed', error?.message ?? 'unknown_error');
      } catch (markErr) {
        console.error('[parse-project-file] onFailure markFileStatus failed', markErr);
      }
    },
  },
  { event: 'project.file.uploaded' },
  async ({ event, step }) => {
    const { fileId } = event.data;

    // 1. Load file row
    const file = await step.run('load-file', () => loadProjectFile(fileId));

    // 2. Download from Storage
    const blob = await step.run('download', async () => {
      const b = await downloadFromStorage(file.storage_path);
      // Inngest serializes step return values to JSON, so a Blob can't survive
      // the boundary. We materialize to base64 + mime for the next step.
      const buf = Buffer.from(await b.arrayBuffer());
      return { base64: buf.toString('base64'), type: b.type || file.mime_type };
    });

    // 3. Extract text (depends on MIME)
    const extracted = await step.run('extract-text', async () => {
      const buf = Buffer.from(blob.base64, 'base64');
      // Reconstruct a Blob-like object for the helpers.
      const reconstituted = new Blob([new Uint8Array(buf)], { type: blob.type });
      return await extractText(reconstituted, file.mime_type, file.kind);
    });

    // 4. Deterministic parser
    const deterministic = await step.run('parse-deterministic', () => {
      if (file.kind === 'viral_patterns') {
        return parser.parsePatterns({
          source: extracted.text,
          mimeType: extracted.mimeType,
          projectId: file.project_id,
        });
      }
      return parser.parseBrand({
        source: extracted.text,
        mimeType: extracted.mimeType,
        projectId: file.project_id,
      });
    });

    // 5. If failed/partial, fall back to Claude
    let parsed: { ok: true; data: ProjectPatterns | ProjectBrand } | { ok: false; error: string };
    if (deterministic.ok) {
      parsed = { ok: true, data: deterministic.data };
    } else {
      const normalized = await step.run('claude-normalize', () =>
        claudeNormalize({
          text: extracted.text,
          kind: file.kind,
          projectId: file.project_id,
          partial: deterministic.partial,
        }),
      );
      parsed = normalized;
    }

    // 6. Persist or fail
    if (!parsed.ok) {
      const errorMsg = parsed.error;
      await step.run('mark-failed', () => markFileStatus(fileId, 'failed', errorMsg));
      // Throwing makes Inngest record this as a failed run AND triggers retries.
      // After retries are exhausted, onFailure runs (idempotently re-marks as failed).
      throw new Error(`parse_failed: ${errorMsg}`);
    }

    const safeData = parsed.data; // narrowed: parsed.ok is true here

    // Sanity check: warn (not fail) on too-few hooks.
    let warning: string | undefined;
    if (file.kind === 'viral_patterns') {
      const patterns = safeData as ProjectPatterns;
      if (patterns.hooks.length < MIN_HOOKS_THRESHOLD) {
        warning = `warning:too_few_hooks (got=${patterns.hooks.length}, expected>=${MIN_HOOKS_THRESHOLD})`;
      }
    }

    await step.run('persist', () => persistParsed(file, safeData));
    await step.run('mark-ok', () => markFileStatus(fileId, 'ok', warning));

    // Emit lifecycle event for downstream listeners (notifications etc.)
    await step.sendEvent('emit-parsed', {
      name: 'project.file.parsed',
      data: {
        fileId,
        projectId: file.project_id,
        status: 'ok',
        ...(warning ? { error: warning } : {}),
      },
    });

    return { ok: true, fileId, warning };
  },
);
