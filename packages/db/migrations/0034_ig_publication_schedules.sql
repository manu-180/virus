-- ============================================================
-- 0034: Instagram publication schedules (auto-publish scheduler)
-- ============================================================
--
-- One row per ig_account. Drives the worker's auto-publish cron
-- (apps/worker/src/functions/auto-publish-scheduler.ts) which
-- runs every 10 min and dispatches `virus/carousel.publish.requested`
-- for accounts whose schedule has an open window.
--
-- Design notes
-- ------------
-- 1. UNIQUE (ig_account_id) — at most one schedule per account.
-- 2. user_id denormalized for O(1) RLS (same pattern as ig_accounts).
-- 3. target_hours_utc stored in UTC; the UI converts to local AR time
--    (UTC-3) for display and back to UTC when saving.
-- 4. consecutive_failures + auto-disable: the publish function bumps
--    this counter on auth errors and flips enabled=false once it hits
--    3 so a dead token can't keep spamming Inngest events.
-- 5. last_dispatched_at is the idempotency cursor: the cron refuses to
--    dispatch twice within a 15-min window for the same schedule.
-- 6. last_carousel_id is a SOFT FK (no constraint) — carousels can be
--    deleted; we just want a human-readable cursor in the UI.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ig_publication_schedules (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id            uuid        NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  user_id                  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled                  boolean     NOT NULL DEFAULT false,
  posts_per_day            int         NOT NULL DEFAULT 2
                                       CHECK (posts_per_day BETWEEN 1 AND 5),
  target_hours_utc         int[]       NOT NULL DEFAULT ARRAY[13, 19]::int[]
                                       CHECK (
                                         array_length(target_hours_utc, 1) BETWEEN 1 AND 24
                                         AND (
                                           SELECT bool_and(h BETWEEN 0 AND 23)
                                           FROM unnest(target_hours_utc) h
                                         )
                                       ),
  jitter_minutes           int         NOT NULL DEFAULT 25
                                       CHECK (jitter_minutes BETWEEN 0 AND 60),
  min_hours_between_posts  int         NOT NULL DEFAULT 4
                                       CHECK (min_hours_between_posts BETWEEN 1 AND 24),
  consecutive_failures     int         NOT NULL DEFAULT 0,
  last_dispatched_at       timestamptz,
  last_carousel_id         uuid,
  disabled_reason          text,
  created_at               timestamptz NOT NULL DEFAULT NOW(),
  updated_at               timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT one_schedule_per_account UNIQUE (ig_account_id)
);

CREATE INDEX IF NOT EXISTS ig_pub_schedules_user_idx
  ON public.ig_publication_schedules (user_id);

CREATE INDEX IF NOT EXISTS ig_pub_schedules_enabled_idx
  ON public.ig_publication_schedules (enabled)
  WHERE enabled = true;

-- ─────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────

-- Denormalize user_id from the referenced ig_account.
CREATE OR REPLACE FUNCTION public.set_user_id_from_ig_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL
     OR NEW.user_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    SELECT user_id INTO NEW.user_id
      FROM public.ig_accounts
      WHERE id = NEW.ig_account_id;
  END IF;

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'ig_account_not_found: %', NEW.ig_account_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER copy_user_id_ig_pub_schedules
  BEFORE INSERT ON public.ig_publication_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_ig_account();

CREATE OR REPLACE TRIGGER set_ig_pub_schedules_updated_at
  BEFORE UPDATE ON public.ig_publication_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.ig_publication_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY ig_pub_schedules_owner_all
  ON public.ig_publication_schedules
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- service_role bypasses RLS by default — no explicit policy needed

COMMENT ON TABLE public.ig_publication_schedules IS
  'Auto-publish scheduler config for IG accounts. One row per account.';
COMMENT ON COLUMN public.ig_publication_schedules.target_hours_utc IS
  'Target publish hours in UTC (0..23). UI converts to/from local AR time.';
COMMENT ON COLUMN public.ig_publication_schedules.consecutive_failures IS
  'Auth-error counter; auto-disable triggers at 3.';
COMMENT ON COLUMN public.ig_publication_schedules.last_dispatched_at IS
  'Idempotency cursor for the cron: refuses re-dispatch within 15 min.';
