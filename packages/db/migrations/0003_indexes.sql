-- ============================================================
-- T1-P02 Migration 0003: Indexes
-- ============================================================
--
-- Optimized for the 8 predicted query patterns from the prompt.
-- Each index comments which query(ies) it primarily serves.
--
-- Partial indexes (WHERE clauses) keep index size small and
-- statistics accurate for the common filtered access patterns.
--
-- CONCURRENTLY is omitted — these run on a fresh schema
-- (supabase db reset). Use CREATE INDEX CONCURRENTLY in any
-- additive production migration on existing data.
-- ============================================================

-- ─── profiles ────────────────────────────────
-- RLS fast path (id = auth.uid() is PK — no index needed)

-- ─── projects ────────────────────────────────
-- Q1: list active projects by user (dashboard home)
CREATE INDEX projects_user_status_idx
  ON public.projects (user_id, status)
  WHERE deleted_at IS NULL;

-- Q1: sort by updated_at DESC
CREATE INDEX projects_user_updated_at_idx
  ON public.projects (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ─── project_files ───────────────────────────
-- Q8: list files per project ordered by kind + version DESC
CREATE INDEX project_files_project_kind_version_idx
  ON public.project_files (project_id, kind, version DESC);

-- ─── project_patterns ────────────────────────
-- Q2: load current patterns for a project context
CREATE INDEX project_patterns_current_idx
  ON public.project_patterns (project_id)
  WHERE is_current = true;

-- ─── project_brand ───────────────────────────
-- Q2: load current brand for a project context
CREATE INDEX project_brand_current_idx
  ON public.project_brand (project_id)
  WHERE is_current = true;

-- ─── content_pillars ─────────────────────────
CREATE INDEX content_pillars_project_id_idx
  ON public.content_pillars (project_id);

-- RLS fast path (denormalized user_id)
CREATE INDEX content_pillars_user_id_idx
  ON public.content_pillars (user_id);

-- ─── viral_hooks_seed ────────────────────────
-- Hook picker UI: filter by niche + language
CREATE INDEX viral_hooks_seed_niche_lang_idx
  ON public.viral_hooks_seed (niche, language);

-- Filter by engagement tier
CREATE INDEX viral_hooks_seed_engagement_idx
  ON public.viral_hooks_seed (estimated_engagement);

-- ─── video_ideas ─────────────────────────────
CREATE INDEX video_ideas_project_id_idx
  ON public.video_ideas (project_id)
  WHERE deleted_at IS NULL;

-- RLS fast path
CREATE INDEX video_ideas_user_id_idx
  ON public.video_ideas (user_id);

-- ─── videos ──────────────────────────────────
-- Q4: next video to render (scheduler — hot path)
CREATE INDEX videos_project_status_scheduled_idx
  ON public.videos (project_id, scheduled_for ASC)
  WHERE status = 'ready' AND deleted_at IS NULL;

-- Q5: pipeline status count per project
CREATE INDEX videos_project_status_idx
  ON public.videos (project_id, status)
  WHERE deleted_at IS NULL;

-- Q7: calendar view — scheduled_for range query
CREATE INDEX videos_project_scheduled_range_idx
  ON public.videos (project_id, scheduled_for)
  WHERE deleted_at IS NULL;

-- Q1: last published per project (dashboard KPI)
CREATE INDEX videos_project_published_at_idx
  ON public.videos (project_id, published_at DESC)
  WHERE deleted_at IS NULL;

-- RLS fast path (denormalized user_id)
CREATE INDEX videos_user_id_idx
  ON public.videos (user_id);

-- ─── project_used_signatures ─────────────────
-- Q3: anti-repetition — used_at window (14 days)
CREATE INDEX used_signatures_project_used_at_idx
  ON public.project_used_signatures (project_id, used_at DESC);

-- RLS fast path
CREATE INDEX used_signatures_user_id_idx
  ON public.project_used_signatures (user_id);

-- ─── video_performance ───────────────────────
-- Q6: avg performance last 30 days (measured_at window)
CREATE INDEX video_performance_video_measured_idx
  ON public.video_performance (video_id, measured_at DESC);

-- ─── job_events ──────────────────────────────
CREATE INDEX job_events_video_id_idx
  ON public.job_events (video_id, created_at DESC);
