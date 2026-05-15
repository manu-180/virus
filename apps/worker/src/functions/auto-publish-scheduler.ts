/**
 * auto-publish-scheduler — Cron-driven IG carousel GENERATOR + auto-publisher.
 *
 * Cron: every 10 min (`* /10 * * * *`)
 *
 * Phase 3 of the IG publishing pipeline. The previous version picked an
 * already-`ready` carousel and published it. This version **generates a
 * brand-new carousel from scratch** inside every open window, marks it
 * with `auto_publish_ig_account_id`, and relies on
 * `generate-carousel-caption.ts` to auto-publish it once the pipeline
 * reaches status='ready'.
 *
 * Per-tick flow:
 *   1. Load every enabled schedule (joined with defaults).
 *   2. For each schedule, gate-check in order — first failing gate wins:
 *      - last_dispatched_at within max(30m, 2×jitter + 5m) (idempotency) → skip
 *      - now() not within any [target - jitter, target + jitter]        → skip
 *      - account deleted / not active                                   → skip
 *      - post_count_24h >= posts_per_day (UI cap)                       → skip
 *      - last_post_at + min_hours_between_posts > now()                 → skip
 *      - any in-flight carousel for this account (pending..captions)    → skip
 *      - any in-flight publication for this account (queued/publishing) → skip
 *      - CAS-reserve the cursor by flipping last_dispatched_at          → skip if lost race
 *      - no eligible topic in carousel_topics                           → skip (releases cursor)
 *   3. Pick the least-used, oldest-used topic from the bank.
 *   4. Insert a `carousel_projects` row (status='pending') with
 *      `auto_publish_ig_account_id = schedule.ig_account_id`. On failure,
 *      release the cursor so the next tick can retry.
 *   5. Bump the topic's usage counters.
 *   6. Dispatch `virus/carousel.created` to kick off the existing pipeline.
 *      (plan → slides → compose → captions → mark-ready → auto-publish hook)
 *   7. Stamp `last_carousel_id` on the schedule for UI display
 *      (last_dispatched_at was already reserved in step 2).
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

/**
 * Idempotency floor: refuse to redispatch within this many ms even when the
 * jitter window is tiny. Prevents the cron firing twice in the same minute
 * from generating two carousels.
 */
const IDEMPOTENCY_FLOOR_MS = 30 * 60 * 1000; // 30 min

/**
 * Compute the effective idempotency window for a schedule. We MUST cover the
 * full open jitter window (2 × jitter_minutes wide) so the cron's 10-minute
 * tick cadence can't slip a second dispatch in before the window closes.
 *
 * Without this, a schedule with jitter_minutes=60 has a 2h-wide window but
 * the idempotency only blocks 15 min → 5+ dispatches per window. This is
 * exactly what produced the May-14 runaway.
 *
 * Formula: max(floor, 2 × jitter + safety_margin). Safety margin = 5 min so
 * that the last cron tick before the window edge still lands inside the
 * idempotency block.
 */
export function effectiveIdempotencyMs(jitterMinutes: number): number {
  const fullWindowMs = jitterMinutes * 2 * 60 * 1000;
  const withSafety = fullWindowMs + 5 * 60 * 1000;
  return Math.max(IDEMPOTENCY_FLOOR_MS, withSafety);
}

/** Auth-error counter threshold for auto-disable. */
const MAX_CONSECUTIVE_AUTH_FAILURES = 3;

/** Rolling window for the daily post counter. Mirrors the DB RPC. */
const POST_COUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Effective value of `post_count_24h` as the scheduler should read it.
 *
 * The raw column is reset lazily by `ig_account_try_increment_post_count`,
 * and ONLY when that RPC runs — i.e. at publish time. The scheduler's
 * daily-cap gate reads the raw column, so without this the counter would
 * dead-lock: once it hits the cap the scheduler skips → never dispatches →
 * never publishes → never calls the RPC → the counter is never reset → the
 * schedule is silently dead forever.
 *
 * This applies the RPC's own reset rule on the read side: if the counter's
 * window is older than 24h, the effective count is 0.
 */
export function effectivePostCount24h(
  rawCount: number,
  resetAt: string | null,
  now: Date,
): number {
  if (!resetAt) return rawCount;
  const ageMs = now.getTime() - new Date(resetAt).getTime();
  return ageMs > POST_COUNT_WINDOW_MS ? 0 : rawCount;
}

