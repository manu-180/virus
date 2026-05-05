'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StepBasics } from './step-basics';
import { StepPatternsUpload } from './step-patterns-upload';
import { StepBrandUpload } from './step-brand-upload';
import { StepConfirm } from './step-confirm';

export type WizardState = {
  projectId?: string;
  projectSlug?: string;
  basics?: {
    name: string;
    slug: string;
    description?: string;
    niche: string;
    language: string;
    themeColor: string;
    voiceCloneId?: string;
  };
  patternsFileId?: string;
  brandFileId?: string;
};

export const WIZARD_STORAGE_KEY = 'wizard:project';

const STEPS = [
  { label: 'Datos', number: 1 },
  { label: 'Patrones virales', number: 2 },
  { label: 'Info de marca', number: 3 },
  { label: 'Confirmar', number: 4 },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

export function ProjectCreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [state, setState] = useState<WizardState>({});
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { step?: number; state?: WizardState };
        if (parsed.state) setState(parsed.state);
        if (parsed.step && parsed.step >= 1 && parsed.step <= 4) {
          setStep(parsed.step as 1 | 2 | 3 | 4);
        }
      }
    } catch {
      // ignore malformed storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step, state }));
    } catch {
      // ignore storage errors
    }
  }, [step, state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if ((step === 2 || step === 3 || step === 4) && !state.projectId) {
      setDirection(-1);
      setStep(1);
    }
  }, [hydrated, step, state.projectId]);

  const goTo = (next: 1 | 2 | 3 | 4) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const handleStateChange = (patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const handleCancel = () => {
    if (state.projectId || step > 1 || Object.keys(state).length > 0) {
      setShowCancelDialog(true);
    } else {
      router.push('/projects');
    }
  };

  const handleConfirmCancel = () => {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
    router.push('/projects');
  };

  if (!hydrated) return null;

  const stepContent = [
    <StepBasics
      key={1}
      state={state}
      onNext={() => goTo(2)}
      onStateChange={handleStateChange}
    />,
    state.projectId ? (
      <StepPatternsUpload
        key={2}
        projectId={state.projectId}
        onNext={() => goTo(3)}
        onBack={() => goTo(1)}
        onFileUploaded={(fileId) => handleStateChange({ patternsFileId: fileId })}
      />
    ) : null,
    state.projectId ? (
      <StepBrandUpload
        key={3}
        projectId={state.projectId}
        onNext={() => goTo(4)}
        onBack={() => goTo(2)}
        onFileUploaded={(fileId) => handleStateChange({ brandFileId: fileId })}
      />
    ) : null,
    <StepConfirm key={4} state={state} onBack={() => goTo(3)} />,
  ];

  return (
    <>
      <div className="flex min-h-screen">
        <aside className="hidden md:flex w-72 flex-col border-r border-border p-8 gap-8 shrink-0">
          <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            Nuevo proyecto
          </div>

          <nav className="flex flex-col gap-4 mt-4" aria-label="Pasos del wizard">
            {STEPS.map((s, i) => {
              const stepNum = i + 1;
              const isDone = stepNum < step;
              const isActive = stepNum === step;
              return (
                <div
                  key={i}
                  aria-current={isActive ? 'step' : undefined}
                  className={`flex items-center gap-3 text-sm transition-colors ${
                    isActive
                      ? 'text-foreground font-semibold'
                      : isDone
                      ? 'text-[var(--accent)]'
                      : 'text-muted-foreground'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                      isDone
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-black'
                        : isActive
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-muted-foreground/40 text-muted-foreground'
                    }`}
                  >
                    {isDone ? '✓' : s.number}
                  </div>
                  {s.label}
                </div>
              );
            })}
          </nav>

          <div className="mt-auto">
            <div className="text-xs text-muted-foreground">
              Paso {step} de {STEPS.length}
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(step / STEPS.length) * 100}%`,
                  backgroundColor: 'var(--accent)',
                }}
              />
            </div>
          </div>
        </aside>

        <main className="flex-1 relative overflow-hidden flex flex-col">
          <div
            className="md:hidden px-6 pt-6 shrink-0 flex flex-col gap-2"
            role="status"
            aria-label={`Paso ${step} de ${STEPS.length}: ${STEPS[step - 1]?.label ?? ''}`}
          >
            <div className="flex items-center justify-between">
              <select
                value={step}
                onChange={(e) => {
                  const next = parseInt(e.target.value);
                  if (next < step) {
                    setDirection(-1);
                    setStep(next as 1 | 2 | 3 | 4);
                  }
                }}
                className="text-sm font-medium bg-transparent border border-border rounded px-2 py-1 text-foreground"
              >
                {STEPS.map((s, i) => (
                  <option key={i} value={i + 1} disabled={i + 1 > step}>
                    {i + 1 < step ? '✓ ' : i + 1 === step ? '▶ ' : ''}{s.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">{step} / {STEPS.length}</span>
            </div>
            <div className="h-1 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(step / STEPS.length) * 100}%`,
                  backgroundColor: 'var(--accent)',
                }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="absolute inset-0 flex items-center justify-center p-6 md:p-12 overflow-y-auto"
            >
              <div className="w-full max-w-lg">{stepContent[step - 1]}</div>
            </motion.div>
          </AnimatePresence>

          {step !== 4 && (
            <div className="shrink-0 flex items-center justify-between px-6 md:px-12 pb-6 pt-2 border-t border-border mt-auto relative z-10 bg-background/80 backdrop-blur-sm">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                Cancelar
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={step === 1}
                  onClick={() => goTo((step - 1) as 1 | 2 | 3 | 4)}
                >
                  ← Atrás
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="shrink-0 flex items-center px-6 md:px-12 pb-6 pt-2 border-t border-border mt-auto relative z-10 bg-background/80 backdrop-blur-sm">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                Cancelar
              </Button>
            </div>
          )}
        </main>
      </div>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar la creación?</DialogTitle>
            <DialogDescription>
              Ya se creó el proyecto. Si cancelás ahora va a quedar en tu lista sin archivos subidos.
              Podés retomarlo después.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCancelDialog(false)}>
              Seguir editando
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel}>
              Cancelar de todas formas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
