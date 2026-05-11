import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Stuck-state watchdog thresholds (ms). If a carousel sits in a non-terminal
// status longer than its threshold, we mark it failed so the UI surfaces a
// retry banner instead of looking frozen forever.
//
// Why this exists: if Inngest Cloud can't reach the worker (worker offline,
// app not synced after redeploy, wrong signing key), `inngest.send()` accepts
// the event but no function ever runs — including the onFailure hook that
// would normally set status='failed'. Without this watchdog the row sits in
// 'pending' indefinitely with no error message.
export const STUCK_THRESHOLDS_MS: Record<string, number> = {
  pending:             90_000,   // 1.5 min — plan step is fast
  generating_slides:   600_000,  // 10 min — N slides at concurrency 3
  composing:           300_000,  // 5 min  — satori+sharp composition
  generating_captions: 180_000,  // 3 min  — claude call
};

export interface CarouselWatchdogRow {
  id: string;
  status: string;
  error: string | null;
  updated_at: string;
  created_at: string;
}

function buildErrorPayload(row: CarouselWatchdogRow, ageMs: number) {
  return JSON.stringify({
    step: `watchdog:${row.status}`,
    message: `Stuck in ${row.status} for ${Math.round(ageMs / 1000)}s. ` +
             `Worker likely offline or Inngest app not synced.`,
    ts: new Date().toISOString(),
  });
}

function ageMsForRow(row: CarouselWatchdogRow): number {
  // For 'pending' use created_at (no upstream UPDATE yet); for the rest use
  // updated_at (the last status transition).
  const anchor = row.status === 'pending' ? row.created_at : row.updated_at;
  return Date.now() - new Date(anchor).getTime();
}

/**
 * Mutates `row` in place if it crossed the stuck threshold. Returns true if the
 * DB was updated. The CAS on status prevents overwriting a row that just
 * transitioned naturally between the GET and the UPDATE.
 */
export async function failIfStuck(row: CarouselWatchdogRow): Promise<boolean> {
  const threshold = STUCK_THRESHOLDS_MS[row.status];
  if (!threshold) return false;

  const ageMs = ageMsForRow(row);
  if (ageMs <= threshold) return false;

  const admin = createAdminClient();
  const errorPayload = buildErrorPayload(row, ageMs);

  const { data, error } = await admin
    .from('carousel_projects')
    .update({ status: 'failed', error: errorPayload })
    .eq('id', row.id)
    .eq('status', row.status) // CAS — don't clobber a fresh transition
    .select('id, status, error, updated_at')
    .maybeSingle();

  if (error) {
    console.error('[carousel-watchdog] failIfStuck update failed:', error);
    return false;
  }
  if (!data) return false; // status changed mid-flight, leave it alone

  console.log(JSON.stringify({
    op: 'carousel-watchdog',
    action: 'fail-stuck',
    carouselId: row.id,
    fromStatus: row.status,
    ageSec: Math.round(ageMs / 1000),
  }));

  row.status = 'failed';
  row.error = errorPayload;
  row.updated_at = data.updated_at as string;
  return true;
}

/**
 * Sweep every non-terminal carousel row and fail any that exceeded the
 * per-status threshold. Returns the ids that were transitioned.
 *
 * Bounded by `limit` so a stuck DB doesn't pin the request. The default of
 * 100 covers normal operation; if more rows are stuck simultaneously, the
 * next sweep tick picks them up.
 */
export async function sweepStuckCarousels(limit = 100): Promise<{
  inspected: number;
  failed: string[];
}> {
  const admin = createAdminClient();
  const statuses = Object.keys(STUCK_THRESHOLDS_MS);

  const { data, error } = await admin
    .from('carousel_projects')
    .select('id, status, error, updated_at, created_at')
    .in('status', statuses)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[carousel-watchdog] sweep query failed:', error);
    return { inspected: 0, failed: [] };
  }

  const rows = (data ?? []) as CarouselWatchdogRow[];
  const failed: string[] = [];

  for (const row of rows) {
    const ok = await failIfStuck(row);
    if (ok) failed.push(row.id);
  }

  return { inspected: rows.length, failed };
}
