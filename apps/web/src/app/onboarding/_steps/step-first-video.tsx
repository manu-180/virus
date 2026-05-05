'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Rocket, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OnboardingProfile } from '@/server/onboarding/queries';
import {
  generateStarterIdeas,
  completeOnboarding,
  type StarterIdea,
} from '@/server/onboarding/actions';

interface Props {
  profile: OnboardingProfile | null;
  onBack: () => void;
}

export function StepFirstVideo({ onBack }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ideas, setIdeas] = useState<StarterIdea[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const handleGenerateIdeas = () => {
    startTransition(async () => {
      const result = await generateStarterIdeas();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setIdeas(result.data);
    });
  };

  const handleComplete = () => {
    if (selected === null || !ideas) return;
    startTransition(async () => {
      const result = await completeOnboarding(ideas[selected]!);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push('/dashboard?tour=true');
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">Tu primer video</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Elegí una idea y lo lanzamos ahora.
        </p>
      </div>

      {!ideas ? (
        <div className="flex flex-col items-center gap-6 py-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(62,207,142,0.12)' }}
          >
            <Sparkles size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold">Generemos tu primer video</p>
            <p className="text-sm text-muted-foreground mt-1">
              Vamos a sugerir 3 ideas basadas en tu marca.
            </p>
          </div>
          <Button size="lg" onClick={handleGenerateIdeas} disabled={isPending}>
            {isPending ? 'Generando ideas...' : 'Generar ideas →'}
          </Button>
        </div>
      ) : (
        <AnimatePresence>
          <div className="flex flex-col gap-3">
            {ideas.map((idea, i) => (
              <motion.button
                key={i}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => setSelected(i)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  selected === i
                    ? 'border-[var(--accent)] bg-[rgba(62,207,142,0.05)]'
                    : 'border-border hover:border-muted-foreground/40 bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1.5">
                    <p className="font-semibold text-sm leading-snug">{idea.hookText}</p>
                    <p className="text-xs text-muted-foreground">{idea.angle}</p>
                    <Badge variant="outline" className="w-fit text-[10px]">
                      {idea.format}
                    </Badge>
                  </div>
                  {selected === i && (
                    <ChevronRight
                      size={16}
                      className="shrink-0 mt-0.5"
                      style={{ color: 'var(--accent)' }}
                    />
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </AnimatePresence>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
          ← Atrás
        </Button>
        {ideas && (
          <Button
            className="flex-1"
            onClick={handleComplete}
            disabled={selected === null || isPending}
          >
            <Rocket size={15} className="mr-2" />
            {isPending ? 'Lanzando...' : 'Lanzar mi primer video'}
          </Button>
        )}
      </div>
    </div>
  );
}
