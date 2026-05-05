'use client';

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  parseISO,
} from 'date-fns';
import type { ScheduledVideo } from '@/server/videos/types';

interface MonthCalendarProps {
  videos: ScheduledVideo[];
  currentMonth: Date;
  onDayClick: (date: Date, videos: ScheduledVideo[]) => void;
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function MonthCalendar({ videos, currentMonth, onDayClick }: MonthCalendarProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function videosForDay(date: Date): ScheduledVideo[] {
    return videos.filter((v) => {
      if (!v.scheduledFor) return false;
      const parsed = parseISO(v.scheduledFor);
      return isSameDay(parsed, date);
    });
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/10">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-xs font-medium text-white/40 uppercase tracking-wider"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const dayVideos = videosForDay(day);
          const isLastRow = idx >= days.length - 7;
          const isLastCol = (idx + 1) % 7 === 0;

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick(day, dayVideos)}
              disabled={!inMonth}
              className={[
                'relative flex flex-col gap-1 p-2 min-h-[96px] text-left transition-colors',
                !isLastCol && 'border-r border-white/10',
                !isLastRow && 'border-b border-white/10',
                inMonth ? 'hover:bg-white/5' : 'opacity-30 pointer-events-none',
                today ? 'bg-white/10 ring-1 ring-inset ring-white/30' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={[
                  'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
                  today ? 'bg-white text-[#111318] font-bold' : 'text-white/80',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {format(day, 'd')}
              </span>

              {dayVideos.length > 0 && (
                <div className="flex flex-col gap-1 w-full">
                  {dayVideos.map((video) => (
                    <div key={video.id} className="flex flex-col gap-0.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: video.themeColor ?? '#6366f1' }}
                      />
                      {video.hookText && (
                        <span className="text-xs text-white/60 leading-tight line-clamp-2">
                          {video.hookText}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
