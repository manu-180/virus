-- ============================================================
-- 0018: Add metadata jsonb to videos
-- ============================================================
--
-- The visual assets pipeline (0014+) writes the resolved asset IDs
-- per slot into videos.metadata = { assets: { hook, reveal, cta } }.
-- render-video.ts reads from this column to resolve signed URLs at
-- render time. Without this column those writes were silent no-ops.

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- GIN index for the assets sub-key (helps if we ever query by asset usage)
CREATE INDEX IF NOT EXISTS videos_metadata_assets_idx
  ON public.videos USING gin ((metadata -> 'assets'));
