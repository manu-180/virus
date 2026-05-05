-- ============================================================
-- T1-P02 Migration 0001: DDL — Tables, Foreign Keys, Triggers
-- ============================================================
--
-- Decisions documented:
--
-- 1. DENORMALIZED user_id on videos, video_ideas,
--    project_used_signatures, content_pillars.
--    Copied from projects via trigger on INSERT.
--    Enables O(1) RLS (direct column = auth.uid()) with no JOIN.
--    project_id FK is kept for referential integrity.
--
-- 2. TEXT + CHECK CONSTRAINTS instead of Postgres ENUMs.
--    ENUMs require ALTER TYPE (DDL lock on live tables).
--    Text+CHECK allows online migrations via VALIDATE CONSTRAINT.
--
-- 3. JSONB for complex/variable structures: hooks, formats,
--    pacing, visual_elements, cta_templates, hashtags, raw,
--    audience, value_props, features, case_studies, ctas,
--    do_not_say, script, captions, metadata.
--    Typed columns for short, indexed fields: status, slug,
--    template, language, format.
--
-- 4. VERSIONED FILES: project_files.version increments per
--    (project_id, kind) via trigger. project_patterns and
--    project_brand have is_current boolean; a trigger enforces
--    exactly one current row per project.
--
-- 5. SOFT DELETE: deleted_at timestamptz on projects, videos,
--    video_ideas. Never hard-delete projects.
--
-- 6. ANTI-REPETITION: project_used_signatures stores hashes
--    (hook_hash, topic_hash, angle_hash) per project, queried
--    with a 14-day window.
--
-- 7. PILLAR TEMPLATES: pillar_templates table (not project-
--    scoped) stores the 3 default pillar definitions used by
--    the wizard when creating a new project.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────
-- Generic updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- profiles (1:1 with auth.users)
-- ─────────────────────────────────────────────
CREATE TABLE public.profiles (
  id                     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle                 text,
  default_voice_clone_id text,
  default_language       text        NOT NULL DEFAULT 'es-AR',
  created_at             timestamptz NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, default_language)
  VALUES (NEW.id, 'es-AR')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────
-- projects
-- ─────────────────────────────────────────────
CREATE TABLE public.projects (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug           text        NOT NULL,
  name           text        NOT NULL,
  description    text,
  niche          text        NOT NULL DEFAULT 'general',
  language       text        NOT NULL DEFAULT 'es-AR',
  voice_clone_id text,
  theme_color    text        NOT NULL DEFAULT '#0175C2',
  status         text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'archived')),
  metadata       jsonb       NOT NULL DEFAULT '{}',
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug)
);

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- project_files (versioned uploads)
-- ─────────────────────────────────────────────
CREATE TABLE public.project_files (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind         text        NOT NULL CHECK (kind IN ('viral_patterns', 'project_info')),
  version      int         NOT NULL,
  storage_path text        NOT NULL,
  mime_type    text        NOT NULL,
  size_bytes   int,
  parse_status text        NOT NULL DEFAULT 'pending'
                             CHECK (parse_status IN ('pending', 'ok', 'failed')),
  parse_error  text,
  parsed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, kind, version)
);

CREATE OR REPLACE FUNCTION set_project_file_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1
  INTO NEW.version
  FROM public.project_files
  WHERE project_id = NEW.project_id AND kind = NEW.kind;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_version_project_file
  BEFORE INSERT ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION set_project_file_version();

