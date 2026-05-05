-- ============================================================
-- T4-P06 Migration 0010: Add audio/webm to voice-samples bucket
-- ============================================================
--
-- Browser MediaRecorder API produces audio/webm by default.
-- The voice clone wizard records in-browser and uploads webm
-- before the server-side flow calls ElevenLabs.
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm'
]
WHERE id = 'voice-samples';
