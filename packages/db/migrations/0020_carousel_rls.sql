-- ============================================================
-- 0020: RLS for carousel tables
-- ============================================================
--
-- All 3 tables have denormalized user_id — direct equality check.
-- Separate SELECT/INSERT/UPDATE/DELETE policies per table
-- (matches pattern in 0002_rls.sql).
-- (SELECT auth.uid()) wrapper evaluates once per query as initPlan
-- instead of once per row — ~95% performance gain on large tables.
-- ============================================================

-- ─────────────────────────────────────────────
-- carousel_projects
-- ─────────────────────────────────────────────
ALTER TABLE public.carousel_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carousel_projects_select_own"
  ON public.carousel_projects FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_projects_insert_own"
  ON public.carousel_projects FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_projects_update_own"
  ON public.carousel_projects FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_projects_delete_own"
  ON public.carousel_projects FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- carousel_slides
-- ─────────────────────────────────────────────
ALTER TABLE public.carousel_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carousel_slides_select_own"
  ON public.carousel_slides FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_slides_insert_own"
  ON public.carousel_slides FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_slides_update_own"
  ON public.carousel_slides FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_slides_delete_own"
  ON public.carousel_slides FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- carousel_captions
-- ─────────────────────────────────────────────
ALTER TABLE public.carousel_captions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carousel_captions_select_own"
  ON public.carousel_captions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_captions_insert_own"
  ON public.carousel_captions FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_captions_update_own"
  ON public.carousel_captions FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_captions_delete_own"
  ON public.carousel_captions FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
