import { getAdminClient } from '../lib/supabase.js';

export interface RecentSignature {
  hookHash: string;
  topicHash: string;
  angleHash: string;
  hookText: string;
  topicName: string;
  format: string;
  usedAt: string;
}

export async function getRecentSignatures(input: {
  projectId: string;
  windowDays?: number;
}): Promise<RecentSignature[]> {
  const windowDays = input.windowDays ?? 14;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('project_used_signatures')
    .select('hook_hash, topic_hash, angle_hash, hook_text, topic_name, format, used_at')
    .eq('project_id', input.projectId)
    .gt('used_at', `NOW() - interval '${windowDays} days'`)
    .order('used_at', { ascending: false });

  if (error) {
    throw new Error(`get_recent_signatures_failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((row) => ({
    hookHash: row.hook_hash as string,
    topicHash: row.topic_hash as string,
    angleHash: row.angle_hash as string,
    hookText: (row.hook_text as string | null) ?? '',
    topicName: (row.topic_name as string | null) ?? '',
    format: (row.format as string | null) ?? '',
    usedAt: row.used_at as string,
  }));
}
