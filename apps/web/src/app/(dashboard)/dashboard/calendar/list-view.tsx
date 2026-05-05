'use client';

import { eachDayOfInterval, addDays, parseISO, format, isSameDay, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ScheduledVideo } from '@/server/videos/types';
import { Badge } from '@/components/ui/badge';

interface ListViewProps {
  videos: ScheduledVideo[];
  currentMonth: Date;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    ready: 'Listo',
    scheduled: 'Programado',
    published: 'Publicado',
    draft: 'Borrador',
    processing: 'Procesando',
  };
  return map[status] ?? status;
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'published') return 'default';
  if (status === 'scheduled') return 'secondary';
  return 'outline';
}

export default function ListView({ videos }: ListViewProps) {
  const today = startOfDay(new Date());
  const days = eachDayOfInterval({ start: today, end: addDays(today, 29) });

  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => {
        const dayVideos = videos.filter((v) => {
          if (!v.scheduledFor) return false;
          return isSameDay(parseISO(v.scheduledFor), day);
        });

        const dayLabel = format(day, "EEE d 'de' MMM", { locale: es });
        const isToday = isSameDay(day, today);

        return (
          <div key={day.toISOString()} className="flex items-start gap-4">
            <div className={`w-28 shrink-0 pt-3 text-right ${isToday ? 'text-[#C8FF57]' : 'text-white/40'} text-xs capitalize font-medium`}>
              {dayLabel}
            </div>

            <div className="flex-1 flex flex-col gap-2 min-w-0">
              {dayVideos.length > 0 ? (
                dayVideos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                    style={{
                      borderLeftColor: video.themeColor ?? undefined,
                      borderLeftWidth: video.themeColor ? 3 : undefined,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm leading-snug truncate">
                        {video.hookText ?? 'Sin texto'}
                      </p>
                    </div>
                    <Badge variant={statusVariant(video.status)} className="shrink-0">
                      {statusLabel(video.status)}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-3">
                  <p className="text-white/25 text-sm">Sin video</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
