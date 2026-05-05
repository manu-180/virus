-- ============================================================
-- T2-P06 Migration 0005: voice-samples bucket
-- ============================================================
--
-- Adds the voice-samples bucket for user-uploaded voice cloning
-- material (T1-P05 manual upload flow).
--
-- audio and videos buckets already exist from 0004.
-- This migration uses user_id as the path prefix (not project_id)
-- because voice samples belong to a user, not a specific project.
--
-- Path layout: {user_id}/{filename}
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-samples',
  'voice-samples',
  false,
  104857600,  -- 100 MB
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "voice_samples_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'voice-samples'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "voice_samples_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voice-samples'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "voice_samples_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'voice-samples'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
