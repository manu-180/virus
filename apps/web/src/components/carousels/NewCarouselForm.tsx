'use client';

import { useEffect, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { carousel } from '@virus/shared';
import type { ProjectListItem } from '@/server/projects/types';

const { estimateCarouselCost } = carousel;

// ---------------------------------------------------------------------------
// Form schema (flattened for the form, then remapped on submit)
// ---------------------------------------------------------------------------

const FormSchema = z.object({
  projectId: z.string().uuid('Seleccioná un proyecto'),
  topic: z.string().min(3, 'Mínimo 3 caracteres').max(500),
  angle: z.enum(['educational', 'contrarian', 'story-arc', 'before-after', 'listicle']),
  tone: z.enum(['direct', 'authoritative', 'casual', 'contrarian']),
  audience: z.string().max(200).optional(),
  slideCount: z.number().int().min(3).max(10),
  stylePreset: z.enum(['minimal', 'bold', 'editorial']),
  language: z.enum(['es', 'en']),
  cta: z.string().max(200).optional(),
});

type FormData = z.infer<typeof FormSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANGLES: { value: FormData['angle']; label: string }[] = [
  { value: 'educational', label: 'Educativo' },
  { value: 'contrarian', label: 'Contrarian' },
  { value: 'story-arc', label: 'Historia' },
  { value: 'before-after', label: 'Antes / Después' },
  { value: 'listicle', label: 'Listicle' },
];

const TONES: { value: FormData['tone']; label: string }[] = [
  { value: 'direct', label: 'Directo' },
  { value: 'authoritative', label: 'Autoritativo' },
  { value: 'casual', label: 'Casual' },
  { value: 'contrarian', label: 'Contrarian' },
];

const PRESETS: { value: FormData['stylePreset']; label: string; description: string }[] = [
  { value: 'minimal', label: 'Minimal', description: 'Fondo claro, tipografía limpia' },
  { value: 'bold', label: 'Bold', description: 'Oscuro con acento fuerte' },
  { value: 'editorial', label: 'Editorial', description: 'Cálido, estilo revista' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  projects: ProjectListItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewCarouselForm({ projects }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      projectId: projects[0]?.id ?? '',
      topic: '',
      angle: 'educational',
      tone: 'direct',
      audience: '',
      slideCount: 8,
      stylePreset: 'bold',
      language: 'es',
      cta: '',
    },
  });

  const watchedProjectId = watch('projectId');
  const watchedSlideCount = watch('slideCount');
  const watchedStylePreset = watch('stylePreset');
  const watchedCta = watch('cta');

  // Pre-fill audience + CTA from project brand when project changes
  useEffect(() => {
    if (!watchedProjectId) return;

    const controller = new AbortController();

    fetch(`/api/projects/${watchedProjectId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.brand) return;
        if (data.brand.audience?.who) {
          setValue('audience', data.brand.audience.who);
        }
        // Only set CTA if currently empty
        if (!watchedCta && data.brand.ctas?.[0]) {
          setValue('cta', data.brand.ctas[0]);
        }
      })
      .catch(() => {
        // silently ignore — abort or network error
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedProjectId, setValue]);

  // Cost estimation
  const cost = estimateCarouselCost(watchedSlideCount);

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/carousels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: data.projectId,
            stylePreset: data.stylePreset,
            brief: {
              topic: data.topic,
              angle: data.angle,
              tone: data.tone,
              audience: data.audience,
              slideCount: data.slideCount,
              language: data.language,
              cta: data.cta,
            },
          }),
        });

        if (!res.ok) {
          toast.error('Error al crear el carrusel. Intentá de nuevo.');
          return;
        }

        const json = (await res.json()) as { carouselId: string };
        router.push(`/dashboard/carousels/${json.carouselId}`);
      } catch {
        toast.error('Error al crear el carrusel. Intentá de nuevo.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-8 items-start">
        {/* ------------------------------------------------------------------ */}
        {/* Left column — form fields                                           */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col gap-6">

          {/* Project */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="projectId">Proyecto</Label>
            <Controller
              name="projectId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="projectId" className="w-full">
                    <SelectValue placeholder="Elegí un proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.projectId && (
              <p className="text-xs text-destructive">{errors.projectId.message}</p>
            )}
          </div>

          {/* Topic */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">Tema del carrusel</Label>
            <Textarea
              id="topic"
              rows={3}
              placeholder="Ej: 5 errores que hacen que tu sitio web no venda"
              {...register('topic')}
            />
            {errors.topic && (
              <p className="text-xs text-destructive">{errors.topic.message}</p>
            )}
          </div>

          {/* Angle + Tone (side by side on wider screens) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Angle */}
            <div className="flex flex-col gap-1.5">
              <Label>Ángulo</Label>
              <Controller
                name="angle"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elegí un ángulo" />
                    </SelectTrigger>
                    <SelectContent>
                      {ANGLES.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Tone */}
            <div className="flex flex-col gap-1.5">
              <Label>Tono</Label>
              <Controller
                name="tone"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elegí un tono" />
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Audience */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audience">
              Audiencia{' '}
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="audience"
              placeholder="Ej: Founders de SaaS latinoamericanos"
              {...register('audience')}
            />
            {errors.audience && (
              <p className="text-xs text-destructive">{errors.audience.message}</p>
            )}
          </div>

          {/* Slide count */}
          <div className="flex flex-col gap-3">
            <Label>Slides: {watchedSlideCount}</Label>
            <Controller
              name="slideCount"
              control={control}
              render={({ field }) => (
                <Slider
                  min={3}
                  max={10}
                  step={1}
                  value={[field.value]}
                  onValueChange={(vals) => {
                    const v = Array.isArray(vals) ? vals[0] : vals;
                    field.onChange(v);
                  }}
                  aria-label="Cantidad de slides"
                />
              )}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>3</span>
              <span>10</span>
            </div>
          </div>

          {/* Style preset */}
          <div className="flex flex-col gap-2">
            <Label>Estilo</Label>
            <div className="grid grid-cols-3 gap-3">
              {PRESETS.map((preset) => {
                const isSelected = watchedStylePreset === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setValue('stylePreset', preset.value, { shouldValidate: true })}
                    className={[
                      'flex flex-col rounded-xl overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isSelected
                        ? 'border-[#C8FF57] ring-2 ring-[#C8FF57]/30'
                        : 'border-border hover:border-foreground/30',
                    ].join(' ')}
                    aria-pressed={isSelected}
                    aria-label={`Estilo ${preset.label}`}
                  >
                    <div className="relative w-full aspect-[5/3] overflow-hidden">
                      <Image
                        src={`/carousel-presets/${preset.value}.png`}
                        alt={preset.label}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 33vw, 160px"
                      />
                    </div>
                    <div className="px-2 py-2 bg-card text-left">
                      <p className="text-sm font-medium leading-snug">{preset.label}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.stylePreset && (
              <p className="text-xs text-destructive">{errors.stylePreset.message}</p>
            )}
          </div>

          {/* Language + CTA (side by side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Language */}
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
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* CTA */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cta">
                CTA{' '}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="cta"
                placeholder="Ej: DM 'WEB' para auditoría gratis"
                {...register('cta')}
              />
              {errors.cta && (
                <p className="text-xs text-destructive">{errors.cta.message}</p>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <Button
              type="submit"
              className="w-full bg-[#C8FF57] text-[#111318] hover:bg-[#d4ff6e] font-semibold"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Generando carrusel...
                </>
              ) : (
                'Generar carrusel'
              )}
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Right column — cost estimator                                       */}
        {/* ------------------------------------------------------------------ */}
        <div className="md:sticky md:top-8">
          <Card className="bg-card/50 border-border/60">
            <CardContent className="pt-5 flex flex-col gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                  Estimación de costo
                </p>
                <p className="text-2xl font-bold text-white">
                  ${cost.total.toFixed(4)}{' '}
                  <span className="text-sm font-normal text-muted-foreground">USD</span>
                </p>
              </div>

              <div className="flex flex-col gap-2 text-sm border-t border-border/40 pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Imágenes</span>
                  <span className="font-mono">${cost.images.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Texto (IA)</span>
                  <span className="font-mono">${cost.text.toFixed(4)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-t border-border/40 pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tiempo estimado</span>
                  <span>60–90 seg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Slides</span>
                  <span>{watchedSlideCount}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Los costos son estimados antes de llamar a las APIs externas. El total real puede
                variar levemente.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
