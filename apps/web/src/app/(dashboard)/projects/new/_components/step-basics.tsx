'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createProject } from '@/server/projects/actions';
import type { WizardState } from './wizard';

const NICHE_SUGGESTIONS = ['dev', 'chatbot', 'education', 'fitness', 'ecommerce', 'marketing', 'finance', 'lifestyle', 'health'];

const FormSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  niche: z.string().min(2).max(50),
  language: z.string().min(1),
  themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  voiceCloneId: z.string().optional(),
});

type FormData = z.infer<typeof FormSchema>;

const LANGUAGES = [
  { value: 'es-AR', label: 'Español (Argentina)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
];

const THEME_COLORS = [
  '#3ECF8E',
  '#0175C2',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
];

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken';

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

interface Props {
  state: WizardState;
  onNext: () => void;
  onStateChange: (patch: Partial<WizardState>) => void;
}

export function StepBasics({ state, onNext, onStateChange }: Props) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: state.basics?.name ?? '',
      slug: state.basics?.slug ?? '',
      description: state.basics?.description ?? '',
      niche: state.basics?.niche ?? '',
      language: state.basics?.language ?? 'es-AR',
      themeColor: state.basics?.themeColor ?? '#0175C2',
      voiceCloneId: state.basics?.voiceCloneId ?? '',
    },
  });

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const watchedName = watch('name');
  const watchedSlug = watch('slug');
  const watchedThemeColor = watch('themeColor');

  useEffect(() => {
    if (!slugManuallyEdited && watchedName) {
      const derived = deriveSlug(watchedName);
      if (derived.length >= 2) {
        setValue('slug', derived, { shouldValidate: false });
      }
    }
  }, [watchedName, slugManuallyEdited, setValue]);

  useEffect(() => {
    const slug = watchedSlug;
    if (!slug || slug.length < 2) {
      setSlugStatus('idle');
      return;
    }
    if (state.projectId) {
      setSlugStatus('available');
      return;
    }
    setSlugStatus('checking');
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    slugDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) { setSlugStatus('idle'); return; }
        const json = (await res.json()) as { available: boolean };
        setSlugStatus(json.available ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 500);
    return () => {
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    };
  }, [watchedSlug, state.projectId]);

  const onSubmit = (data: FormData) => {
    if (state.projectId) {
      const basics: WizardState['basics'] = {
        name: data.name,
        slug: data.slug,
        niche: data.niche,
        language: data.language,
        themeColor: data.themeColor,
      };
      if (data.description) basics.description = data.description;
      if (data.voiceCloneId) basics.voiceCloneId = data.voiceCloneId;
      onStateChange({ ...state, basics });
      onNext();
      return;
    }
    startTransition(async () => {
      const result = await createProject({
        name: data.name,
        slug: data.slug,
        description: data.description,
        niche: data.niche,
        language: data.language,
        themeColor: data.themeColor,
        voiceCloneId: data.voiceCloneId,
      });
      if (!result.ok) {
        if (result.error.code === 'SLUG_TAKEN') {
          setError('slug', { message: 'Slug ya en uso' });
        } else {
          toast.error(result.error.message);
        }
        return;
      }
      const project = result.data as { id: string; slug: string };
      const basics: WizardState['basics'] = {
        name: data.name,
        slug: data.slug,
        niche: data.niche,
        language: data.language,
        themeColor: data.themeColor,
      };
      if (data.description) basics.description = data.description;
      if (data.voiceCloneId) basics.voiceCloneId = data.voiceCloneId;
      onStateChange({
        projectId: project.id,
        projectSlug: project.slug,
        basics,
      });
      onNext();
    });
  };

  const nameRegister = register('name');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">Datos del proyecto</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Nombre, nicho y configuración básica de tu proyecto.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre del proyecto</Label>
        <Input
          id="name"
          placeholder="APEX — Servicios de software"
          {...nameRegister}
          ref={(el) => {
            nameRegister.ref(el);
            (nameInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          }}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="slug">Slug</Label>
        <div className="relative">
          <Input
            id="slug"
            placeholder="apex-servicios"
            {...register('slug', {
              onChange: () => setSlugManuallyEdited(true),
            })}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs flex items-center">
            {slugStatus === 'checking' && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            )}
            {slugStatus === 'available' && (
              <span className="text-emerald-500">✓ Disponible</span>
            )}
            {slugStatus === 'taken' && (
              <span className="text-destructive">✗ En uso</span>
            )}
          </span>
        </div>
        {errors.slug && (
          <p className="text-xs text-destructive">{errors.slug.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Textarea
          id="description"
          placeholder="Breve descripción del proyecto..."
          maxLength={500}
          {...register('description')}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="niche">Nicho</Label>
        <Input
          id="niche"
          list="niche-suggestions"
          placeholder="dev, chatbot, education..."
          {...register('niche')}
        />
        <datalist id="niche-suggestions">
          {NICHE_SUGGESTIONS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {errors.niche && (
          <p className="text-xs text-destructive">{errors.niche.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Idioma</Label>
        <Controller
          name="language"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
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

      <div className="flex flex-col gap-2">
        <Label>Color del tema</Label>
        <div className="flex items-center gap-3 flex-wrap">
          {THEME_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              onClick={() => setValue('themeColor', color, { shouldValidate: true })}
              className="size-7 rounded-full border-2 transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              style={{
                backgroundColor: color,
                borderColor: watchedThemeColor === color ? 'white' : 'transparent',
                boxShadow: watchedThemeColor === color ? `0 0 0 2px ${color}` : 'none',
              }}
            />
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="color"
              aria-label="Color personalizado"
              value={watchedThemeColor}
              onChange={(e) => setValue('themeColor', e.target.value, { shouldValidate: true })}
              className="w-9 h-9 rounded cursor-pointer border border-border bg-transparent p-0.5"
            />
            <Input
              value={watchedThemeColor}
              onChange={(e) => {
                const v = e.target.value;
                setValue('themeColor', v, { shouldValidate: /^#[0-9A-Fa-f]{6}$/.test(v) });
              }}
              className="w-28 font-mono text-sm"
              placeholder="#000000"
              maxLength={7}
            />
          </div>
        </div>
        {errors.themeColor && (
          <p className="text-xs text-destructive">{errors.themeColor.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="voiceCloneId">Voice Clone ID (ElevenLabs)</Label>
        <Input
          id="voiceCloneId"
          list="voice-suggestions"
          placeholder="Opcional — pegá tu voice ID de ElevenLabs"
          {...register('voiceCloneId')}
        />
        <datalist id="voice-suggestions">{/* populated by future ElevenLabs integration */}</datalist>
        <p className="text-xs text-muted-foreground">
          (podés completarlo después en Settings)
        </p>
      </div>

      <div className="pt-2">
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creando proyecto...
            </>
          ) : (
            'Siguiente →'
          )}
        </Button>
      </div>
    </form>
  );
}
