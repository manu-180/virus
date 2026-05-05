'use client';

import { useState } from 'react';
import { format, setHours, setMinutes, setSeconds } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ScheduledVideo } from '@/server/videos/types';
import { scheduleVideo } from '@/server/videos/actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ScheduleVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  readyVideos: ScheduledVideo[];
  onScheduled: () => void;
}

export default function ScheduleVideoModal({
  open,
  onOpenChange,
  date,
  readyVideos,
  onScheduled,
}: ScheduleVideoModalProps) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [preferredHour, setPreferredHour] = useState<9 | 18>(9);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });

  async function handleSubmit() {
    if (!selectedVideoId) return;

    const scheduled = setSeconds(setMinutes(setHours(date, preferredHour), 0), 0);
    const scheduledFor = scheduled.toISOString();

    setLoading(true);
    setError(null);

    const result = await scheduleVideo(selectedVideoId, scheduledFor);

    setLoading(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    onScheduled();
    setError(null);
    onOpenChange(false);
    setSelectedVideoId(null);
    setPreferredHour(9);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSelectedVideoId(null);
      setPreferredHour(9);
      setError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#1a1d24] border-white/10 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Programar video</DialogTitle>
          <DialogDescription className="text-white/50 capitalize">{dateLabel}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-white/60 uppercase tracking-wide">Video</p>
            {readyVideos.length === 0 ? (
              <p className="text-sm text-white/40 py-3 text-center border border-dashed border-white/10 rounded-lg">
                No hay videos listos para programar
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {readyVideos.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => setSelectedVideoId(video.id)}
                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors truncate ${
                      selectedVideoId === video.id
                        ? 'border-[#C8FF57]/60 bg-[#C8FF57]/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {video.hookText ?? 'Sin texto'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-white/60 uppercase tracking-wide">Hora</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPreferredHour(9)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  preferredHour === 9
                    ? 'border-[#C8FF57]/60 bg-[#C8FF57]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                09:00 AM
              </button>
              <button
                onClick={() => setPreferredHour(18)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  preferredHour === 18
                    ? 'border-[#C8FF57]/60 bg-[#C8FF57]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                06:00 PM
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <DialogFooter className="bg-transparent border-white/10">
          <Button variant="outline" className="border-white/10 text-white hover:bg-white/5" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedVideoId || loading}
            className="bg-[#C8FF57] text-[#111318] font-semibold hover:bg-[#d6ff7a] disabled:opacity-40"
          >
            {loading ? 'Programando...' : 'Programar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
