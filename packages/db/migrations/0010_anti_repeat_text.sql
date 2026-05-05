ALTER TABLE public.project_used_signatures
  ADD COLUMN IF NOT EXISTS hook_text  text,
  ADD COLUMN IF NOT EXISTS topic_name text,
  ADD COLUMN IF NOT EXISTS video_id   uuid REFERENCES public.videos(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_used_signatures_video_id_key
  ON public.project_used_signatures (video_id)
  WHERE video_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_used_signatures_project_used_at_idx
  ON public.project_used_signatures (project_id, used_at DESC);
