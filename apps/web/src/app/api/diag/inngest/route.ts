import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { STUCK_THRESHOLDS_MS } from '@/server/carousel/watchdog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/diag/inngest
 *
 * Operator-facing diagnostic for the Inngest pipeline. Returns:
 *  - which env vars the web sees (booleans only, never values),
 *  - count of carousels currently in each non-terminal status with min/max age,
 *  - if INNGEST_WORKER_URL is set, a /health probe of that URL,
 *  - the watchdog thresholds in use, so a stuck row can be cross-checked.
 *
 * Auth: requires `?token=$DIAG_TOKEN` to match `process.env.DIAG_TOKEN`. If
 * `DIAG_TOKEN` is unset, the route returns 503 — never anonymous-readable.
 * This is enough for a CLI-driven check (`curl ...?token=...`) without
 * leaking infra state publicly.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env['DIAG_TOKEN'];

  if (!expected) {
    return NextResponse.json(
      { error: 'diag_disabled', hint: 'set DIAG_TOKEN env var to enable' },
      { status: 503 },
    );
  }
  if (token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const env = {
    INNGEST_EVENT_KEY: Boolean(process.env['INNGEST_EVENT_KEY']),
    INNGEST_SIGNING_KEY: Boolean(process.env['INNGEST_SIGNING_KEY']),
    INNGEST_WORKER_URL: process.env['INNGEST_WORKER_URL'] ?? null,
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env['SUPABASE_SERVICE_ROLE_KEY']),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env['NEXT_PUBLIC_SUPABASE_URL']),
    NODE_ENV: process.env.NODE_ENV ?? null,
  };

  // ── Carousel queue snapshot ────────────────────────────────────────────────
  let queue:
    | Record<string, { count: number; oldestAgeSec: number | null; newestAgeSec: number | null }>
    | { error: string } = { error: 'not_run' };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('carousel_projects')
      .select('status, created_at, updated_at')
      .in('status', Object.keys(STUCK_THRESHOLDS_MS))
      .is('deleted_at', null);

    if (error) {
      queue = { error: error.message };
    } else {
      const acc: Record<string, { count: number; oldestAgeSec: number | null; newestAgeSec: number | null }> = {};
      const now = Date.now();
      for (const row of (data ?? []) as Array<{ status: string; created_at: string; updated_at: string }>) {
        const anchor = row.status === 'pending' ? row.created_at : row.updated_at;
        const age = Math.round((now - new Date(anchor).getTime()) / 1000);
        const bucket = acc[row.status] ?? { count: 0, oldestAgeSec: null, newestAgeSec: null };
        bucket.count += 1;
        bucket.oldestAgeSec = bucket.oldestAgeSec == null ? age : Math.max(bucket.oldestAgeSec, age);
        bucket.newestAgeSec = bucket.newestAgeSec == null ? age : Math.min(bucket.newestAgeSec, age);
        acc[row.status] = bucket;
      }
      queue = acc;
    }
  } catch (err) {
    queue = { error: err instanceof Error ? err.message : 'queue_query_failed' };
  }

  // ── Worker probe (optional, controlled by INNGEST_WORKER_URL) ──────────────
  let workerProbe: { url: string; ok: boolean; status: number; body?: unknown; error?: string } | null = null;
  const workerUrl = env.INNGEST_WORKER_URL;
  if (workerUrl) {
    const healthUrl = workerUrl.replace(/\/+$/, '') + '/health';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5_000);
      const res = await fetch(healthUrl, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      const text = await res.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* leave as text */ }
      workerProbe = { url: healthUrl, ok: res.ok, status: res.status, body };
    } catch (err) {
      workerProbe = {
        url: healthUrl,
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : 'fetch_failed',
      };
    }
  }

  return NextResponse.json({
    ok: true,
    env,
    thresholds: STUCK_THRESHOLDS_MS,
    queue,
    workerProbe,
    ts: new Date().toISOString(),
  });
}
