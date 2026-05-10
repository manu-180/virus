'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Preset = 'minimal' | 'bold' | 'editorial';

const PRESETS: Preset[] = ['minimal', 'bold', 'editorial'];

export default function VisualStyleSettingsClient() {
  const [selectedPreset, setSelectedPreset] = useState<Preset>('minimal');
  const [showCustomize, setShowCustomize] = useState(false);
  const [accentColor, setAccentColor] = useState('');
  const [fontPreference, setFontPreference] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const res = await fetch('/api/onboarding/visual-style', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultPreset: selectedPreset,
          accentColor: accentColor || undefined,
          fontPreference: fontPreference || undefined,
        }),
      });
      if (!res.ok) {
        toast.error('No se pudo guardar');
        return;
      }
      toast.success('Preferencias guardadas');
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Estilo visual de carruseles</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Este preset se aplica por defecto cuando creás un carrusel nuevo.
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

      <Button onClick={handleSave} disabled={isPending} className="w-fit">
        {isPending ? 'Guardando...' : 'Guardar preferencias'}
      </Button>
    </div>
  );
}
