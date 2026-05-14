/**
 * auto-publish-scheduler — Cron-driven IG carousel auto-publisher.
 *
 * Cron: every 10 min (`* /10 * * * *`)
 *
 * Phase 2 of the IG publishing pipeline. Manual publish stays as-is; this
 * function automates it for accounts the user has opted in to (one row in
 * `ig_publication_schedules` per account, `enabled = true`).
 *
 * Per-tick flow (all in a single Inngest step):
 *   1. Load every enabled schedule joined with its ig_account.
 *   2. For each schedule, gate-check in order — first failing gate wins:
 *      - account.status != 'active'                                 → skip
 *      - post_count_24h >= posts_per_day (UI-configured daily cap)  → skip
 *      - last_post_at + min_hours_between_posts > now()             → skip
 *      - now() not within any [target - jitter, target + jitter]    → skip
 *      - last_dispatched_at within last 15 min (idempotency)        → skip
 *      - no 'ready' carousel without an in-flight publication       → skip
 *   3. Random delay 0..9 min inside the tick to dispersar dentro
 *      del intervalo de cron (anti-pattern: posting at :00 every tick).
 *   4. Insert ig_publications (status='queued'), fire the
 *      `virus/carousel.publish.requested` event, stamp
 *      last_dispatched_at + last_carousel_id on the schedule.
 *
 * Anti-ban defaults are encoded in the schema (CHECK constraints + defaults).
 * Auto-disable of dead tokens is handled by the publish function via
 * `igAutoPublishOnPublishResult()` below — called from
 * apps/worker/src/functions/publish-carousel-to-instagram.ts.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Max delay (ms) inserted inside a single 10-min tick to disperse posts. */
const MAX_INTRA_TICK_DELAY_MS = 9 * 60 * 1000;

/** Idempotency window: refuse to redispatch a schedule within this many ms. */
const IDEMPOTENCY_WINDOW_MS = 15 * 60 * 1000;

/** Auth-error counter threshold for auto-disable. */
const MAX_CONSECUTIVE_AUTH_FAILURES = 3;

// ---------------------------------------------------------------------------
// DB row shapes (typed via `any` because @virus/db hasn't been regenerated)
// ---------------------------------------------------------------------------

interface ScheduleRow {
  id: string;
  ig_account_id: string;
  user_id: string;
  enabled: boolean;
  posts_per_day: number;
  target_hours_utc: number[];
  jitter_minutes: number;
  min_hours_between_posts: number;
  last_dispatched_at: string | null;
}

interface AccountRow {
  id: string;
  status: string;
  project_id: string;
  post_count_24h: number;
  daily_post_limit: number;
  last_post_at: string | null;
  deleted_at: string | null;
}

interface CarouselRow {
  id: string;
}

// ---------------------------------------------------------------------------
// Window-open check
// ---------------------------------------------------------------------------

/**
 * Returns true if `now` (UTC) falls inside any window
 *   [hour:00 - jitterMinutes, hour:00 + jitterMinutes]
 * defined by `targetHoursUtc`.
 *
 * The check uses absolute minute-of-day arithmetic to avoid Date/timezone bugs;
 * a window straddling midnight (e.g. hour=0, jitter=30) is naturally handled
 * because we mod by 1440 (minutes in a day).
 */
