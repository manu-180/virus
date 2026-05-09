-- ============================================================
-- 0021: Storage bucket for carousel slides (private, owner RLS)
-- ============================================================
--
-- Path layout:
--   {user_id}/{carousel_id}/slide-{idx}.png       -- raw Gemini output
--   {user_id}/{carousel_id}/composed-{idx}.png    -- post-overlay (Satori+Sharp)
--
-- Ownership verified via foldername[2] = carousel_id belonging to auth.uid().
-- 10 MB limit — PNG 4:5 (1080x1350) ≈ 2–4 MB per slide.
-- Signed URLs generated on-demand (7d preview, 1h export ZIP).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'carousels',
  'carousels',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "carousels_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'carousels'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.carousel_projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "carousels_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'carousels'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.carousel_projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "carousels_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'carousels'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.carousel_projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "carousels_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'carousels'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.carousel_projects
      WHERE user_id = (SELECT auth.uid())
    )
  );
