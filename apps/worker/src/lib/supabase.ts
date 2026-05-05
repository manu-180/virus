import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProjectFileKind } from '../events/project-events.js';

/**
 * Worker-side admin Supabase client.
 *
 * Mirrors apps/web/src/lib/supabase/admin.ts but WITHOUT `import 'server-only'`
 * (which is a Next.js shim that throws when imported into non-Next runtimes).
 *
 * Reads SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL (whichever is present) and
 * SUPABASE_SERVICE_ROLE_KEY. The worker process is fully trusted; never import
 * this from a client-facing surface.
 */

let _client: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url) {
    throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) missing');
  }
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  _client = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/**
 * Test-only override: inject a mocked client. Call with `null` to restore the
 * lazily-created production client.
 */
export function __setAdminClientForTests(client: SupabaseClient | null): void {
  _client = client;
}

// ---------- Local DB row types (T2-P09 tables not yet in @virus/db) ----------

export type { ProjectFileKind };
export type ProjectFileParseStatus = 'pending' | 'ok' | 'failed';

export interface ProjectFile {
  id: string;
  project_id: string;
  kind: ProjectFileKind;
  version: number;
  storage_path: string;
  mime_type: string;
  parse_status: ProjectFileParseStatus;
  parse_error?: string | null;
  parsed_at?: string | null;
  created_at: string;
}

/** Row shape we upsert into project_patterns. */
export interface ProjectPatternsRow {
  project_id: string;
  source_file_id: string;
  is_current: boolean;
  data: unknown;
  parsed_at: string;
}

/** Row shape we upsert into project_brand. */
export interface ProjectBrandRow {
  project_id: string;
  source_file_id: string;
  is_current: boolean;
  data: unknown;
  parsed_at: string;
}

/** Storage bucket for uploaded project files. */
export const PROJECT_FILES_BUCKET = 'project-files';
