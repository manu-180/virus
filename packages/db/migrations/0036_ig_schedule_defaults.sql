-- ============================================================
-- 0036: Default generation params on ig_publication_schedules
-- ============================================================
--
-- Adds the five "what should a scheduled carousel look like" knobs
-- to the schedule row. The auto-publish-scheduler reads these when
-- it generates a NEW carousel inside an open window (the previous
-- behaviour only published an existing 'ready' carousel; now it
-- creates one from scratch per tick).
--
-- All columns are NOT NULL with defaults so existing rows are valid
-- after the migration without an UPDATE pass.
--
-- The enum values mirror the CHECK constraints already enforced by
-- carousel_topics (0025) and carousel_projects (0019), to keep one
-- source of truth.
-- ============================================================

ALTER TABLE public.ig_publication_schedules
  ADD COLUMN IF NOT EXISTS default_angle text NOT NULL DEFAULT 'educational'
    CHECK (default_angle IN ('educational', 'contrarian', 'story-arc', 'before-after', 'listicle')),
  ADD COLUMN IF NOT EXISTS default_tone text NOT NULL DEFAULT 'direct'
    CHECK (default_tone IN ('direct', 'authoritative', 'casual', 'contrarian')),
  ADD COLUMN IF NOT EXISTS default_slide_count int NOT NULL DEFAULT 5
    CHECK (default_slide_count BETWEEN 3 AND 10),
  ADD COLUMN IF NOT EXISTS default_style_preset text NOT NULL DEFAULT 'bold'
    CHECK (default_style_preset IN ('minimal', 'bold', 'editorial')),
  ADD COLUMN IF NOT EXISTS default_language text NOT NULL DEFAULT 'es'
    CHECK (default_language IN ('es', 'en'));

COMMENT ON COLUMN public.ig_publication_schedules.default_angle IS
  'Default angle for auto-generated carousels when no topic-specific angle is set.';
COMMENT ON COLUMN public.ig_publication_schedules.default_tone IS
  'Default tone for auto-generated carousels when no topic-specific tone is set.';
COMMENT ON COLUMN public.ig_publication_schedules.default_slide_count IS
  'Slide count (3..10) for auto-generated carousels.';
COMMENT ON COLUMN public.ig_publication_schedules.default_style_preset IS
  'Visual style preset for auto-generated carousels.';
COMMENT ON COLUMN public.ig_publication_schedules.default_language IS
  'Language (es | en) for auto-generated carousels.';
