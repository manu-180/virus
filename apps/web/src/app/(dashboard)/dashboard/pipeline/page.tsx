import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PipelineClient from './_components/pipeline-client';

export const metadata = {
  title: 'Pipeline | Virus',
};

export const dynamic = 'force-dynamic';

export type PipelineVideoRow = {
  id: string;
  status:
    | 'pending'
    | 'scripting'
    | 'audio'
    | 'captions'
    | 'rendering'
    | 'ready'
    | 'published'
    | 'failed';
  idea_id: string | null;
  template: string | null;
  video_url: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  error: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  video_ideas: { hook: string | null; format: string | null } | null;
};

export default async function PipelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: videos } = await supabase
    .from('videos')
    .select(
      'id, status, idea_id, template, video_url, audio_url, duration_seconds, error, scheduled_for, published_at, created_at, updated_at, video_ideas(hook, format)',
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  const initialVideos = (videos ?? []).map((row) => ({
    ...row,
    video_ideas: Array.isArray(row.video_ideas)
      ? (row.video_ideas[0] ?? null)
      : row.video_ideas,
  })) as PipelineVideoRow[];

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PipelineClient initialVideos={initialVideos} />
      </div>
    </div>
  );
}
