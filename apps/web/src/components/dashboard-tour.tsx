'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const TOUR_STEPS = [
  {
    target: 'stats',
    title: 'Tus métricas',
    description: 'Acá ves vistas, engagement y crecimiento de tu cuenta en tiempo real.',
  },
  {
    target: 'pipeline',
    title: 'Pipeline activo',
    description: 'Seguí el estado de cada video: script → audio → render → listo.',
  },
  {
    target: 'actions',
    title: 'Acciones rápidas',
    description: 'Generá nuevas ideas, creá videos o agendá un lote con un click.',
  },
  {
    target: 'calendar',
    title: 'Calendario',
    description: 'Planificá cuándo se publica cada video y evitá solapamientos.',
  },
];

interface TooltipRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourTooltipProps {
  step: (typeof TOUR_STEPS)[0];
  stepIndex: number;
  total: number;
  rect: TooltipRect;
  onNext: () => void;
  onSkip: () => void;
}

function TourTooltip({ step, stepIndex, total, rect, onNext, onSkip }: TourTooltipProps) {
  const tooltipLeft = Math.min(
    Math.max(rect.left, 16),
    typeof window !== 'undefined' ? window.innerWidth - 300 : rect.left
  );
  const showBelow = rect.top < 300;
  const tooltipTop = showBelow ? rect.top + rect.height + 12 : rect.top - 160;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 pointer-events-none" />

      {/* Highlight ring */}
      <div
        className="fixed z-50 rounded-lg pointer-events-none"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          boxShadow: '0 0 0 2px var(--accent)',
        }}
      />

      {/* Tooltip */}
      <motion.div
        initial={{ opacity: 0, y: showBelow ? -8 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="fixed z-50 w-72 rounded-xl p-4 shadow-xl border border-border"
        style={{
          top: tooltipTop,
          left: tooltipLeft,
          backgroundColor: 'var(--elevated)',
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <p className="font-semibold text-sm">{step.title}</p>
          <button
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground transition-colors ml-2"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{step.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {stepIndex + 1} / {total}
          </span>
          <Button size="sm" onClick={onNext}>
            {stepIndex < total - 1 ? 'Siguiente →' : 'Listo ✓'}
          </Button>
        </div>
      </motion.div>
    </>
  );
}

export function DashboardTour() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isTour = searchParams.get('tour') === 'true';

  const [tourStep, setTourStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [rect, setRect] = useState<TooltipRect | null>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (!isTour || didInit.current) return;
    didInit.current = true;

    import('canvas-confetti').then(({ default: confetti }) => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.4 },
        colors: ['#3ECF8E', '#C8FF57', '#ffffff'],
      });
    });

    toast.success('¡Listo! Tu primer video estará en ~5 minutos.', { duration: 6000 });
    setIsActive(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('tour');
    router.replace(params.toString() ? `/dashboard?${params}` : '/dashboard', {
      scroll: false,
    });
  }, [isTour]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isActive) return;
    const currentStep = TOUR_STEPS[tourStep];
    if (!currentStep) return;
    const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isActive, tourStep]);

  const handleNext = useCallback(() => {
    if (tourStep < TOUR_STEPS.length - 1) {
      setTourStep((s) => s + 1);
    } else {
      setIsActive(false);
    }
  }, [tourStep]);

  const handleSkip = useCallback(() => setIsActive(false), []);

  const currentTourStep = TOUR_STEPS[tourStep];
  if (!isActive || !rect || !currentTourStep) return null;

  return (
    <AnimatePresence>
      <TourTooltip
        key={tourStep}
        step={currentTourStep}
        stepIndex={tourStep}
        total={TOUR_STEPS.length}
        rect={rect}
        onNext={handleNext}
        onSkip={handleSkip}
      />
    </AnimatePresence>
  );
}
