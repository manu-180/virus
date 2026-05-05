import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';

const ALLOWED_MIME_TYPES = [
  'text/markdown',
  'text/plain',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

const MIME_TO_EXT: Record<string, string> = {
  'text/markdown': 'md',
  'text/plain': 'txt',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const MAX_SIZE = 10 * 1024 * 1024;

export async function uploadProjectFile(input: {
  projectId: string;
  kind: 'viral_patterns' | 'project_info';
  file: File;
}): Promise<{ fileId: string; storagePath: string; version: number }> {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', input.projectId)
    .single();

  if (!project || project.user_id !== user.id) throw new Error('Forbidden');

  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.file.type)) {
    throw new Error('MIME type not allowed');
  }

  if (input.file.size > MAX_SIZE) throw new Error('File too large (max 10MB)');

  const { data } = await supabase
    .from('project_files')
    .select('version')
    .eq('project_id', input.projectId)
    .eq('kind', input.kind)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (data?.[0]?.version ?? 0) + 1;

  const ext = MIME_TO_EXT[input.file.type];
  const storagePath = `project-files/${input.projectId}/${input.kind}/v${nextVersion}.${ext}`;

  const arrayBuffer = await input.file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from('project-files')
    .upload(storagePath, buffer, { contentType: input.file.type, upsert: false });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: createdFile, error: insertError } = await supabase
    .from('project_files')
    .insert({
      project_id: input.projectId,
      kind: input.kind,
      version: nextVersion,
      storage_path: storagePath,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      parse_status: 'pending',
    })
    .select()
    .single();

  if (insertError || !createdFile) {
    throw new Error(`DB insert failed: ${insertError?.message ?? 'no row returned'}`);
  }

  await inngest.send({
    name: 'project.file.uploaded',
    data: {
      fileId: createdFile.id,
      projectId: input.projectId,
      kind: input.kind,
      version: createdFile.version,
    },
  });

  return { fileId: createdFile.id, storagePath, version: createdFile.version };
}
