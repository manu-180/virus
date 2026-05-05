-- ============================================================
-- 0014: Visual assets pipeline (Luma + Gemini b-roll/imagery)
-- ============================================================
--
-- Decisions documented:
--
-- 1. NO use_count column. Computed via COUNT(*) FROM video_assets_used
--    when needed. Eliminates UPDATE race condition from concurrent
--    Inngest retries.
--
-- 2. NO storage_url column. Signed URLs are generated on-demand at
--    render time (1h TTL) and dashboard load (7d TTL). Storing URLs
--    in DB means silent expiry breakage.
--
-- 3. Status state machine: pending → ready | failed. The 'pending'
--    state with the (project_id, prompt_hash) UNIQUE acts as a
--    distributed mutex via ON CONFLICT during claim-row.
--
-- 4. user_id denormalized via INSERT trigger (matches house pattern).

CREATE TABLE public.visual_assets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('video', 'image')),
  category     text        NOT NULL CHECK (category IN ('hook', 'reveal', 'cta')),
  provider     text        NOT NULL CHECK (provider IN ('luma', 'gemini', 'fal')),
  status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'ready', 'failed')),
  prompt       text        NOT NULL,
  prompt_hash  text        NOT NULL,
  template     text        NOT NULL,
  language     text        NOT NULL,
  storage_path text,
  duration_sec numeric,
  width        int,
  height       int,
  theme_color  text        NOT NULL,
  tags         text[]      NOT NULL DEFAULT '{}',
  burned       boolean     NOT NULL DEFAULT false,
  last_used_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, prompt_hash)
);

CREATE INDEX visual_assets_project_category_idx
  ON public.visual_assets (project_id, category)
  WHERE burned = false AND status = 'ready';

CREATE INDEX visual_assets_last_used_idx
  ON public.visual_assets (project_id, last_used_at DESC NULLS FIRST);

-- copy user_id from project on insert (reuses existing function)
CREATE TRIGGER copy_user_id_visual_assets
  BEFORE INSERT ON public.visual_assets
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

-- ============================================================
-- video_assets_used (link table, denormalized user_id)
-- ============================================================

CREATE TABLE public.video_assets_used (
  video_id  uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id  uuid NOT NULL REFERENCES public.visual_assets(id) ON DELETE RESTRICT,
  category  text NOT NULL CHECK (category IN ('hook', 'reveal', 'cta')),
  used_at   timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, category)
);

CREATE INDEX video_assets_used_asset_idx ON public.video_assets_used (asset_id);

-- copy user_id from videos via video_id
CREATE OR REPLACE FUNCTION set_video_assets_used_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT user_id INTO NEW.user_id FROM public.videos WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER copy_user_id_video_assets_used
  BEFORE INSERT ON public.video_assets_used
  FOR EACH ROW EXECUTE FUNCTION set_video_assets_used_user_id();

-- update last_used_at on link insert (race-safe: SET = NOW(), no read-modify-write)
CREATE OR REPLACE FUNCTION touch_visual_asset_last_used()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.visual_assets SET last_used_at = NOW() WHERE id = NEW.asset_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_last_used_on_link
  AFTER INSERT ON public.video_assets_used
  FOR EACH ROW EXECUTE FUNCTION touch_visual_asset_last_used();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.visual_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_assets_used ENABLE ROW LEVEL SECURITY;

CREATE POLICY visual_assets_owner_all ON public.visual_assets
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY video_assets_used_owner_all ON public.video_assets_used
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
