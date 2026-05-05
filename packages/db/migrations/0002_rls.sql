-- ============================================================
-- T1-P02 Migration 0002: Row Level Security
-- ============================================================
--
-- All policies use (SELECT auth.uid()) — the SELECT wrapper
-- causes Postgres to evaluate auth.uid() once per query as an
-- initPlan rather than once per row. ~95% performance gain on
-- large tables per Supabase benchmarks.
--
-- Tables with denormalized user_id (videos, video_ideas,
-- project_used_signatures, content_pillars) use direct match:
--   (SELECT auth.uid()) = user_id
--
-- Tables without user_id (project_files, project_patterns,
-- project_brand) use a correlated subquery on projects:
--   (SELECT auth.uid()) = (SELECT user_id FROM projects WHERE id = project_id)
--
-- viral_hooks_seed: SELECT public for authenticated; writes
-- blocked for authenticated role (service_role bypasses RLS).
--
-- video_performance, job_events: ownership checked via videos.
--
-- pillar_templates: SELECT public for authenticated (reference
-- data); writes via service_role only.
--
-- service_role always bypasses RLS — Inngest worker uses it.
-- ============================================================

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- ─────────────────────────────────────────────
-- projects
-- ─────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select_own"
  ON public.projects FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "projects_insert_own"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "projects_update_own"
  ON public.projects FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "projects_delete_own"
  ON public.projects FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- project_files
-- ─────────────────────────────────────────────
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_files_select_own"
  ON public.project_files FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_files_insert_own"
  ON public.project_files FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_files_update_own"
  ON public.project_files FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_files_delete_own"
  ON public.project_files FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

-- ─────────────────────────────────────────────
-- project_patterns
-- ─────────────────────────────────────────────
ALTER TABLE public.project_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_patterns_select_own"
  ON public.project_patterns FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_patterns_insert_own"
  ON public.project_patterns FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_patterns_update_own"
  ON public.project_patterns FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_patterns_delete_own"
  ON public.project_patterns FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

-- ─────────────────────────────────────────────
-- project_brand
-- ─────────────────────────────────────────────
ALTER TABLE public.project_brand ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_brand_select_own"
  ON public.project_brand FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_brand_insert_own"
  ON public.project_brand FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_brand_update_own"
  ON public.project_brand FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

CREATE POLICY "project_brand_delete_own"
  ON public.project_brand FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.projects WHERE id = project_id)
  );

-- ─────────────────────────────────────────────
-- pillar_templates (reference data — public read)
-- ─────────────────────────────────────────────
ALTER TABLE public.pillar_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pillar_templates_select_auth"
  ON public.pillar_templates FOR SELECT TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- content_pillars (user_id denormalized)
-- ─────────────────────────────────────────────
ALTER TABLE public.content_pillars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_pillars_select_own"
  ON public.content_pillars FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "content_pillars_insert_own"
  ON public.content_pillars FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "content_pillars_update_own"
  ON public.content_pillars FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "content_pillars_delete_own"
  ON public.content_pillars FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- viral_hooks_seed (public read, service_role write)
-- ─────────────────────────────────────────────
ALTER TABLE public.viral_hooks_seed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viral_hooks_seed_select_auth"
  ON public.viral_hooks_seed FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE blocked for authenticated role.
-- service_role bypasses RLS.

-- ─────────────────────────────────────────────
-- video_ideas (user_id denormalized)
-- ─────────────────────────────────────────────
ALTER TABLE public.video_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_ideas_select_own"
  ON public.video_ideas FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "video_ideas_insert_own"
  ON public.video_ideas FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "video_ideas_update_own"
  ON public.video_ideas FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "video_ideas_delete_own"
  ON public.video_ideas FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- videos (user_id denormalized)
-- ─────────────────────────────────────────────
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "videos_select_own"
  ON public.videos FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "videos_insert_own"
  ON public.videos FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "videos_update_own"
  ON public.videos FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "videos_delete_own"
  ON public.videos FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- project_used_signatures (user_id denormalized)
-- ─────────────────────────────────────────────
ALTER TABLE public.project_used_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "used_signatures_select_own"
  ON public.project_used_signatures FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "used_signatures_insert_own"
  ON public.project_used_signatures FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "used_signatures_delete_own"
  ON public.project_used_signatures FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- video_performance (ownership via videos)
-- ─────────────────────────────────────────────
ALTER TABLE public.video_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_performance_select_own"
  ON public.video_performance FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.videos WHERE id = video_id)
  );

CREATE POLICY "video_performance_insert_own"
  ON public.video_performance FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = (SELECT user_id FROM public.videos WHERE id = video_id)
  );

-- ─────────────────────────────────────────────
-- job_events (ownership via videos, INSERT by service_role only)
-- ─────────────────────────────────────────────
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_events_select_own"
  ON public.job_events FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = (SELECT user_id FROM public.videos WHERE id = video_id)
  );
