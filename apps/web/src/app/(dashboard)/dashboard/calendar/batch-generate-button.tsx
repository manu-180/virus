'use client';

import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { Plus, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PillarPreset = 'balanced' | 'educational' | 'trending';

interface PillarMix {
  educational: number;
  hot_take: number;
  personal: number;
}

const PRESETS: Record<PillarPreset, { label: string; mix: PillarMix }> = {
  balanced: {
    label: 'Balanceado',
    mix: { educational: 0.6, hot_take: 0.3, personal: 0.1 },
  },
  educational: {
    label: 'Educativo',
    mix: { educational: 0.8, hot_take: 0.15, personal: 0.05 },
  },
  trending: {
    label: 'Trending',
    mix: { educational: 0.3, hot_take: 0.6, personal: 0.1 },
  },
};

type Phase = 'config' | 'sending' | 'animating' | 'done' | 'error';

interface SlotState {
  status: 'pending' | 'done' | 'failed';
}

interface BatchGenerateButtonProps {
  onComplete: () => void;
}

export default function BatchGenerateButton({ onComplete }: BatchGenerateButtonProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(() =>
    format(addDays(new Date(), 1), 'yyyy-MM-dd'),
  );
  const [preset, setPreset] = useState<PillarPreset>('balanced');
  const [phase, setPhase] = useState<Phase>('config');
  const [animatedCount, setAnimatedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(7);
  const [slots, setSlots] = useState<SlotState[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (phase !== 'animating') return;

    const total = totalCount;
    const step = 1.5 / total;
    let current = 0;

    const interval = setInterval(() => {
      current += 1;
      setAnimatedCount(current);
      setSlots((prev) =>
        prev.map((s, i) => (i < current ? { status: 'done' } : s)),
      );
      if (current >= total) {
        clearInterval(interval);
        setPhase('done');
      }
    }, step * 1000);

    return () => clearInterval(interval);
  }, [phase, totalCount]);

  function handleOpen() {
    setPhase('config');
    setStartDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    setPreset('balanced');
    setAnimatedCount(0);
    setSlots([]);
    setErrorMessage('');
    setOpen(true);
  }

  async function handleGenerate() {
    setPhase('sending');

    try {
      const res = await fetch('/api/scheduler/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: 7,
          startDate,
          pillarMix: PRESETS[preset].mix,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          body?.error?.message ?? `Error ${res.status}: ${res.statusText}`;
        setErrorMessage(msg);
        setPhase('error');
        return;
      }

      const data: { batchId: string; videoIds: string[]; scheduledDates: string[] } =
        await res.json();

      const count = data.videoIds?.length ?? 7;
      setTotalCount(count);
      setAnimatedCount(0);
      setSlots(Array.from({ length: count }, () => ({ status: 'pending' })));
      setPhase('animating');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error de red');
      setPhase('error');
    }
  }

  function handleClose() {
    setOpen(false);
    if (phase === 'done') {
      onComplete();
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#C8FF57] text-[#111318] text-sm font-semibold hover:bg-[#d6ff7a] transition-colors"
      >
        <Plus size={15} />
        Generar 7 días
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v && phase !== 'animating') handleClose(); }}>
        <DialogContent showCloseButton={false} className="bg-[#1a1f2e] border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-semibold">
              Generar batch de 7 días
            </DialogTitle>
          </DialogHeader>

          {phase === 'config' && (
            <>
              <div className="flex flex-col gap-5 py-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-white/70">Fecha de inicio</label>
                  <Input
                    type="date"
                    value={startDate}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white [color-scheme:dark]"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-white/70">Mix de pilares</label>
                  <div className="flex gap-2">
                    {(Object.keys(PRESETS) as PillarPreset[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => setPreset(key)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          preset === key
                            ? 'bg-[#C8FF57] text-[#111318] border-[#C8FF57]'
                            : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {PRESETS[key].label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/40">
                    Educativo {Math.round(PRESETS[preset].mix.educational * 100)}% &middot; Hot
                    take {Math.round(PRESETS[preset].mix.hot_take * 100)}% &middot; Personal{' '}
                    {Math.round(PRESETS[preset].mix.personal * 100)}%
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  onClick={handleClose}
                  className="text-white/60 hover:text-white hover:bg-white/10"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleGenerate}
                  className="bg-[#C8FF57] text-[#111318] hover:bg-[#d6ff7a] font-semibold"
                >
                  Generar
                </Button>
              </DialogFooter>
            </>
          )}

          {phase === 'sending' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 size={32} className="animate-spin text-[#C8FF57]" />
              <p className="text-white/70 text-sm">Enviando solicitud...</p>
            </div>
          )}

          {(phase === 'animating' || phase === 'done') && (
            <>
              <div className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/70">
                      {phase === 'done'
                        ? '¡7 videos generados y programados!'
                        : `Generando videos... ${animatedCount}/${totalCount}`}
                    </span>
                    <span className="text-white/40 text-xs">
                      {Math.round((animatedCount / totalCount) * 100)}%
                    </span>
                  </div>
                  <Progress value={(animatedCount / totalCount) * 100} />
                </div>

                <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {slots.map((slot, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm"
                    >
                      {slot.status === 'done' ? (
                        <CheckCircle2 size={16} className="text-[#C8FF57] shrink-0" />
                      ) : (
                        <Clock size={16} className="text-white/30 shrink-0" />
                      )}
                      <span
                        className={
                          slot.status === 'done'
                            ? 'text-white'
                            : 'text-white/30'
                        }
                      >
                        Video {i + 1}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <DialogFooter>
                <Button
                  onClick={handleClose}
                  disabled={phase === 'animating'}
                  className="bg-[#C8FF57] text-[#111318] hover:bg-[#d6ff7a] font-semibold disabled:opacity-40"
                >
                  {phase === 'done' ? 'Ok' : 'Cerrar'}
                </Button>
              </DialogFooter>
            </>
          )}

          {phase === 'error' && (
            <>
              <div className="flex flex-col gap-3 py-4">
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle size={20} />
                  <span className="font-medium">Error al generar el batch</span>
                </div>
                <p className="text-sm text-white/60 bg-white/5 rounded-lg px-3 py-2 break-all">
                  {errorMessage}
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  onClick={handleClose}
                  className="text-white/60 hover:text-white hover:bg-white/10"
                >
                  Cerrar
                </Button>
                <Button
                  onClick={() => setPhase('config')}
                  className="bg-[#C8FF57] text-[#111318] hover:bg-[#d6ff7a] font-semibold"
                >
                  Reintentar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
