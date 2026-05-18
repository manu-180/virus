-- ============================================================
-- 0038: Carousel image asset library — reusable, semantically
--       matched slide images.
-- ============================================================
--
-- Problem this solves:
--   Until now every carousel slide image was generated fresh by
--   Gemini ($0.039/image, ~8 per carousel) and uploaded to
--   {user}/{carousel}/slide-{idx}.png — tied to ONE carousel,
--   never reused. Carousels covering near-identical subjects paid
--   to regenerate the same imagery over and over.
--
-- What this adds:
--   A per-project image library. Every generated base image
--   (pre-text-overlay) is copied to a permanent, categorized
--   location `library/{project_id}/{role}/{asset_id}.png` and
--   indexed here with a semantic embedding of the slide's
--   role + topic + headline + visual prompt.
--
--   When a new slide is planned, the pipeline embeds its
--   match-text and asks `match_carousel_image_assets` for the
--   closest stored image WITHIN the same project, same slide role
--   and same visual-style fingerprint. If similarity clears the
--   threshold AND the asset hasn't been used recently (cooldown),
--   the stored image is reused instead of calling Gemini.
--
-- Categorization axes (so a reused image always makes sense):
--   - project_id        — never leak imagery across brands
--   - style_fingerprint — hash of the brand visual identity;
--                         a restyle invalidates old imagery
--   - role              — hook / problem / insight / data / ...
--   - mode + category   — photo / 3d / flat illustration / ...
--   - tags[]            — subject keywords from the visual prompt
--   - embedding         — semantic vector (cosine) for "this
--                         image actually matches what the slide says"
--
-- Reuse is intentionally limited to brands whose imageProfile
-- subjectStrategy is world-anchor / standalone (independent
-- slides). character-anchor carousels chain every slide to a
-- per-carousel anchor image, so cross-carousel reuse there would
-- break visual continuity — those rows are simply never inserted.
-- ============================================================

-- pgvector — needed for the `vector` column + cosine search.
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────
-- carousel_image_assets
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carousel_image_assets (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Permanent base image (pre-overlay) inside the `carousels` bucket,
  -- layout: library/{project_id}/{role}/{asset_id}.png
  storage_path       text        NOT NULL,

  role               text        NOT NULL
                                   CHECK (role IN ('hook','problem','insight','data','example','cta')),
  mode               text        NOT NULL DEFAULT 'photo',
  subject_strategy   text        NOT NULL DEFAULT 'standalone',

  -- sha1(16) of the brand visual identity (mode + technique +
  -- composition + mood + palette + strategy). A restyle changes
  -- this so stale imagery is no longer matched.
  style_fingerprint  text        NOT NULL,

  category           text        NOT NULL DEFAULT 'general',
  tags               text[]      NOT NULL DEFAULT '{}',
  topic              text        NOT NULL DEFAULT '',
  headline           text        NOT NULL DEFAULT '',
  visual_prompt      text        NOT NULL DEFAULT '',
  -- exact text the embedding was computed from (debug + audit)
  match_text         text        NOT NULL DEFAULT '',
  -- gemini text-embedding-004, 768 dims
  embedding          vector(768),

  width              int,
  height             int,
  bytes              int         NOT NULL DEFAULT 0,

  times_used         int         NOT NULL DEFAULT 1,
  last_used_at       timestamptz NOT NULL DEFAULT NOW(),

  source_carousel_id uuid        REFERENCES public.carousel_projects(id) ON DELETE SET NULL,
  source_slide_idx   int,

  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);

-- Primary lookup: a candidate set is filtered by project + role +
-- style fingerprint before the vector search ranks it.
CREATE INDEX IF NOT EXISTS carousel_image_assets_lookup_idx
  ON public.carousel_image_assets (project_id, role, style_fingerprint);

CREATE INDEX IF NOT EXISTS carousel_image_assets_user_idx
  ON public.carousel_image_assets (user_id);

CREATE INDEX IF NOT EXISTS carousel_image_assets_tags_idx
  ON public.carousel_image_assets USING gin (tags);

-- Approximate-NN index for cosine similarity search.
CREATE INDEX IF NOT EXISTS carousel_image_assets_embedding_idx
  ON public.carousel_image_assets USING hnsw (embedding vector_cosine_ops);

-- user_id is denormalized for O(1) RLS — copied from projects.
CREATE OR REPLACE TRIGGER copy_user_id_carousel_image_assets
  BEFORE INSERT ON public.carousel_image_assets
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

CREATE OR REPLACE TRIGGER set_carousel_image_assets_updated_at
  BEFORE UPDATE ON public.carousel_image_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- RLS — owner-only, mirrors the other carousel tables
-- ─────────────────────────────────────────────
ALTER TABLE public.carousel_image_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carousel_image_assets_select"
  ON public.carousel_image_assets FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "carousel_image_assets_insert"
  ON public.carousel_image_assets FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "carousel_image_assets_update"
  ON public.carousel_image_assets FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "carousel_image_assets_delete"
  ON public.carousel_image_assets FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ─────────────────────────────────────────────
-- Storage RLS — let owners read their `library/` prefix.
-- Worker writes there with the service role (bypasses RLS); this
-- policy only exists so a future gallery UI can read it.
-- Path layout: library/{project_id}/{role}/{asset_id}.png
-- ─────────────────────────────────────────────
CREATE POLICY "carousels_storage_select_library"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'carousels'
    AND (storage.foldername(name))[1] = 'library'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- ─────────────────────────────────────────────
-- match_carousel_image_assets
--
-- Returns the closest reusable images for a slide. Candidates are
-- hard-filtered by project + role + style fingerprint, must clear
-- a cosine-similarity threshold, and must NOT have been used
-- inside the cooldown window (so the same picture doesn't show up
-- in two back-to-back carousels). Ordered closest-first.
--
-- p_embedding is passed as text ('[0.1,0.2,...]') and cast to
-- vector here — avoids driver-level vector marshalling.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_carousel_image_assets(
  p_project_id        uuid,
  p_role              text,
  p_style_fingerprint text,
  p_embedding         text,
  p_threshold         float8 DEFAULT 0.82,
  p_cooldown_days     int    DEFAULT 7,
  p_limit             int    DEFAULT 5
)
RETURNS TABLE (
  id           uuid,
  storage_path text,
  similarity   float8,
  times_used   int,
  last_used_at timestamptz,
  tags         text[],
  headline     text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.id,
    a.storage_path,
    1 - (a.embedding <=> p_embedding::vector) AS similarity,
    a.times_used,
    a.last_used_at,
    a.tags,
    a.headline
  FROM public.carousel_image_assets a
  WHERE a.project_id = p_project_id
    AND a.role = p_role
    AND a.style_fingerprint = p_style_fingerprint
    AND a.embedding IS NOT NULL
    AND a.last_used_at < NOW() - make_interval(days => GREATEST(p_cooldown_days, 0))
    AND 1 - (a.embedding <=> p_embedding::vector) >= p_threshold
  ORDER BY a.embedding <=> p_embedding::vector
  LIMIT GREATEST(p_limit, 1);
$$;

-- Bump usage counters after an asset is reused.
CREATE OR REPLACE FUNCTION public.touch_carousel_image_asset(p_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.carousel_image_assets
  SET times_used   = times_used + 1,
      last_used_at = NOW()
  WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.match_carousel_image_assets(uuid,text,text,text,float8,int,int)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_carousel_image_asset(uuid)
  TO authenticated, service_role;
