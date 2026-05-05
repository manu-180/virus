'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ScheduledVideo } from '@/server/videos/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface VideoDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videos: ScheduledVideo[];
  date: Date;
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

export default function VideoDetailDrawer({
  open,
  onOpenChange,
  videos,
  date,
}: VideoDetailDrawerProps) {
  const dateLabel = format(date, "EEEE d 'de' MMMM", { locale: es });
  const countLabel = `${videos.length} video${videos.length !== 1 ? 's' : ''} programado${videos.length !== 1 ? 's' : ''}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-[#1a1d24] border-white/10 flex flex-col w-full sm:max-w-md">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="text-white capitalize">{dateLabel}</SheetTitle>
          <SheetDescription className="text-white/50">{countLabel}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {videos.map((video) => (
            <div
              key={video.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <Badge variant={statusVariant(video.status)} className="shrink-0">
                  {statusLabel(video.status)}
                </Badge>
                {video.themeColor && (
                  <span
                    className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: video.themeColor }}
                  />
                )}
              </div>

              {video.hookText && (
                <p className="text-white text-sm leading-snug">{video.hookText}</p>
              )}

              {video.videoUrl && (
                <a
                  href={video.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#C8FF57] text-xs hover:underline"
                >
                  Ver video →
                </a>
              )}
            </div>
          ))}
        </div>

        <SheetFooter className="px-6 pb-6 pt-2">
          <Button variant="outline" className="w-full border-white/10 text-white hover:bg-white/5" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
