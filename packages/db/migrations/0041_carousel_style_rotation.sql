-- ============================================================
-- 0041: Carousel STYLE rotation
-- ============================================================
-- The overlay style is now ROTATED automatically (max spacing, round-robin per
-- project) instead of being a fixed choice. This mirrors how topic/angle/tone
-- already rotate via carousel_dimension_usage. Two changes:
--
--   1. A generic dimension-bump RPC. The auto-publish scheduler (service_role)
--      and the manual create route (service_role via admin client) call it to
--      advance a dimension's usage cursor. It mirrors the upsert already
--      inlined in bump_topic_usage for 'angle'/'tone', generalized so 'style'
--      (and any future dimension) reuses the exact same least-used machinery.
--
--   2. Drop the hardcoded CHECK on style_preset / default_style_preset. The
--      valid set of styles now lives in code (CAROUSEL_STYLE_KEYS in
--      packages/shared/src/carousel/styles.ts) and is validated there. The
--      column simply stores whatever the rotation engine resolved, so adding a
--      new premium style stays a ONE-LINE change in the registry — no DB
--      migration required per style.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) Generic dimension usage bump
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_carousel_dimension(
  p_project_id uuid,
  p_dimension  text,
  p_value      text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Defensive: ignore null/empty inputs rather than insert garbage rows.
  IF p_project_id IS NULL OR p_dimension IS NULL OR p_value IS NULL
     OR length(trim(p_value)) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.carousel_dimension_usage (project_id, dimension, value, usage_count, last_used_at)
  VALUES (p_project_id, p_dimension, p_value, 1, NOW())
  ON CONFLICT (project_id, dimension, value) DO UPDATE
    SET usage_count  = public.carousel_dimension_usage.usage_count + 1,
        last_used_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_carousel_dimension(uuid, text, text)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- 2) Relax the style CHECK constraints
-- ─────────────────────────────────────────────
-- Valid set is enforced in app code now (registry + Zod). Dropping the CHECK
-- lets the 13 (and future) styles flow through without a migration each time.
ALTER TABLE public.carousel_projects
  DROP CONSTRAINT IF EXISTS carousel_projects_style_preset_check;

ALTER TABLE public.ig_publication_schedules
  DROP CONSTRAINT IF EXISTS ig_publication_schedules_default_style_preset_check;
