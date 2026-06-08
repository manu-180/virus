-- ============================================================
-- 0042: Drop restrictive CHECK on carousel_dimension_usage.dimension
-- ============================================================
-- Migration 0025 created this table with:
--   dimension text NOT NULL CHECK (dimension IN ('angle', 'tone'))
--
-- Migration 0041 added bump_carousel_dimension() to write 'style' rows,
-- but never removed this CHECK. Every bumpStyleUsage() call violates the
-- constraint and is swallowed silently, so the style rotation cursor never
-- advances. pickRotatingStyle() always finds an empty usage Map and returns
-- 'minimal' (first in CAROUSEL_STYLE_KEYS registry order) on every carousel.
--
-- Fix: drop the CHECK so 'style' (and any future dimension) inserts succeed.
-- Code-level validation via CAROUSEL_STYLE_KEYS is the effective constraint.
-- ============================================================

ALTER TABLE public.carousel_dimension_usage
  DROP CONSTRAINT IF EXISTS carousel_dimension_usage_dimension_check;
