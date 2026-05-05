import { redirect } from 'next/navigation';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { fetchScheduledVideos, fetchReadyVideos } from '@/server/videos/queries';
import CalendarClient from './calendar-client';

export default async function CalendarPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const now = new Date();
  const from = format(startOfMonth(now), 'yyyy-MM-dd');
  const to = format(endOfMonth(now), 'yyyy-MM-dd');

  const [videos, readyVideos] = await Promise.all([
    fetchScheduledVideos(user.id, from, to),
    fetchReadyVideos(user.id),
  ]);

  return (
    <div className="min-h-screen bg-[#111318] text-white px-6 py-8">
      <div className="max-w-7xl mx-auto">
        <CalendarClient initialVideos={videos} initialReadyVideos={readyVideos} />
      </div>
    </div>
  );
}
