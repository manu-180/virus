-- ============================================================
-- 0029: Instagram publications (carousel → IG account post log)
-- ============================================================
--
-- One row per attempt to publish a carousel to a specific IG
-- account. A single carousel can be republished to multiple
-- accounts (each gets its own publication row). Status machine:
--   queued → publishing → published (terminal)
--                       → failed (retryable)
--                       → cancelled (manual)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ig_publications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id      uuid        NOT NULL REFERENCES public.carousel_projects(id) ON DELETE CASCADE,
  ig_account_id    uuid        NOT NULL REFERENCES public.ig_accounts(id) ON DELETE RESTRICT,
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  caption          text        NOT NULL,
  first_comment    text,
  status           text        NOT NULL DEFAULT 'queued'
                               CHECK (status IN ('queued','publishing','published','failed','cancelled')),
  ig_media_id      text,
  ig_permalink     text,
  published_at     timestamptz,
  attempts         int         NOT NULL DEFAULT 0,
  last_attempt_at  timestamptz,
  error            jsonb,
  inngest_run_id   text,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ig_publications_user_status_idx
  ON public.ig_publications (user_id, status);
CREATE INDEX IF NOT EXISTS ig_publications_carousel_idx
  ON public.ig_publications (carousel_id);
CREATE INDEX IF NOT EXISTS ig_publications_account_status_idx
  ON public.ig_publications (ig_account_id, status);
CREATE INDEX IF NOT EXISTS ig_publications_published_idx
  ON public.ig_publications (published_at DESC) WHERE status = 'published';

-- denormalize user_id from carousel_projects
CREATE OR REPLACE FUNCTION set_ig_publication_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT user_id INTO NEW.user_id
  FROM public.carousel_projects
  WHERE id = NEW.carousel_id;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'carousel_not_found: %', NEW.carousel_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER copy_user_id_ig_publications
  BEFORE INSERT ON public.ig_publications
  FOR EACH ROW EXECUTE FUNCTION set_ig_publication_user_id();

CREATE OR REPLACE TRIGGER set_ig_publications_updated_at
  BEFORE UPDATE ON public.ig_publications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.ig_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY ig_publications_owner_select
  ON public.ig_publications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY ig_publications_owner_insert
  ON public.ig_publications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND carousel_id IN (
      SELECT id FROM public.carousel_projects WHERE user_id = (SELECT auth.uid())
    )
    AND ig_account_id IN (
      SELECT id FROM public.ig_accounts WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

CREATE POLICY ig_publications_owner_update
  ON public.ig_publications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY ig_publications_owner_delete
  ON public.ig_publications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- enable realtime so UI can subscribe to status changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.ig_publications;

COMMENT ON TABLE public.ig_publications IS
  'Log of carousel → Instagram publication attempts. One row per (carousel × account × attempt-batch).';