-- ─────────────────────────────────────────────
-- project_patterns (parsed viral patterns)
-- ─────────────────────────────────────────────
CREATE TABLE public.project_patterns (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_file_id  uuid        NOT NULL REFERENCES public.project_files(id) ON DELETE CASCADE,
  hooks           jsonb,
  formats         jsonb,
  pacing          jsonb,
  visual_elements jsonb,
  cta_templates   jsonb,
  hashtags        jsonb,
  raw             jsonb,
  is_current      boolean     NOT NULL DEFAULT true,
  parsed_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION enforce_single_current_pattern()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE public.project_patterns
       SET is_current = false
     WHERE project_id = NEW.project_id
       AND id IS DISTINCT FROM NEW.id
       AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER single_current_pattern
  BEFORE INSERT OR UPDATE ON public.project_patterns
  FOR EACH ROW EXECUTE FUNCTION enforce_single_current_pattern();

-- ─────────────────────────────────────────────
-- project_brand (parsed brand info)
-- ─────────────────────────────────────────────
CREATE TABLE public.project_brand (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_file_id uuid        NOT NULL REFERENCES public.project_files(id) ON DELETE CASCADE,
  brand_name     text,
  one_liner      text,
  audience       jsonb,
  value_props    jsonb,
  features       jsonb,
  case_studies   jsonb,
  voice_tone     text,
  ctas           jsonb,
  do_not_say     jsonb,
  raw            jsonb,
  is_current     boolean     NOT NULL DEFAULT true,
  parsed_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION enforce_single_current_brand()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE public.project_brand
       SET is_current = false
     WHERE project_id = NEW.project_id
       AND id IS DISTINCT FROM NEW.id
       AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER single_current_brand
  BEFORE INSERT OR UPDATE ON public.project_brand
  FOR EACH ROW EXECUTE FUNCTION enforce_single_current_brand();

-- ─────────────────────────────────────────────
-- pillar_templates (reference only, not project-scoped)
-- Used by wizard to pre-fill content_pillars on project creation.
-- ─────────────────────────────────────────────
CREATE TABLE public.pillar_templates (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text    NOT NULL,
  weight         numeric NOT NULL CHECK (weight >= 0 AND weight <= 100),
  description    text,
  example_themes text[]  NOT NULL DEFAULT '{}',
  sort_order     int     NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────
-- content_pillars (project-scoped, user_id denormalized)
-- ─────────────────────────────────────────────
CREATE TABLE public.content_pillars (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  weight         numeric     NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
  description    text,
  example_themes text[]      NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- viral_hooks_seed (public catalog, NOT project-scoped)
-- ─────────────────────────────────────────────
CREATE TABLE public.viral_hooks_seed (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  niche                text        NOT NULL DEFAULT 'dev/software',
  hook                 text        NOT NULL,
  hook_type            text        NOT NULL,
  estimated_engagement text        NOT NULL CHECK (estimated_engagement IN ('bajo', 'medio', 'alto', 'viral')),
  best_platforms       text[]      NOT NULL DEFAULT '{}',
  example_topics       text[]      NOT NULL DEFAULT '{}',
  language             text        NOT NULL DEFAULT 'es-AR',
  created_at           timestamptz NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- video_ideas (project-scoped, user_id denormalized)
-- ─────────────────────────────────────────────
CREATE TABLE public.video_ideas (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pillar_id          uuid        REFERENCES public.content_pillars(id) ON DELETE SET NULL,
  hook               text,
  angle              text,
  format             text,
  estimated_duration int,
  signature_hash     text,
  status             text        NOT NULL DEFAULT 'draft'
                                   CHECK (status IN ('draft', 'approved', 'rejected', 'scripted')),
  metadata           jsonb,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- videos (project-scoped, user_id denormalized)
-- ─────────────────────────────────────────────
CREATE TABLE public.videos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idea_id           uuid        REFERENCES public.video_ideas(id) ON DELETE SET NULL,
  template          text,
  status            text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN (
                                    'pending', 'scripting', 'audio', 'captions',
                                    'rendering', 'ready', 'published', 'failed'
                                  )),
  theme_color       text,
  language          text,
  script            jsonb,
  audio_url         text,
  captions          jsonb,
  video_url         text,
  duration_seconds  numeric,
  caption_instagram text,
  caption_tiktok    text,
  caption_shorts    text,
  hashtags          text[],
  scheduled_for     timestamptz,
  published_at      timestamptz,
  inngest_run_id    text,
  error             text,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- project_used_signatures (anti-repetition, user_id denormalized)
-- ─────────────────────────────────────────────
CREATE TABLE public.project_used_signatures (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id                uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hook_hash              text        NOT NULL,
  topic_hash             text,
  angle_hash             text,
  format                 text,
  similarity_window_days int         NOT NULL DEFAULT 14,
  used_at                timestamptz NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- video_performance
-- ─────────────────────────────────────────────
CREATE TABLE public.video_performance (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id       uuid        NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  platform       text        NOT NULL CHECK (platform IN ('reels', 'tiktok', 'shorts', 'x', 'linkedin')),
  views          int         NOT NULL DEFAULT 0,
  likes          int         NOT NULL DEFAULT 0,
  comments       int         NOT NULL DEFAULT 0,
  saves          int         NOT NULL DEFAULT 0,
  shares         int         NOT NULL DEFAULT 0,
  avg_watch_time numeric,
  hook_retention numeric,
  measured_at    timestamptz NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- job_events (pipeline audit log)
-- ─────────────────────────────────────────────
CREATE TABLE public.job_events (
  id          bigserial   PRIMARY KEY,
  video_id    uuid        NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  step        text        NOT NULL,
  status      text        NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'retried')),
  duration_ms int,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Trigger: copy user_id from projects on INSERT
-- Applies to: video_ideas, videos, project_used_signatures,
--             content_pillars
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_project_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT user_id INTO NEW.user_id
  FROM public.projects
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER copy_user_id_video_ideas
  BEFORE INSERT ON public.video_ideas
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

CREATE TRIGGER copy_user_id_videos
  BEFORE INSERT ON public.videos
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

CREATE TRIGGER copy_user_id_signatures
  BEFORE INSERT ON public.project_used_signatures
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

CREATE TRIGGER copy_user_id_pillars
  BEFORE INSERT ON public.content_pillars
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();
