-- ============================================================
-- 0035: Carousel auto-publish marker
-- ============================================================
--
-- Adds `auto_publish_ig_account_id` to `carousel_projects`. When set,
-- the worker auto-fires `virus/carousel.publish.requested` once the
-- carousel reaches status='ready' (at the tail of
-- apps/worker/src/functions/generate-carousel-caption.ts).
--
-- Set by the auto-publish-scheduler when it generates a new carousel
-- inside an open schedule window. Manual creations leave this NULL —
-- their publish path is the user clicking "Publish" in the UI.
--
-- Soft FK (ON DELETE SET NULL): if the IG account is disconnected we
-- keep the carousel intact but stop the auto-publish hook.
-- ============================================================

ALTER TABLE public.carousel_projects
  ADD COLUMN IF NOT EXISTS auto_publish_ig_account_id uuid
    REFERENCES public.ig_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS carousel_projects_auto_publish_idx
  ON public.carousel_projects (auto_publish_ig_account_id)
  WHERE auto_publish_ig_account_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.carousel_projects.auto_publish_ig_account_id IS
  'When set, the carousel is auto-published to this IG account when status reaches ''ready''. Set by the auto-publish-scheduler when creating scheduled carousels.';
