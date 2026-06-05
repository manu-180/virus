'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CarouselBriefSchema, CreateCarouselSchema } from '@/lib/validators/carousels';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { estimateCarouselCost } from '@virus/shared/carousel/cost';
import type { ProjectListItem } from '@/server/projects/types';
import type { CarouselTopicItem, ProjectTopicsResponse } from '@/server/topics/types';
import { TopicCombobox } from './TopicCombobox';
import { UsageBadge } from './UsageBadge';

// ---------------------------------------------------------------------------
// Form schema — flattened from shared validators to avoid drift
// ---------------------------------------------------------------------------

const FormSchema = CarouselBriefSchema.merge(
  z.object({
    projectId: CreateCarouselSchema.shape.projectId,
  })
);

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

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));

  // Topic seleccionado del combobox (vive aparte del form). Se manda como
  // `selectedTopicId` al POST. El server lo usa para linkear variantes
  // editadas con su seed original (parent_topic_id). Se resetea al cambiar
  // de proyecto porque los topics son por proyecto.
  const [selectedTopic, setSelectedTopic] = useState<CarouselTopicItem | null>(null);

  // Mapa de uso (angle/tone) por proyecto activo — alimenta los UsageBadge
  // de los selects.
  const [usage, setUsage] = useState<ProjectTopicsResponse['usage']>({ angle: {}, tone: {} });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      projectId: sortedProjects[0]?.id ?? '',
      topic: '',
      angle: 'educational',
      tone: 'direct',
      audience: '',
      slideCount: 8,
      language: 'es',
      cta: '',
    },
  });

  const watchedProjectId = watch('projectId');
  const watchedSlideCount = watch('slideCount');

  // Pre-fill audience + CTA from project brand when project changes
  useEffect(() => {
    if (!watchedProjectId) return;

    // Reset selected topic — los topics son por proyecto.
    setSelectedTopic(null);

    const controller = new AbortController();

    fetch(`/api/projects/${watchedProjectId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.brand) return;
        if (data.brand.audience?.who) {
          setValue('audience', data.brand.audience.who);
        }
        // Only set CTA if currently empty (read live value to avoid stale closure)
        if (!getValues('cta') && data.brand.ctas?.[0]) {
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
            // Hint para el server: si el title todavía coincide con el
            // topic seleccionado → bump al original. Si difiere → crea
            // variante con parent_topic_id apuntando a este id.
            selectedTopicId: selectedTopic?.id ?? null,
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

        const json = await res.json() as Record<string, unknown>;
        if (typeof json.carouselId !== 'string') {
          toast.error('Respuesta inesperada del servidor.');
          return;
        }
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
                    <SelectValue placeholder="Elegí un proyecto">
                      {(value) =>
                        sortedProjects.find((p) => p.id === value)?.name ?? 'Elegí un proyecto'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sortedProjects.map((p) => (
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

          {/* Topic — combobox con banco curado por proyecto */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">Tema del carrusel</Label>
            <Controller
              name="topic"
              control={control}
              render={({ field }) => (
                <TopicCombobox
                  projectId={watchedProjectId}
                  value={field.value}
                  onChange={field.onChange}
                  onSelectTopic={setSelectedTopic}
                  onUsageLoaded={setUsage}
                  errorMessage={errors.topic?.message}
                />
              )}
            />
          </div>

          {/* Angle + Tone (side by side on wider screens) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Angle */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="angle">Ángulo</Label>
              <Controller
                name="angle"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="angle" className="w-full">
                      <SelectValue placeholder="Elegí un ángulo">
                        {(value) => ANGLES.find((a) => a.value === value)?.label ?? 'Elegí un ángulo'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ANGLES.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          <span className="flex items-center gap-2 w-full">
                            <span className="flex-1">{a.label}</span>
                            <UsageBadge count={usage.angle[a.value]} />
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.angle && (
                <p className="text-xs text-destructive">{errors.angle.message}</p>
              )}
            </div>

            {/* Tone */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tone">Tono</Label>
              <Controller
                name="tone"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="tone" className="w-full">
                      <SelectValue placeholder="Elegí un tono">
                        {(value) => TONES.find((t) => t.value === value)?.label ?? 'Elegí un tono'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2 w-full">
                            <span className="flex-1">{t.label}</span>
                            <UsageBadge count={usage.tone[t.value]} />
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.tone && (
                <p className="text-xs text-destructive">{errors.tone.message}</p>
              )}
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
                  onValueChange={(value) => {
                    const v = Array.isArray(value) ? value[0] : value;
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
            {errors.slideCount && (
              <p className="text-xs text-destructive">{errors.slideCount.message}</p>
            )}
          </div>

          {/* Estilo — automático (rota en cada carrusel) */}
          <div className="flex flex-col gap-1.5">
            <Label>Estilo</Label>
            <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
              <span className="inline-flex size-2 shrink-0 rounded-full bg-[#C8FF57]" />
              <p className="text-sm text-muted-foreground leading-snug">
                Automático — el diseño rota solo en cada carrusel para que tu feed no quede monótono.
              </p>
            </div>
          </div>

          {/* Language + CTA (side by side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Language */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">Idioma</Label>
              <Controller
                name="language"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="language" className="w-full">
                      <SelectValue placeholder="Elegí un idioma">
                        {(value) => (value === 'en' ? 'English' : value === 'es' ? 'Español' : 'Elegí un idioma')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.language && (
                <p className="text-xs text-destructive">{errors.language.message}</p>
              )}
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
