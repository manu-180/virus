import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

import { BUCKETS, type BucketKey } from './buckets';

const DEFAULT_EXPIRY = 24 * 60 * 60; // 24 h

export async function getSignedUrl(input: {
  bucket: BucketKey;
  path: string;
  expiresIn?: number;
}): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKETS[input.bucket])
    .createSignedUrl(input.path, input.expiresIn ?? DEFAULT_EXPIRY);

  if (error || !data?.signedUrl) {
    throw new Error(`getSignedUrl failed: ${error?.message ?? 'no URL returned'}`);
  }
  return data.signedUrl;
}

// AssemblyAI requires a publicly reachable URL to fetch the audio.
// A 1-hour signed URL is sufficient for the transcription job lifecycle.
export async function makeAssemblyAIAccessibleUrl(
  bucket: BucketKey,
  path: string,
): Promise<string> {
  return getSignedUrl({ bucket, path, expiresIn: 60 * 60 });
}
