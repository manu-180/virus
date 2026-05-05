-- ============================================================
-- 0015: Storage bucket for visual assets (private, owner RLS)
-- ============================================================
--
-- Path layout: <user_id>/<project_id>/<asset_id>.<ext>
-- Owner is determined by the first path segment (= user_id).
-- Signed URLs are generated on-demand by the worker (1h) and
-- dashboard (7d) — never stored in DB rows.

INSERT INTO storage.buckets (id, name, public)
VALUES ('visual-assets', 'visual-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "visual_assets_owner_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'visual-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "visual_assets_owner_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'visual-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "visual_assets_owner_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'visual-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "visual_assets_owner_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'visual-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