export function isWindowOpen(
  now: Date,
  targetHoursUtc: number[],
  jitterMinutes: number,
): boolean {
  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (const h of targetHoursUtc) {
    const center = h * 60;
    // Compute the circular distance on a 1440-minute clock.
    const raw = Math.abs(minuteOfDay - center);
    const dist = Math.min(raw, 1440 - raw);
    if (dist <= jitterMinutes) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sleep helper (inline tiny utility — not worth a separate module)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const autoPublishScheduler = inngest.createFunction(
  {
    id: 'auto-publish-scheduler',
    name: 'Auto-publish carousels to Instagram (scheduler)',
    // Single in-flight tick; cron firings overlap if a tick is slow.
    concurrency: { limit: 1 },
    retries: 0,
  },
  { cron: '*/10 * * * *' },
  async ({ step, logger }) => {
    const supabase = getAdminClient();

    // ── 1. Load enabled schedules ───────────────────────────────────────────
    const schedules = await step.run('load-enabled-schedules', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ig_publication_schedules')
        .select(
          'id, ig_account_id, user_id, enabled, posts_per_day, target_hours_utc, jitter_minutes, min_hours_between_posts, last_dispatched_at',
        )
        .eq('enabled', true);
      if (error) {
        throw new Error(`load-enabled-schedules failed: ${error.message}`);
      }
      return (data ?? []) as ScheduleRow[];
    });

    if (schedules.length === 0) {
      logger.info('auto_publish.no_enabled_schedules');
      return { scanned: 0, dispatched: 0, skipped: {} };
    }

    // ── 2. Walk schedules ───────────────────────────────────────────────────
    // We don't use step.run inside the loop because:
    //   - we want one log line per tick (atomic visibility)
    //   - foreach attempt is independent + idempotent on the schedule cursor
    //   - throwing inside a schedule shouldn't tank the whole tick
    const dispatched: string[] = [];
    const skipReasons: Record<string, number> = {};
    const bumpSkip = (reason: string): void => {
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    };

    const nowDate = new Date();
    const nowMs = nowDate.getTime();

    for (const schedule of schedules) {
      try {
        // Idempotency gate first — cheapest skip.
        if (
          schedule.last_dispatched_at &&
          nowMs - new Date(schedule.last_dispatched_at).getTime() < IDEMPOTENCY_WINDOW_MS
        ) {
          bumpSkip('idempotency_window');
          continue;
        }

        // Window-open gate.
        if (!isWindowOpen(nowDate, schedule.target_hours_utc, schedule.jitter_minutes)) {
          bumpSkip('outside_window');
          continue;
        }

        // ── Load account state ────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: account, error: acctErr } = await (supabase as any)
          .from('ig_accounts')
          .select('id, status, project_id, post_count_24h, daily_post_limit, last_post_at, deleted_at')
          .eq('id', schedule.ig_account_id)
          .single();

        if (acctErr || !account) {
          bumpSkip('account_not_found');
          continue;
        }
        const acct = account as AccountRow;

        if (acct.deleted_at) {
          bumpSkip('account_deleted');
          continue;
        }
        if (acct.status !== 'active') {
          bumpSkip(`account_${acct.status}`);
          continue;
        }

        const dailyCap = Math.min(schedule.posts_per_day, acct.daily_post_limit);
        if (acct.post_count_24h >= dailyCap) {
          bumpSkip('daily_cap_reached');
          continue;
        }

        // Cooldown gate.
        if (acct.last_post_at) {
          const earliestNextMs =
            new Date(acct.last_post_at).getTime() +
            schedule.min_hours_between_posts * 60 * 60 * 1000;
          if (earliestNextMs > nowMs) {
            bumpSkip('cooldown');
            continue;
          }
        }

        // ── Find an eligible carousel ─────────────────────────────────────
        // Oldest ready carousel for this project that has NEVER been
        // queued/publishing/published on THIS account.
        const carouselId = await pickEligibleCarousel(
          supabase,
          acct.project_id,
          schedule.ig_account_id,
        );
        if (!carouselId) {
          bumpSkip('no_carousel_ready');
          continue;
        }

        // ── Load caption (mirror /api/carousels/[id]/publish-ig) ─────────
        const caption = await loadCaption(supabase, carouselId);
        if (!caption) {
          bumpSkip('no_caption');
          continue;
        }

        // ── Random intra-tick delay (anti-ban) ───────────────────────────
        const delay = Math.floor(Math.random() * MAX_INTRA_TICK_DELAY_MS);
        if (delay > 0) {
          await sleep(delay);
        }

        // ── Insert publication row + send event ──────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: publication, error: insertErr } = await (supabase as any)
          .from('ig_publications')
          .insert({
            carousel_id: carouselId,
            ig_account_id: schedule.ig_account_id,
            user_id: schedule.user_id,
            caption,
            first_comment: null,
            status: 'queued',
          })
          .select('id')
          .single();

        if (insertErr || !publication) {
          logger.error('auto_publish.insert_failed', {
            scheduleId: schedule.id,
            error: insertErr?.message,
          });
          bumpSkip('insert_failed');
          continue;
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (inngest as any).send({
            name: 'virus/carousel.publish.requested',
            data: {
              publicationId: publication.id,
              carouselId,
              igAccountId: schedule.ig_account_id,
              userId: schedule.user_id,
            },
          });
        } catch (sendErr) {
          // Roll the publication to failed so we don't leak queued rows.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('ig_publications')
            .update({
              status: 'failed',
              error: {
                code: 'dispatch_failed',
                message: sendErr instanceof Error ? sendErr.message : String(sendErr),
              },
            })
            .eq('id', publication.id);
          logger.error('auto_publish.dispatch_failed', {
            scheduleId: schedule.id,
            publicationId: publication.id,
          });
          bumpSkip('dispatch_failed');
          continue;
        }

        // ── Stamp the schedule cursor ────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('ig_publication_schedules')
          .update({
            last_dispatched_at: new Date().toISOString(),
            last_carousel_id: carouselId,
          })
          .eq('id', schedule.id);

        dispatched.push(schedule.id);
        logger.info('auto_publish.dispatched', {
          scheduleId: schedule.id,
          igAccountId: schedule.ig_account_id,
          carouselId,
          publicationId: publication.id,
        });
      } catch (err) {
        // Don't let one bad schedule abort the others.
        logger.error('auto_publish.schedule_error', {
          scheduleId: schedule.id,
          error: err instanceof Error ? err.message : String(err),
        });
        bumpSkip('exception');
      }
    }

    const summary = {
      scanned: schedules.length,
      dispatched: dispatched.length,
      skipped: skipReasons,
    };
    logger.info('auto_publish.tick_done', summary);
    return summary;
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the id of the oldest 'ready' carousel for `projectId` that has no
 * in-flight or completed publication for `igAccountId`.
 *
 * We need to filter on "no row in ig_publications matching this (carousel,
 * account) with status in (queued, publishing, published)". The simplest path
 * via supabase-js is two round-trips: (a) get candidate ids, (b) filter out
 * those already publishing. We keep both small (LIMIT 25) so the cost stays
 * bounded.
 */
async function pickEligibleCarousel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  igAccountId: string,
): Promise<string | null> {
  const { data: candidates, error } = await supabase
    .from('carousel_projects')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'ready')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(25);

  if (error || !candidates || candidates.length === 0) return null;

  const ids = (candidates as CarouselRow[]).map((r) => r.id);

  const { data: blocked, error: blockedErr } = await supabase
    .from('ig_publications')
    .select('carousel_id')
    .in('carousel_id', ids)
    .eq('ig_account_id', igAccountId)
    .in('status', ['queued', 'publishing', 'published']);

  if (blockedErr) return null;

  const blockedSet = new Set<string>(
    ((blocked ?? []) as { carousel_id: string }[]).map((r) => r.carousel_id),
  );

  for (const id of ids) {
    if (!blockedSet.has(id)) return id;
  }
  return null;
}

