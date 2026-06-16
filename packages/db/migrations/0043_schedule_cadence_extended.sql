-- ============================================================
-- 0043: Extend min_hours_between_posts ceiling for slow cadences
-- ============================================================
--
-- The auto-publish scheduler gates each account on
-- `min_hours_between_posts` (cooldown). The original CHECK capped it at
-- 24h, which made it impossible to express a cadence SLOWER than daily:
-- the target-hour windows reopen every day, so the only knob that can
-- stretch posting to "every other day" (≈48h) or "every 3 days" (≈68h)
-- is a cooldown that survives past the next day's window.
--
-- We raise the ceiling 24h -> 72h. Lower posting intensity is now a
-- first-class option; the recommended "calm" cadence is one post / 48h.
--
-- 48h cadence recipe (set per-schedule, not here):
--   posts_per_day = 1, min_hours_between_posts = 44, a single evening
--   target hour. With one daily window and a 44h cooldown the scheduler
--   reliably skips one day and posts on the next — landing ~48h apart —
--   while the (25h, 47h] safe band absorbs the jitter so it never slips
--   to a 72h gap.
-- ============================================================

ALTER TABLE public.ig_publication_schedules
  DROP CONSTRAINT IF EXISTS ig_publication_schedules_min_hours_between_posts_check;

ALTER TABLE public.ig_publication_schedules
  ADD CONSTRAINT ig_publication_schedules_min_hours_between_posts_check
  CHECK (min_hours_between_posts BETWEEN 1 AND 72);

COMMENT ON COLUMN public.ig_publication_schedules.min_hours_between_posts IS
  'Cooldown (hours) between posts on the same account. 1..72. Values >24 express sub-daily cadences (e.g. 44 ≈ every other day).';
