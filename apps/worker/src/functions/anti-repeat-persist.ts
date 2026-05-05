import { getAdminClient } from '../lib/supabase.js';

export async function persistSignature(input: {
  projectId: string;
  videoId: string;
  hookHash: string;
  topicHash: string;
  angleHash: string;
  hookText: string;
  topicName: string;
  format: string;
}): Promise<void> {
  const supabase = getAdminClient();

  const row = {
    project_id: input.projectId,
    video_id: input.videoId,
    hook_hash: input.hookHash,
    topic_hash: input.topicHash,
    angle_hash: input.angleHash,
    hook_text: input.hookText,
    topic_name: input.topicName,
    format: input.format,
    // user_id is NOT set here — the DB trigger `set_project_user_id` copies it from projects
  };

  const { error } = await supabase
    .from('project_used_signatures')
    .upsert(row, { onConflict: 'video_id' });

  if (error) {
    throw new Error(`persist_signature_failed: ${error.message}`);
  }
}
