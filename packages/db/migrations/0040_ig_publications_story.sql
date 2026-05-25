-- ============================================================
-- 0040: Add Story-publish tracking to ig_publications
-- ============================================================
--
-- Every successful carousel publish auto-shares the first slide
-- to the same account's Instagram Stories (composed as a 9:16
-- variant by the worker). We track that secondary publish here
-- so the UI can show "carousel + story published" and so we
-- don't silently retry a story that already landed.
--
-- Failure semantics: a Story-publish failure does NOT mark the
-- whole ig_publications row as `failed` — the feed carousel is
-- already live. The error is captured in `story_error` for
-- observability and the user can re-attempt manually if needed.
-- ============================================================

ALTER TABLE public.ig_publications
  ADD COLUMN IF NOT EXISTS ig_story_media_id     text,
  ADD COLUMN IF NOT EXISTS ig_story_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS story_error           jsonb;

COMMENT ON COLUMN public.ig_publications.ig_story_media_id IS
  'Instagram media id of the auto-shared Story (first slide). NULL when not yet attempted or when the Story publish failed.';
COMMENT ON COLUMN public.ig_publications.ig_story_published_at IS
  'Timestamp at which the Story successfully published. NULL if failed or not attempted.';
COMMENT ON COLUMN public.ig_publications.story_error IS
  '{code, message} when the Story publish failed. The parent carousel publish is unaffected.';
