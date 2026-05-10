'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingProfile } from '@/server/onboarding/queries';

type Preset = 'minimal' | 'bold' | 'editorial';

interface Props {
  profile: OnboardingProfile | null;
  onNext: () => void;
  onBack: () => void;
}

const PRESETS: Preset[] = ['minimal', 'bold', 'editorial'];

export function StepVisualStyle({ profile: _profile, onNext, onBack }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<Preset>('minimal');
  const [showCustomize, setShowCustomize] = useState(false);
  const [accentColor, setAccentColor] = useState('');
  const [fontPreference, setFontPreference] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (preset: Preset) => {
    startTransition(async () => {
      const res = await fetch('/api/onboarding/visual-style', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultPreset: preset,
          accentColor: accentColor || undefined,
          fontPreference: fontPreference || undefined,
        }),
      });
      if (!res.ok) {
        toast.error('No se pudo guardar el estilo visual');
        return;
      }
      onNext();
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">Estilo visual</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Elegí el look base de tus carruseles. Podés cambiarlo en cada creación.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PRESETS.map((preset) => {
          const isActive = selectedPreset === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setSelectedPreset(preset)}
              disabled={isPending}
              className={[
                'flex flex-col items-center gap-2 rounded-lg border p-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'ring-2 ring-accent border-accent'
                  : 'border-border hover:border-accent/50',
              ].join(' ')}
            >
              <div className="w-full overflow-hidden rounded-md">
                <Image
                  src={`/carousel-presets/${preset}.png`}
                  alt={`Preset ${preset}`}
                  width={240}
                  height={320}
                  className="w-full object-cover"
                  style={{ aspectRatio: '3/4' }}
                />
              </div>
              <span className="text-sm font-medium capitalize">{preset}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowCustomize((prev) => !prev)}
          disabled={isPending}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <Palette className="h-4 w-4" />
          Personalizar
          {showCustomize ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showCustomize && (
          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="accent-color">Color acento</Label>
              <div className="flex items-center gap-3">
                <input
                  id="accent-color"
                  type="color"
                  value={accentColor || '#E63946'}
                  onChange={(e) => setAccentColor(e.target.value)}
                  disabled={isPending}
                  className="h-10 w-16 cursor-pointer rounded-md border border-border bg-transparent p-1"
                />
                <span className="text-sm text-muted-foreground">
                  {accentColor || '#E63946'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="font-preference">Fuente preferida</Label>
              <Input
                id="font-preference"
                type="text"
                placeholder="Ej: Inter, Playfair Display"
                value={fontPreference}
                onChange={(e) => setFontPreference(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => handleSubmit('minimal')}
          disabled={isPending}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          Saltear por ahora
        </button>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isPending}
        >
          ← Atrás
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={() => handleSubmit(selectedPreset)}
          disabled={isPending}
        >
          Guardar y continuar →
        </Button>
      </div>
    </div>
  );
}
