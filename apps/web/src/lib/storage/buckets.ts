// Bucket IDs as they exist in Supabase Storage.
// 'audio' and 'videos' were created in migration 0004 (T1-P02).
// 'voice-samples' was added in migration 0005 (T2-P06).
export const BUCKETS = {
  audios: 'audio',
  videos: 'videos',
  voiceSamples: 'voice-samples',
  projectFiles: 'project-files',
  avatars: 'avatars',
} as const;

export type BucketKey = keyof typeof BUCKETS;
