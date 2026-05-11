-- ============================================================
-- 0030: Add publish counters to carousel_projects
-- ============================================================
--
-- Cheap denormalized counters so the carousel detail UI can
-- show "Published 2 times, last to @apex.stack 3h ago" without
-- joining ig_publications on every read. Maintained by a
-- trigger on ig_publications.
-- ============================================================

ALTER TABLE public.carousel_projects
  ADD COLUMN IF NOT EXISTS last_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_count   int NOT NULL DEFAULT 0;

-- Backfill from any existing ig_publications (none yet on first run)
UPDATE public.carousel_projects cp
SET published_count = sub.cnt,
    last_published_at = sub.last_at
FROM (
  SELECT carousel_id, count(*) AS cnt, max(published_at) AS last_at
  FROM public.ig_publications
  WHERE status = 'published'
  GROUP BY carousel_id
) sub
WHERE cp.id = sub.carousel_id;

CREATE OR REPLACE FUNCTION public.tg_ig_publication_update_carousel_counters()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published' THEN
    UPDATE public.carousel_projects
    SET published_count = published_count + 1,
        last_published_at = COALESCE(NEW.published_at, NOW())
    WHERE id = NEW.carousel_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER ig_publication_counters_trg
  AFTER UPDATE ON public.ig_publications
  FOR EACH ROW EXECUTE FUNCTION public.tg_ig_publication_update_carousel_counters();