/**
 * Loads the selected caption text for a carousel; falls back to variant 0.
 * Mirrors the logic in apps/web/src/app/api/carousels/[id]/publish-ig/route.ts.
 */
async function loadCaption(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  carouselId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('carousel_captions')
    .select('text, variant_idx, selected')
    .eq('carousel_id', carouselId)
    .order('variant_idx', { ascending: true });

  if (error || !data || data.length === 0) return null;
  const rows = data as { text: string; variant_idx: number; selected: boolean }[];
  const sel = rows.find((c) => c.selected);
  return (sel ?? rows[0])?.text ?? null;
}

// ---------------------------------------------------------------------------
// Cross-function hook: schedule bookkeeping after publish outcome
// ---------------------------------------------------------------------------

/**
 * Called from `publish-carousel-to-instagram.ts` once the publish run reaches
 * a terminal state. Updates the schedule (if any) for the account:
 *   - `success`     → reset consecutive_failures to 0
 *   - `auth_error`  → bump consecutive_failures; auto-disable at MAX_CONSECUTIVE_AUTH_FAILURES
 *   - `non_auth_error` → no-op (transient errors don't kill the schedule)
 *
 * Safe to call even when there's no schedule row; just no-ops.
 */
export async function igAutoPublishOnPublishResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  igAccountId: string,
  outcome: 'success' | 'auth_error' | 'non_auth_error',
): Promise<void> {
  if (outcome === 'non_auth_error') return;

  const { data: row, error } = await supabase
    .from('ig_publication_schedules')
    .select('id, consecutive_failures, enabled')
    .eq('ig_account_id', igAccountId)
    .maybeSingle();

  if (error || !row) return;
  const schedule = row as { id: string; consecutive_failures: number; enabled: boolean };

  if (outcome === 'success') {
    if (schedule.consecutive_failures === 0) return;
    await supabase
      .from('ig_publication_schedules')
      .update({ consecutive_failures: 0 })
      .eq('id', schedule.id);
    return;
  }

  // auth_error path
  const next = schedule.consecutive_failures + 1;
  const patch: Record<string, unknown> = { consecutive_failures: next };
  if (next >= MAX_CONSECUTIVE_AUTH_FAILURES && schedule.enabled) {
    patch['enabled'] = false;
    patch['disabled_reason'] = 'token_expired';
  }
  await supabase
    .from('ig_publication_schedules')
    .update(patch)
    .eq('id', schedule.id);
}
