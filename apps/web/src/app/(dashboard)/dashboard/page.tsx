import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import StatsGrid, { StatsGridSkeleton } from './_components/stats-grid';
import ActivePipeline, { ActivePipelineSkeleton } from './_components/active-pipeline';
import QuickActions from './_components/quick-actions';
import RecentVideos, { RecentVideosSkeleton } from './_components/recent-videos';
import UpcomingSchedule, { UpcomingScheduleSkeleton } from './_components/upcoming-schedule';
import { DashboardTour } from '@/components/dashboard-tour';
import HeroSection from './_components/hero-section';

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const PIPELINE_STATUSES = ['scripting', 'audio', 'rendering', 'ready'] as const;

  const [{ count: queueCount }, { data: nextPublishRow }, { data: firstProject }] =
    await Promise.all([
      supabase
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('status', PIPELINE_STATUSES),

      supabase
        .from('videos')
        .select('scheduled_for')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gt('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('projects')
        .select('id')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle(),
    ]);

  const resolvedQueueCount = queueCount ?? 0;
  const resolvedNextPublish = nextPublishRow?.scheduled_for ?? null;
  const hasProject = firstProject != null;

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <Suspense fallback={null}>
        <DashboardTour />
      </Suspense>
      <div className="max-w-7xl mx-auto space-y-8">
      <HeroSection queueCount={resolvedQueueCount} nextPublish={resolvedNextPublish} />

      <Suspense fallback={<StatsGridSkeleton />}>
        <StatsGrid />
      </Suspense>

      <Suspense fallback={<ActivePipelineSkeleton />}>
        <ActivePipeline />
      </Suspense>

      <QuickActions hasProject={hasProject} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<RecentVideosSkeleton />}>
          <RecentVideos />
        </Suspense>
        <Suspense fallback={<UpcomingScheduleSkeleton />}>
          <UpcomingSchedule />
        </Suspense>
      </div>
    </div>
    </div>
  );
}
