'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { addMonths, subMonths, format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar, List } from 'lucide-react';
import type { ScheduledVideo } from '@/server/videos/types';
import { getScheduledVideos } from '@/server/videos/actions';
import MonthCalendar from './month-calendar';
import VideoDetailDrawer from './video-detail-drawer';
import ScheduleVideoModal from './schedule-video-modal';
import ListView from './list-view';
import BatchGenerateButton from './batch-generate-button';

interface CalendarClientProps {
  initialVideos: ScheduledVideo[];
  initialReadyVideos: ScheduledVideo[];
}

export default function CalendarClient({ initialVideos, initialReadyVideos }: CalendarClientProps) {
  const [view, setView] = useState<'month' | 'list'>('month');
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [videos, setVideos] = useState<ScheduledVideo[]>(initialVideos);
  const [isPending, startTransition] = useTransition();
  const [refreshCount, setRefreshCount] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedVideos, setSelectedVideos] = useState<ScheduledVideo[]>([]);
  const [readyVideos] = useState<ScheduledVideo[]>(initialReadyVideos);

  const fetchVideos = useCallback(() => {
    const from = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const to = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

    startTransition(async () => {
      const result = await getScheduledVideos(from, to);
      if (result.ok) {
        setVideos(result.data);
      }
    });
  }, [currentMonth]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos, refreshCount]);

  function handleDayClick(date: Date, dayVideos: ScheduledVideo[]) {
    setSelectedDate(date);
    setSelectedVideos(dayVideos);
    if (dayVideos.length > 0) {
      setDrawerOpen(true);
    } else {
      setModalOpen(true);
    }
  }

  function handleScheduled() {
    setRefreshCount((c) => c + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white">Calendario</h1>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setView('month')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'month'
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Calendar size={15} />
              Mes
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'list'
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <List size={15} />
              Lista
            </button>
          </div>

          <BatchGenerateButton onComplete={handleScheduled} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          className="p-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>

        <span className="text-lg font-semibold text-white min-w-[160px] text-center capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </span>

        <button
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          className="p-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {view === 'month' ? (
        <div className={isPending ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          <MonthCalendar
            videos={videos}
            currentMonth={currentMonth}
            onDayClick={handleDayClick}
          />
        </div>
      ) : (
        <ListView videos={videos} currentMonth={currentMonth} />
      )}

      <VideoDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        videos={selectedVideos}
        date={selectedDate}
      />

      <ScheduleVideoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        date={selectedDate}
        readyVideos={readyVideos}
        onScheduled={handleScheduled}
      />
    </div>
  );
}
