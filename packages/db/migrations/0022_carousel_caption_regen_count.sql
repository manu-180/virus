-- 0022: Add caption_regen_count to carousel_projects
ALTER TABLE public.carousel_projects
  ADD COLUMN IF NOT EXISTS caption_regen_count int NOT NULL DEFAULT 0;
