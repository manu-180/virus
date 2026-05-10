/**
 * handle-carousel-failure — Inngest function for the carousel generation pipeline.
 *
 * Trigger: `virus/carousel.failed`
 * Payload: { carouselId: string; step: string; error: string }
 *
 * Flow:
 *  1. load-carousel: fetches the carousel_projects row.
 *  2. update-status: sets status='failed' and records a structured error JSON in
 *     the error column so the retry endpoint and UI can show step context.
 *  3. log: structured log for observability dashboards.
 *
 * retries: 0 — failure handlers must not retry.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';

export const handleCarouselFailure = inngest.createFunction(
  {
    id: 'handle-carousel-failure',
    retries: 0,
  },
  { event: 'virus/carousel.failed' },
  async ({ event, step }) => {
    const { carouselId, step: failedStep, error } = event.data;

    console.log(JSON.stringify({
      fn: 'handle-carousel-failure',
      step: 'start',
      carouselId,
      failedStep,
      error,
    }));

    // ------------------------------------------------------------------
    // 1. Load carousel row
    // ------------------------------------------------------------------
    const carousel = await step.run('load-carousel', async () => {
      const { data, error: dbError } = await getAdminClient()
        .from('carousel_projects')
        .select('id, user_id, status')
        .eq('id', carouselId)
        .single();

      if (dbError || !data) {
        throw new Error(`carousel_not_found:${carouselId} — ${dbError?.message ?? 'no data'}`);
      }

      console.log(JSON.stringify({
        fn: 'handle-carousel-failure',
        step: 'load-carousel',
        carouselId,
        currentStatus: data.status,
      }));

      return data as { id: string; user_id: string; status: string };
    });

    // ------------------------------------------------------------------
    // 2. Update status + record structured error
    // ------------------------------------------------------------------
    await step.run('update-status', async () => {
      const lastError = JSON.stringify({
        step: failedStep,
        message: error,
        ts: new Date().toISOString(),
      });

      const { error: updateError } = await getAdminClient()
        .from('carousel_projects')
        .update({ status: 'failed', error: lastError })
        .eq('id', carouselId);

      if (updateError) {
        throw new Error(`update_status_failed:${carouselId} — ${updateError.message}`);
      }

      console.log(JSON.stringify({
        fn: 'handle-carousel-failure',
        step: 'update-status',
        carouselId,
        failedStep,
        error,
      }));
    });

    // ------------------------------------------------------------------
    // 3. Observability log (extend with Sentry/alerting here if needed)
    // ------------------------------------------------------------------
    await step.run('log', () => {
      console.error(JSON.stringify({
        fn: 'handle-carousel-failure',
        step: 'log',
        carouselId,
        userId: carousel.user_id,
        failedStep,
        error,
        severity: 'error',
      }));
      return { logged: true };
    });

    console.log(JSON.stringify({
      fn: 'handle-carousel-failure',
      step: 'done',
      carouselId,
    }));

    return { ok: true, carouselId, failedStep, error };
  },
);
