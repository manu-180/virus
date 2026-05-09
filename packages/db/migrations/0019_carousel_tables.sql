-- ============================================================
-- 0019: Carousel tables
-- ============================================================
--
-- Decisions:
-- 1. user_id denormalized on all 3 tables for O(1) RLS.
--    carousel_projects: copied from projects via existing set_project_user_id().
--    carousel_slides, carousel_captions: custom trigger functions read
--    user_id from carousel_projects via carousel_id.
-- 2. TEXT + CHECK instead of ENUMs for online migrations.
-- 3. brief TEXT (not JSONB) — single-string user input.
-- 4. No storage_url columns — signed URLs generated on-demand.
-- 5. deleted_at soft-delete on carousel_projects only.
-- ============================================================

-- ─────────────────────────────────────────────
-- carousel_projects
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carousel_projects (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN (
                                 'pending',
                                 'generating_slides',
                                 'composing',
                                 'generating_captions',
                                 'ready',
                                 'published_manually',
                                 'failed'
                               )),
  brief          text        NOT NULL,
  slide_count    int         NOT NULL DEFAULT 8 CHECK (slide_count BETWEEN 3 AND 10),
  style_preset   text        NOT NULL DEFAULT 'bold'
                               CHECK (style_preset IN ('bold', 'minimal', 'editorial')),
  error          text,
  inngest_run_id text,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS carousel_projects_user_idx   ON public.carousel_projects (user_id);
CREATE INDEX IF NOT EXISTS carousel_projects_proj_idx   ON public.carousel_projects (project_id);
CREATE INDEX IF NOT EXISTS carousel_projects_status_idx ON public.carousel_projects (user_id, status);

-- reuses existing function: reads user_id from projects via project_id
CREATE OR REPLACE TRIGGER copy_user_id_carousel_projects
  BEFORE INSERT ON public.carousel_projects
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

CREATE OR REPLACE TRIGGER set_carousel_projects_updated_at
  BEFORE UPDATE ON public.carousel_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- carousel_slides
-- ─────────────────────────────────────────────

-- slides have no project_id, so we need a dedicated function
-- that reads user_id from carousel_projects via carousel_id
CREATE OR REPLACE FUNCTION set_carousel_slide_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT user_id INTO NEW.user_id
  FROM public.carousel_projects
  WHERE id = NEW.carousel_id;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.carousel_slides (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id   uuid        NOT NULL REFERENCES public.carousel_projects(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idx           int         NOT NULL CHECK (idx >= 0),
  prompt        text        NOT NULL,
  image_path    text,
  composed_path text,
  overlay_text  text,
  status        text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (carousel_id, idx)
);

CREATE INDEX IF NOT EXISTS carousel_slides_carousel_idx     ON public.carousel_slides (carousel_id);
CREATE INDEX IF NOT EXISTS carousel_slides_carousel_idx_idx ON public.carousel_slides (carousel_id, idx);

CREATE OR REPLACE TRIGGER copy_user_id_carousel_slides
  BEFORE INSERT ON public.carousel_slides
  FOR EACH ROW EXECUTE FUNCTION set_carousel_slide_user_id();

CREATE OR REPLACE TRIGGER set_carousel_slides_updated_at
  BEFORE UPDATE ON public.carousel_slides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- carousel_captions
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_carousel_caption_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT user_id INTO NEW.user_id
  FROM public.carousel_projects
  WHERE id = NEW.carousel_id;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.carousel_captions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id uuid        NOT NULL REFERENCES public.carousel_projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  variant_idx int         NOT NULL CHECK (variant_idx >= 0 AND variant_idx <= 2),
  text        text        NOT NULL,
  framework   text        NOT NULL CHECK (framework IN ('aida', 'pas', 'hook_story_cta')),
  selected    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (carousel_id, variant_idx)
);

CREATE INDEX IF NOT EXISTS carousel_captions_carousel_idx ON public.carousel_captions (carousel_id);

CREATE OR REPLACE TRIGGER copy_user_id_carousel_captions
  BEFORE INSERT ON public.carousel_captions
  FOR EACH ROW EXECUTE FUNCTION set_carousel_caption_user_id();
