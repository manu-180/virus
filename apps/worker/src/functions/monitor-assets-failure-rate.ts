/**
 * monitor-assets-failure-rate — scheduled Inngest function.
 *
 * Cron: every 15 minutes.
 * Goal: surface a high-level alert when the visual-assets pipeline produces
 * too many failures in a rolling window — the global "flag anomalies > 20%"
 * rule applied to the assets pipeline specifically.
 *
 * Logic:
 *  1. Call RPC `compute_assets_failure_rate(window_minutes := 60)`.
 *  2. If `total >= 10` AND `rate > 0.2` → fire an alert.
 *
 * Alerting backend:
 *  The schema for `job_events` requires a NOT-NULL `video_id` with a FK to
 *  `public.videos(id)`. There is no per-video context for a system-level
 *  alert, so writing a sentinel id (e.g. all-zeros) would fail the FK. Adding
 *  a synthetic video row purely to satisfy this constraint creates a worse
 *  abstraction than what we have. For now the alert is emitted to stderr
 *  via `console.warn` so existing log-shipping (PostHog/Sentry/Cloud) picks
 *  it up. A future migration should add a dedicated `system_alerts` table
 *  (or relax the FK) and this function can be updated to write there.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';

interface FailureRateRow {
  total: number;
  failed: number;
  rate: number;
}

const ALERT_MIN_TOTAL = 10;
const ALERT_RATE_THRESHOLD = 0.2;
const WINDOW_MINUTES = 60;

export const monitorAssetsFailureRate = inngest.createFunction(
  { id: 'monitor-assets-failure-rate' },
  { cron: '*/15 * * * *' },
  async () => {
    const db = getAdminClient();

    const { data, error } = await db.rpc('compute_assets_failure_rate', {
      window_minutes: WINDOW_MINUTES,
    });

    if (error) {
      console.error(
        '[monitor-assets-failure-rate] rpc compute_assets_failure_rate failed',
        error.message,
      );
      return { ok: false, reason: 'rpc_error' };
    }

    // The RPC returns a single-row result set. Be defensive: SQL functions
    // returning TABLE come back as an array; some flavours return a single
    // object. Handle both.
    const row: FailureRateRow = Array.isArray(data)
      ? (data[0] as FailureRateRow | undefined) ?? { total: 0, failed: 0, rate: 0 }
      : ((data as FailureRateRow | null) ?? { total: 0, failed: 0, rate: 0 });

    console.log({
      fn: 'monitor-assets-failure-rate',
      step: 'computed',
      total: row.total,
      failed: row.failed,
      rate: row.rate,
      windowMinutes: WINDOW_MINUTES,
    });

    if (row.total >= ALERT_MIN_TOTAL && row.rate > ALERT_RATE_THRESHOLD) {
      // TODO: replace with a write to a dedicated `system_alerts` table once
      // the migration to relax `job_events.video_id NOT NULL` (or add a
      // system-level alerts table) lands.
      console.warn({
        fn: 'monitor-assets-failure-rate',
        step: 'alert',
        message: 'assets failure rate above threshold',
        total: row.total,
        failed: row.failed,
        rate: row.rate,
        threshold: ALERT_RATE_THRESHOLD,
        windowMinutes: WINDOW_MINUTES,
      });
    }

    return { ok: true, ...row };
  },
);

// Re-export the `inngest` symbol the type-checker can see for this file's tests.
export { inngest };
