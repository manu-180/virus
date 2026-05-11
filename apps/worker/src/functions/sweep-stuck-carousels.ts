/**
 * sweep-stuck-carousels — scheduled Inngest function.
 *
 * Cron: every 2 minutes.
 *
 * Goal: catch carousels whose pipeline stalled and the per-status watchdog on
 * the web side didn't fire (e.g. user closed the dashboard tab before the
 * 90s timeout, or this app instance is the only one with DB access for the
 * sweep). Belt-and-suspenders to the web's GET-time watchdog.
 *
 * Thresholds are kept in sync with the web's watchdog
 * (apps/web/src/server/carousel/watchdog.ts) — the worker copy is the source
 * of truth for the worker's own onFailure hooks, so duplicating them here is
 * intentional, not a code-smell.
 *
 * NOTE: This function is only useful when the worker IS running. If the
 * worker is offline (the most likely cause of stuck carousels in the first
 * place), this function won't run either — the web-side cron / list-endpoint
 * sweep are the real safety nets. Keep this as the third layer of defense.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';

const STUCK_THRESHOLDS_MS: Record<string, number> = {
  pending:             90_000,
  generating_slides:   600_000,
  composing:           300_000,
  generating_captions: 180_000,
};

interface Row {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export const sweepStuckCarousels = inngest.createFunction(
  { id: 'sweep-stuck-carousels' },
  { cron: '*/2 * * * *' },
  async ({ step }) => {
    const result = await step.run('sweep', async () => {
      const db = getAdminClient();
      const statuses = Object.keys(STUCK_THRESHOLDS_MS);

      const { data, error } = await db
        .from('carousel_projects')
        .select('id, status, created_at, updated_at')
        .in('status', statuses)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        console.error('[sweep-stuck-carousels] query failed:', error.message);
        return { inspected: 0, failed: 0, failedIds: [] as string[] };
      }

      const rows = (data ?? []) as Row[];
      const failedIds: string[] = [];
      const now = Date.now();

      for (const row of rows) {
        const threshold = STUCK_THRESHOLDS_MS[row.status];
        if (!threshold) continue;
        const anchor = row.status === 'pending' ? row.created_at : row.updated_at;
        const ageMs = now - new Date(anchor).getTime();
        if (ageMs <= threshold) continue;

        const errorPayload = JSON.stringify({
          step: `watchdog:${row.status}`,
          message: `Stuck in ${row.status} for ${Math.round(ageMs / 1000)}s. ` +
                   `Worker likely offline or Inngest app not synced.`,
          ts: new Date().toISOString(),
        });

        // CAS — only flip if status hasn't moved since we read it
        const { data: updated } = await db
          .from('carousel_projects')
          .update({ status: 'failed', error: errorPayload })
          .eq('id', row.id)
          .eq('status', row.status)
          .select('id')
          .maybeSingle();

        if (updated) failedIds.push(row.id);
      }

      return { inspected: rows.length, failed: failedIds.length, failedIds };
    });

    console.log(JSON.stringify({
      fn: 'sweep-stuck-carousels',
      step: 'done',
      ...result,
    }));

    return result;
  },
);
