import 'server-only';

import { readFile } from 'node:fs/promises';

import { createAdminClient } from '@/lib/supabase/admin';

import { BUCKETS, type BucketKey } from './buckets';

function buildPath(
  userId: string,
  videoId: string | undefined,
  filename: string,
): string {
  return videoId
    ? `${userId}/${videoId}/${filename}`
    : `${userId}/${filename}`;
}

export async function uploadFile(input: {
  bucket: BucketKey;
  userId: string;
  videoId?: string;
  filename: string;
  data: Buffer | string;
  contentType: string;
}): Promise<{ path: string }> {
  const supabase = createAdminClient();
  const body =
    typeof input.data === 'string'
      ? await readFile(input.data)
      : input.data;

  const path = buildPath(input.userId, input.videoId, input.filename);
  const { error } = await supabase.storage
    .from(BUCKETS[input.bucket])
    .upload(path, body, {
      contentType: input.contentType,
      upsert: true,
    });

  if (error) throw new Error(`uploadFile failed: ${error.message}`);
  return { path };
}

export async function uploadFromPath(input: {
  bucket: BucketKey;
  userId: string;
  videoId?: string;
  filePath: string;
  contentType: string;
}): Promise<{ path: string }> {
  const filename = input.filePath.split('/').pop()!;
  return uploadFile({
    bucket: input.bucket,
    userId: input.userId,
    ...(input.videoId !== undefined && { videoId: input.videoId }),
    filename,
    data: await readFile(input.filePath),
    contentType: input.contentType,
  });
}

export async function deleteOlderThanDays(
  bucket: BucketKey,
  days: number,
): Promise<void> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase.storage
    .from(BUCKETS[bucket])
    .list('', { limit: 1000 });

  if (error) throw new Error(`deleteOlderThanDays list failed: ${error.message}`);
  if (!data?.length) return;

  const stale = data
    .filter((f) => f.updated_at && f.updated_at < cutoff)
    .map((f) => f.name);

  if (!stale.length) return;

  const { error: delError } = await supabase.storage
    .from(BUCKETS[bucket])
    .remove(stale);

  if (delError) throw new Error(`deleteOlderThanDays remove failed: ${delError.message}`);
}
