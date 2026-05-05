'use client';

import { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import type { OnboardingProfile } from '@/server/onboarding/queries';
import { saveBrandStep } from '@/server/onboarding/actions';

const schema = z.object({
  handle: z.string().min(2, 'Mínimo 2 caracteres').max(40),
  language: z.string().min(1, 'Elegí un idioma'),
  audience: z.string().min(10, 'Describí brevemente tu audiencia'),
  topics: z.array(z.string()).min(1, 'Agregá al menos un tema'),
  educational: z.number().min(0).max(100),
  promotional: z.number().min(0).max(100),
  personal: z.number().min(0).max(100),
});

type FormData = z.infer<typeof schema>;

const TOPIC_SUGGESTIONS = [
  'Desarrollo web',
  'Flutter',
  'Python',
  'Inteligencia artificial',
  'Marketing digital',
  'Finanzas personales',
  'Diseño UX',
  'Emprendimiento',
  'Productividad',
  'Fitness',
  'Cocina',
  'Fotografía',
];

const LANGUAGES = [
  { value: 'es-AR', label: 'Español (Argentina)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
];

interface Props {
  profile: OnboardingProfile | null;
  onNext: () => void;
  onBack: () => void;
}

export function StepBrand({ profile, onNext, onBack }: Props) {
  const brandVoice = (profile?.brand_voice ?? {}) as {
    audience?: string;
    topics?: string[];
    contentMix?: { educational: number; promotional: number; personal: number };
  };

  const [customTopicInput, setCustomTopicInput] = useState('');
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      handle: profile?.handle ?? '',
      language: profile?.default_language ?? 'es-AR',
      audience: brandVoice.audience ?? '',
      topics: brandVoice.topics ?? [],
      educational: brandVoice.contentMix?.educational ?? 60,
      promotional: brandVoice.contentMix?.promotional ?? 30,
      personal: brandVoice.contentMix?.personal ?? 10,
    },
  });

  const [educational, promotional, personal, topics] = watch([
    'educational',
    'promotional',
    'personal',
    'topics',
  ]);
  const mixSum = educational + promotional + personal;
  const mixValid = mixSum === 100;

  const toggleTopic = (topic: string) => {
    const current = topics ?? [];
    const next = current.includes(topic)
      ? current.filter((t) => t !== topic)
      : current.length < 5
      ? [...current, topic]
      : current;
    setValue('topics', next, { shouldValidate: true });
  };

  const addCustomTopic = () => {
    const trimmed = customTopicInput.trim();
    if (!trimmed || topics.includes(trimmed) || topics.length >= 5) return;
    setValue('topics', [...topics, trimmed], { shouldValidate: true });
    setCustomTopicInput('');
  };

  const onSubmit = (data: FormData) => {
    if (!mixValid) return;
    startTransition(async () => {
      const result = await saveBrandStep({
        handle: data.handle,
        language: data.language,
        audience: data.audience,
        topics: data.topics,
        contentMix: {
          educational: data.educational,
          promotional: data.promotional,
          personal: data.personal,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onNext();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold">Tu marca personal</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Esta info guía cada idea que generamos para vos.
        </p>
      </div>

      {/* Handle */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handle">Tu handle / nombre</Label>
        <Input id="handle" placeholder="@manu.dev" {...register('handle')} />
        {errors.handle && (
          <p className="text-xs text-destructive">{errors.handle.message}</p>
        )}
      </div>

      {/* Language */}
      <div className="flex flex-col gap-1.5">
        <Label>Idioma de tus videos</Label>
        <Controller
          name="language"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí un idioma" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Audience */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audience">¿A quién le hablás?</Label>
        <Input
          id="audience"
          placeholder="Desarrolladores que aprenden Flutter..."
          {...register('audience')}
        />
        {errors.audience && (
          <p className="text-xs text-destructive">{errors.audience.message}</p>
        )}
      </div>

      {/* Content mix sliders */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Mix de contenido</Label>
          <span
            className={`text-xs font-mono ${mixValid ? 'text-[var(--accent)]' : 'text-destructive'}`}
          >
            {mixSum}% {mixValid ? '✓' : `(faltan ${100 - mixSum}%)`}
          </span>
        </div>

        {(
          [
            { name: 'educational', label: 'Educativo' },
            { name: 'promotional', label: 'Promocional' },
            { name: 'personal', label: 'Personal' },
          ] as const
        ).map(({ name, label }) => (
          <Controller
            key={name}
            name={name}
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[field.value]}
                  onValueChange={(value) => {
                    const v = Array.isArray(value) ? value[0] : value;
                    field.onChange(v);
                  }}
                  className="flex-1"
                />
                <span className="text-sm font-mono w-10 text-right shrink-0">
                  {field.value}%
                </span>
              </div>
            )}
          />
        ))}
      </div>

      {/* Topics */}
      <div className="flex flex-col gap-2">
        <Label>Temas favoritos (máx 5)</Label>
        <div className="flex flex-wrap gap-2">
          {TOPIC_SUGGESTIONS.map((t) => (
            <Badge
              key={t}
              variant={topics?.includes(t) ? 'default' : 'outline'}
              className="cursor-pointer select-none transition-colors"
              onClick={() => toggleTopic(t)}
            >
              {t}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="Otro tema..."
            value={customTopicInput}
            onChange={(e) => setCustomTopicInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTopic();
              }
            }}
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustomTopic}>
            + Agregar
          </Button>
        </div>
        {errors.topics && (
          <p className="text-xs text-destructive">{errors.topics.message}</p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
          ← Atrás
        </Button>
        <Button type="submit" className="flex-1" disabled={isPending || !mixValid}>
          {isPending ? 'Guardando...' : 'Siguiente →'}
        </Button>
      </div>
    </form>
  );
}
