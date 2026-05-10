'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { OnboardingProfile } from '@/server/onboarding/queries';
import { StepWelcome } from './_steps/step-welcome';
import { StepBrand } from './_steps/step-brand';
import { StepVoice } from './_steps/step-voice';
import { StepFirstVideo } from './_steps/step-first-video';
import { StepVisualStyle } from './_steps/step-visual-style';

const STEPS = [
  { label: 'Bienvenida', number: 1 },
  { label: 'Tu marca', number: 2 },
  { label: 'Estilo visual', number: 3 },
  { label: 'Tu voz', number: 4 },
  { label: 'Tu primer video', number: 5 },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

interface Props {
  initialStep: number;
  profile: OnboardingProfile | null;
}

export function OnboardingWizard({ initialStep, profile }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStep = searchParams.get('step');
  const [step, setStep] = useState(urlStep !== null ? parseInt(urlStep, 10) : initialStep);
  const [direction, setDirection] = useState(1);

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', String(next));
    router.replace(`/onboarding?${params.toString()}`, { scroll: false });
  };

  const stepContent = [
    <StepWelcome key={0} onNext={() => goTo(1)} />,
    <StepBrand key={1} profile={profile} onNext={() => goTo(2)} onBack={() => goTo(0)} />,
    <StepVisualStyle key={2} profile={profile} onNext={() => goTo(3)} onBack={() => goTo(1)} />,
    <StepVoice key={3} profile={profile} onNext={() => goTo(4)} onBack={() => goTo(2)} />,
    <StepFirstVideo key={4} profile={profile} onBack={() => goTo(3)} />,
  ];

  return (
    <div className="flex min-h-screen">
      {/* Progress sidebar */}
      <aside className="hidden md:flex w-72 flex-col border-r border-border p-8 gap-8 shrink-0">
        <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
          Virus
        </div>

        <nav className="flex flex-col gap-4 mt-4">
          {STEPS.map((s, i) => {
            const isDone = i < step;
            const isActive = i === step;
            return (
              <div
                key={i}
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
            Paso {step + 1} de {STEPS.length}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${((step + 1) / STEPS.length) * 100}%`,
                backgroundColor: 'var(--accent)',
              }}
            />
          </div>
        </div>
      </aside>

      {/* Step content */}
      <main className="flex-1 relative overflow-hidden">
        {/* Mobile progress */}
        <div className="md:hidden px-6 pt-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              Virus
            </span>
            <span className="text-xs text-muted-foreground">
              {step + 1} / {STEPS.length}
            </span>
          </div>
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${((step + 1) / STEPS.length) * 100}%`,
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
            <div className="w-full max-w-lg">{stepContent[step]}</div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
