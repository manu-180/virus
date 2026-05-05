import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import IdeasClient from './_components/ideas-client';

export const metadata = {
  title: 'Ideas | Virus',
};

export const dynamic = 'force-dynamic';

export type IdeaRow = {
  id: string;
  project_id: string;
  hook: string | null;
  angle: string | null;
  format: string | null;
  estimated_duration: number | null;
  status: 'draft' | 'approved' | 'rejected' | 'scripted';
  created_at: string;
};

export default async function IdeasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: ideas } = await supabase
    .from('video_ideas')
    .select('id, project_id, hook, angle, format, estimated_duration, status, created_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <IdeasClient
          initialIdeas={(ideas ?? []) as IdeaRow[]}
          projectId={project?.id ?? null}
          projectName={project?.name ?? null}
        />
      </div>
    </div>
  );
}
