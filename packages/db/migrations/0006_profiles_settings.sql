-- ============================================================
-- T4-P06 Migration 0006: Profiles Settings Columns
-- ============================================================
--
-- Adds user-level settings fields to the profiles table:
--
--   avatar_url      — optional profile picture URL (Storage path
--                     or CDN URL). Nullable; user may not have
--                     uploaded one yet.
--
--   brand_voice     — JSONB bag for brand voice configuration
--                     (tone, style, do-not-say rules, etc.).
--                     Defaults to empty object so callers can
--                     safely merge without null-checks.
--
--   schedule_config — JSONB bag for scheduling preferences
--                     (preferred days/times, cadence, platforms).
--                     Same rationale as brand_voice.
--
--   updated_at      — Standard change-tracking column. Kept in
--                     sync by the set_profiles_updated_at trigger
--                     (using the generic update_updated_at_column()
--                     function that already exists from 0001_init).
--
-- All columns use ADD COLUMN IF NOT EXISTS so the migration is
-- safe to re-run (idempotent).
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Add new columns
-- ─────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url      text,
  ADD COLUMN IF NOT EXISTS brand_voice     jsonb        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedule_config jsonb        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz  NOT NULL DEFAULT NOW();

-- ─────────────────────────────────────────────
-- 2. Attach updated_at trigger
--    DROP + CREATE ensures idempotency because
--    CREATE TRIGGER IF NOT EXISTS is not available
--    in older Postgres versions supported by Supabase.
-- ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