/**
 * Carousel statuses that count as "still in flight" — the scheduler must NOT
 * spawn a second auto-publish carousel for the same IG account while one of
 * these is still running. Pipeline lifecycle:
 *   pending → generating_slides → composing → generating_captions → ready
 * After 'ready' the auto-publish hook fires and inserts an ig_publications
 * row; we gate on that separately below.
 */
const IN_FLIGHT_CAROUSEL_STATUSES = [
  'pending',
  'generating_slides',
  'composing',
  'generating_captions',
] as const;

/**
 * Publication statuses that count as "publishing in progress" for the same
 * IG account. Once a publication is queued or already publishing we must not
 * spawn a fresh carousel that would race against it.
 */
const IN_FLIGHT_PUBLICATION_STATUSES = ['queued', 'publishing'] as const;

/**
 * Pick a slide count for an auto-generated carousel.
 *
 * We weight heavily around the schedule's `default_slide_count` but vary
 * naturally so feeds don't look bot-uniform. Distribution (relative to
 * the default, clamped to [3, 10]):
 *
 *   45% → default exactly
 *   18% → default - 1
 *   18% → default + 1
 *   8%  → default - 2
 *   8%  → default + 2
 *   3%  → default - 3 (or +3 if there's no room below)
 *
 * Examples:
 *   default=5 → 3..7 with mode 5
 *   default=4 → 3..6 mostly (3 may bottom out)
 */
function pickSlideCount(defaultCount: number): number {
  const r = Math.random();
  let offset: number;
  if (r < 0.45) offset = 0;
  else if (r < 0.63) offset = -1;
  else if (r < 0.81) offset = 1;
  else if (r < 0.89) offset = -2;
  else if (r < 0.97) offset = 2;
  else offset = Math.random() < 0.5 ? -3 : 3;
  const chosen = defaultCount + offset;
  // Carousels must have 3..10 slides (IG limit; brief schema enforces this).
  return Math.max(3, Math.min(10, chosen));
}

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
  default_angle: string;
  default_tone: string;
  default_slide_count: number;
  default_style_preset: string;
  default_language: string;
}

interface AccountRow {
  id: string;
  status: string;
  project_id: string;
  post_count_24h: number;
  post_count_24h_reset_at: string | null;
  daily_post_limit: number;
  last_post_at: string | null;
  deleted_at: string | null;
}

