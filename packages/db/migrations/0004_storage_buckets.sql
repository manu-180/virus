-- ============================================================
-- T1-P02 Migration 0004: Storage Buckets and Policies
-- ============================================================
--
-- Four private buckets: project-files, videos, audio, thumbnails.
-- All are private — no public CDN URLs. App layer generates
-- signed URLs with 24h expiry via supabase.storage.from().createSignedUrl().
--
-- Path layout enforced by policy (not by Supabase itself):
--   project-files: {project_id}/patterns/v{n}.{ext}
--                  {project_id}/info/v{n}.{ext}
--   videos:        {project_id}/{video_id}.mp4
--   audio:         {project_id}/{video_id}.mp3
--   thumbnails:    {project_id}/{video_id}.jpg
--
-- Ownership check: (storage.foldername(name))[1] must be a
-- project_id owned by auth.uid(). This is a subquery against
-- projects table — kept as-is because storage policies cannot
-- use the same denormalized user_id trick (storage.objects has
-- no user_id column).
--
-- File size limits and MIME allowlists are enforced at bucket
-- level via the INSERT policy's bucket metadata.
-- ============================================================

-- ─── Buckets ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'project-files',
    'project-files',
    false,
    10485760,   -- 10 MB
    ARRAY[
      'text/markdown', 'text/plain', 'text/x-markdown',
      'application/json', 'application/pdf',
      'image/png', 'image/jpeg', 'image/webp'
    ]
  ),
  (
    'videos',
    'videos',
    false,
    524288000,  -- 500 MB
    ARRAY['video/mp4', 'video/quicktime']
  ),
  (
    'audio',
    'audio',
    false,
    52428800,   -- 50 MB
    ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav']
  ),
  (
    'thumbnails',
    'thumbnails',
    false,
    5242880,    -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO NOTHING;

-- ─── project-files policies ──────────────────
CREATE POLICY "project_files_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_files_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_files_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_files_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- ─── videos policies ─────────────────────────
CREATE POLICY "videos_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "videos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "videos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- ─── audio policies ──────────────────────────
CREATE POLICY "audio_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'audio'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "audio_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audio'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "audio_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'audio'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- ─── thumbnails policies ─────────────────────
CREATE POLICY "thumbnails_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "thumbnails_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "thumbnails_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects
      WHERE user_id = (SELECT auth.uid())
    )
  );
