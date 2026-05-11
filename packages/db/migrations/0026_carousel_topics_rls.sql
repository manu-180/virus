-- ============================================================
-- 0026: RLS for carousel_topics + carousel_dimension_usage
-- ============================================================
-- Mismo patrón que 0020_carousel_rls.sql:
-- user_id denormalizado → comparación directa con auth.uid().
-- (SELECT auth.uid()) wrapper para evaluar 1x por query.
-- ============================================================

-- ─────────────────────────────────────────────
-- carousel_topics
-- ─────────────────────────────────────────────
ALTER TABLE public.carousel_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carousel_topics_select_own"
  ON public.carousel_topics FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_topics_insert_own"
  ON public.carousel_topics FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_topics_update_own"
  ON public.carousel_topics FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_topics_delete_own"
  ON public.carousel_topics FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- carousel_dimension_usage
-- ─────────────────────────────────────────────
ALTER TABLE public.carousel_dimension_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carousel_dimension_usage_select_own"
  ON public.carousel_dimension_usage FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_dimension_usage_insert_own"
  ON public.carousel_dimension_usage FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_dimension_usage_update_own"
  ON public.carousel_dimension_usage FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "carousel_dimension_usage_delete_own"
  ON public.carousel_dimension_usage FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