interface TopicRow {
  id: string;
  title: string;
  suggested_angle: string | null;
  suggested_tone: string | null;
  additional_angles: string[] | null;
  additional_tones: string[] | null;
  target_slide_count: number | null;
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
// Inngest function
// ---------------------------------------------------------------------------

export const autoPublishScheduler = inngest.createFunction(
  {
    id: 'auto-publish-scheduler',
    name: 'Auto-generate + publish carousels to Instagram (scheduler)',
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
          'id, ig_account_id, user_id, enabled, posts_per_day, target_hours_utc, jitter_minutes, min_hours_between_posts, last_dispatched_at, default_angle, default_tone, default_slide_count, default_style_preset, default_language',
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
    //   - each schedule's attempt is independent + idempotent on the cursor
    //   - throwing inside a schedule shouldn't tank the whole tick
    const dispatched: string[] = [];
    const skipReasons: Record<string, number> = {};
    const bumpSkip = (reason: string): void => {
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    };

    const nowDate = new Date();
    const nowMs = nowDate.getTime();

    for (const schedule of schedules) {
      // Tracks whether the cursor was reserved by this iteration. If an
      // exception escapes the inner try after reservation but before a
      // successful dispatch, we must release the cursor so the next tick
      // can retry; otherwise a transient DB hiccup would block dispatches
      // for the entire idempotency window.
      let cursorReservedAt: string | null = null;
      let dispatchSucceeded = false;

      try {
        // Idempotency gate first — cheapest skip. Dynamic window covers the
        // schedule's full jitter range so we can't dispatch twice in the same
        // open window even with cron firing every 10 min.
        const idempotencyMs = effectiveIdempotencyMs(schedule.jitter_minutes);
        if (
          schedule.last_dispatched_at &&
          nowMs - new Date(schedule.last_dispatched_at).getTime() < idempotencyMs
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
          .select('id, status, project_id, post_count_24h, post_count_24h_reset_at, daily_post_limit, last_post_at, deleted_at')
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
        const effectiveCount = effectivePostCount24h(
          acct.post_count_24h,
          acct.post_count_24h_reset_at,
          nowDate,
        );
        if (effectiveCount >= dailyCap) {
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

        // ── In-flight gates ───────────────────────────────────────────────
        // These protect against the daily-cap/cooldown gates being lagging
        // counters: a previous tick may already have generated a carousel
        // that hasn't finished publishing (so post_count_24h hasn't ticked
        // up yet) but the schedule's idempotency cursor is still in effect.
        // Belt-and-suspenders on top of the cursor: if the cursor stamp
        // failed mid-flight, these catch the orphan.

        // 1) Any in-flight auto-publish carousel for this account?
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inflightCarousels, error: inflightErr } = await (supabase as any)
          .from('carousel_projects')
          .select('id, status')
          .eq('auto_publish_ig_account_id', schedule.ig_account_id)
          .in('status', IN_FLIGHT_CAROUSEL_STATUSES as readonly string[])
          .is('deleted_at', null)
          .limit(1);

        if (inflightErr) {
          // Fail-safe: skip rather than risk a second dispatch.
          logger.warn('auto_publish.inflight_carousel_check_failed', {
            scheduleId: schedule.id,
            error: inflightErr.message,
          });
          bumpSkip('inflight_check_failed');
          continue;
        }
        if (inflightCarousels && inflightCarousels.length > 0) {
          bumpSkip('inflight_carousel');
          continue;
        }

        // 2) Any in-flight publication (queued/publishing) for this account?
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inflightPubs, error: inflightPubErr } = await (supabase as any)
          .from('ig_publications')
          .select('id, status')
          .eq('ig_account_id', schedule.ig_account_id)
          .in('status', IN_FLIGHT_PUBLICATION_STATUSES as readonly string[])
          .limit(1);

        if (inflightPubErr) {
          logger.warn('auto_publish.inflight_publication_check_failed', {
            scheduleId: schedule.id,
            error: inflightPubErr.message,
          });
          bumpSkip('inflight_check_failed');
          continue;
        }
        if (inflightPubs && inflightPubs.length > 0) {
          bumpSkip('inflight_publication');
          continue;
        }

        // ── Reserve the cursor BEFORE dispatch (CAS on last_dispatched_at) ──
        // This is the single point of serialization across cron ticks. If two
        // ticks somehow race past the gates above, exactly one will own the
        // cursor flip and proceed; the other gets `cursor_lost_race` and
        // skips. We use the previous `last_dispatched_at` value as the CAS
        // key so we don't depend on UNIQUE constraints.
        const cursorAt = new Date().toISOString();
        let cursorUpdate;
        if (schedule.last_dispatched_at === null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cursorUpdate = await (supabase as any)
            .from('ig_publication_schedules')
            .update({ last_dispatched_at: cursorAt })
            .eq('id', schedule.id)
            .is('last_dispatched_at', null)
            .select('id')
            .maybeSingle();
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cursorUpdate = await (supabase as any)
            .from('ig_publication_schedules')
            .update({ last_dispatched_at: cursorAt })
            .eq('id', schedule.id)
            .eq('last_dispatched_at', schedule.last_dispatched_at)
            .select('id')
            .maybeSingle();
        }
        if (cursorUpdate.error || !cursorUpdate.data) {
          // Either DB error or a concurrent tick won the race.
          if (cursorUpdate.error) {
            logger.warn('auto_publish.cursor_reserve_failed', {
              scheduleId: schedule.id,
              error: cursorUpdate.error.message,
            });
            bumpSkip('cursor_reserve_failed');
          } else {
            bumpSkip('cursor_lost_race');
          }
          continue;
        }

        // Cursor is now reserved. From here on, any abort path MUST either
        // call releaseCursor() (explicit) or let the outer catch handle it
        // (implicit via cursorReservedAt + dispatchSucceeded).
        cursorReservedAt = cursorAt;

        const releaseCursor = async (): Promise<void> => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('ig_publication_schedules')
            .update({ last_dispatched_at: schedule.last_dispatched_at })
            .eq('id', schedule.id)
            .eq('last_dispatched_at', cursorAt);
          cursorReservedAt = null;
        };

        // ── Pick eligible topic ───────────────────────────────────────────
        const topic = await pickEligibleTopic(supabase, acct.project_id);
        if (!topic) {
          // Don't auto-disable: the user may add topics later. Just log + skip.
          logger.warn('auto_publish.no_topics_available', {
            scheduleId: schedule.id,
            projectId: acct.project_id,
          });
          await releaseCursor();
          bumpSkip('no_topics_available');
          continue;
        }

        // ── Smart angle/tone/slide-count selection ─────────────────────────
        // angle/tone: pick the least-used value of each topic's *allowed set*
        // (suggested + additional) within the project's dimension_usage. This
        // diversifies output across the topic's possible framings instead of
        // always firing 'educational' + 'direct'.
        //
        // slide count: if the topic has an explicit target (e.g. "5 errores"
        // → 7), honour it; otherwise fall back to the random distribution
        // around the schedule default.
        const allowedAngles = buildAllowedSet(topic.suggested_angle, topic.additional_angles);
        const allowedTones = buildAllowedSet(topic.suggested_tone, topic.additional_tones);

        const pickedAngle =
          (await pickLeastUsedFromAllowed(supabase, acct.project_id, 'angle', allowedAngles)) ??
          schedule.default_angle;
        const pickedTone =
          (await pickLeastUsedFromAllowed(supabase, acct.project_id, 'tone', allowedTones)) ??
          schedule.default_tone;

        const chosenSlideCount =
          topic.target_slide_count ?? pickSlideCount(schedule.default_slide_count);

        const brief = {
          topic: topic.title,
          angle: pickedAngle,
          tone: pickedTone,
          slideCount: chosenSlideCount,
          language: schedule.default_language,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: carousel, error: insertErr } = await (supabase as any)
          .from('carousel_projects')
          .insert({
            project_id: acct.project_id,
            user_id: schedule.user_id,
            status: 'pending',
            brief: JSON.stringify(brief),
            style_preset: schedule.default_style_preset,
            slide_count: chosenSlideCount,
            auto_publish_ig_account_id: schedule.ig_account_id,
          })
          .select('id')
          .single();

        if (insertErr || !carousel) {
          logger.error('auto_publish.carousel_insert_failed', {
            scheduleId: schedule.id,
            error: insertErr?.message,
          });
          await releaseCursor();
          bumpSkip('carousel_insert_failed');
          continue;
        }

        const carouselId = carousel.id as string;

        // ── Bump topic usage (non-critical) ───────────────────────────────
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('carousel_topics')
            .update({
              usage_count: ((topic as unknown as { usage_count?: number }).usage_count ?? 0) + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', topic.id);
        } catch (bumpErr) {
          // Non-fatal: counter is metadata, not gating.
          logger.warn('auto_publish.topic_bump_failed', {
            topicId: topic.id,
            error: bumpErr instanceof Error ? bumpErr.message : String(bumpErr),
          });
        }

        // ── Dispatch carousel.created ─────────────────────────────────────
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (inngest as any).send({
            name: 'virus/carousel.created',
            data: {
              carouselId,
              userId: schedule.user_id,
              projectId: acct.project_id,
            },
          });
        } catch (sendErr) {
          // Soft-delete the orphan carousel so it doesn't show up as
          // "pending forever" in the user's list.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('carousel_projects')
            .update({
              deleted_at: new Date().toISOString(),
              status: 'failed',
              error: 'auto_publish_dispatch_failed',
            })
            .eq('id', carouselId);

          logger.error('auto_publish.dispatch_failed', {
            scheduleId: schedule.id,
            carouselId,
            error: sendErr instanceof Error ? sendErr.message : String(sendErr),
          });
          await releaseCursor();
          bumpSkip('dispatch_failed');
          continue;
        }

        // ── Stamp the last_carousel_id for the UI ─────────────────────────
        // `last_dispatched_at` was already reserved above; only the soft FK
        // remains. Best-effort: a failure here doesn't impact correctness.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('ig_publication_schedules')
          .update({ last_carousel_id: carouselId })
          .eq('id', schedule.id);

        dispatchSucceeded = true;
        dispatched.push(schedule.id);
        logger.info('auto_publish.generated', {
          scheduleId: schedule.id,
          igAccountId: schedule.ig_account_id,
          carouselId,
          topicId: topic.id,
          topicTitle: topic.title,
          pickedAngle,
          pickedTone,
          slideCount: chosenSlideCount,
          slideCountSource: topic.target_slide_count !== null ? 'topic_target' : 'schedule_random',
        });
      } catch (err) {
        // Don't let one bad schedule abort the others.
        logger.error('auto_publish.schedule_error', {
          scheduleId: schedule.id,
          error: err instanceof Error ? err.message : String(err),
        });
        bumpSkip('exception');

        // If we reserved the cursor but never confirmed dispatch, rewind it
        // so the next tick can retry instead of being blocked for the whole
        // idempotency window. A transient DB error shouldn't cost a slot.
        if (cursorReservedAt && !dispatchSucceeded) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from('ig_publication_schedules')
              .update({ last_dispatched_at: schedule.last_dispatched_at })
              .eq('id', schedule.id)
              .eq('last_dispatched_at', cursorReservedAt);
          } catch (rewindErr) {
            logger.warn('auto_publish.cursor_rewind_failed', {
              scheduleId: schedule.id,
              error: rewindErr instanceof Error ? rewindErr.message : String(rewindErr),
            });
          }
        }
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
 * Picks the least-used, oldest-last-used topic for the given project from
 * `carousel_topics`. Skips archived topics. Returns null if the bank is empty.
 *
 * Ordering rationale:
 *   - `usage_count ASC` → favour topics we've never (or rarely) used.
 *   - `last_used_at ASC NULLS FIRST` (via COALESCE) → among ties, rotate the
 *     ones that have sat the longest.
 *
 * The result includes `usage_count` so the caller can do an in-place +1
 * without an extra round trip; we read it via an unsafe cast at the call site.
 */
async function pickEligibleTopic(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<TopicRow | null> {
  const { data, error } = await supabase
    .from('carousel_topics')
    .select(
      'id, title, suggested_angle, suggested_tone, additional_angles, additional_tones, target_slide_count, usage_count, last_used_at',
    )
    .eq('project_id', projectId)
    .is('archived_at', null)
    .order('usage_count', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0] as TopicRow;
}

/**
 * Build the set of allowed values for a dimension on a topic. Always
 * includes `suggested_*` (if present) plus everything in `additional_*`,
 * deduplicated and with nulls/empties stripped. Order is preserved so the
 * tie-breakers in `pickLeastUsedFromAllowed` get a deterministic input
 * when usage counters are perfectly even.
 */
export function buildAllowedSet(
  suggested: string | null,
  additional: string[] | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string | null | undefined): void => {
    if (!v) return;
    if (seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  push(suggested);
  for (const v of additional ?? []) push(v);
  return out;
}

/**
 * Pick the least-used value of `dimension` (angle | tone) for `projectId`,
 * restricted to `allowed`. Mirrors the topic-picker ordering:
 *   1. lowest usage_count first
 *   2. on ties, oldest last_used_at first (NULL = never used = wins)
 *   3. on full ties, preserve the order of `allowed` (so seeded defaults
 *      win over additional_* when nothing has ever been used)
 *
 * Values in `allowed` that have no row in `carousel_dimension_usage` are
 * treated as `usage_count=0, last_used_at=null` — i.e. they've never been
 * used in this project, so they take priority over anything with a row.
 *
 * Returns null when `allowed` is empty. Returns the only element when
 * `allowed.length === 1` (skipping the DB roundtrip).
 *
 * Exported for unit testing — the sort logic is pure given the usage map.
 */
export function selectLeastUsed(
  allowed: string[],
  usage: Map<string, { count: number; lastUsedAt: string | null }>,
): string | null {
  if (allowed.length === 0) return null;
  // Stable sort: when both keys tie, original order wins.
  const indexed = allowed.map((value, idx) => ({ value, idx }));
  indexed.sort((a, b) => {
    const ua = usage.get(a.value) ?? { count: 0, lastUsedAt: null };
    const ub = usage.get(b.value) ?? { count: 0, lastUsedAt: null };
    if (ua.count !== ub.count) return ua.count - ub.count;
    if (ua.lastUsedAt === null && ub.lastUsedAt !== null) return -1;
    if (ua.lastUsedAt !== null && ub.lastUsedAt === null) return 1;
    if (ua.lastUsedAt !== null && ub.lastUsedAt !== null) {
      const da = new Date(ua.lastUsedAt).getTime();
      const db = new Date(ub.lastUsedAt).getTime();
      if (da !== db) return da - db;
    }
    return a.idx - b.idx; // preserve allowed[] order on full ties
  });
  return indexed[0]!.value;
}

async function pickLeastUsedFromAllowed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  dimension: 'angle' | 'tone',
  allowed: string[],
): Promise<string | null> {
  if (allowed.length === 0) return null;
  if (allowed.length === 1) return allowed[0]!;

  const { data, error } = await supabase
    .from('carousel_dimension_usage')
    .select('value, usage_count, last_used_at')
    .eq('project_id', projectId)
    .eq('dimension', dimension)
    .in('value', allowed);

  if (error) {
    // Soft fail: pick the first allowed value so we still publish.
    return allowed[0]!;
  }

  const usage = new Map<string, { count: number; lastUsedAt: string | null }>();
  for (const row of (data ?? []) as Array<{
    value: string;
    usage_count: number;
    last_used_at: string | null;
  }>) {
    usage.set(row.value, { count: row.usage_count, lastUsedAt: row.last_used_at });
  }

  return selectLeastUsed(allowed, usage);
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
