'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, X, Plus, Info, Camera as Instagram } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

import { ScheduleConfigSchema, type ScheduleConfig } from '@/lib/zod/profile-schemas';
import type { Profile } from '@/server/profile/types';
import { saveScheduleConfig } from '@/server/profile/actions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Frequency = ScheduleConfig['frequency'];

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: '1/day',    label: '1 por día' },
  { value: '1/2days',  label: 'Cada 2 días' },
  { value: '1/3days',  label: 'Cada 3 días' },
  { value: 'manual',   label: 'Manual' },
];

const DAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
] as const;

const DEFAULT_VALUES: ScheduleConfig = {
  frequency: '1/day',
  preferredTimes: ['09:00', '19:00'],
  daysOff: [],
  platforms: ['instagram'],
  autoPublish: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmptyScheduleConfig(
  sc: ScheduleConfig | Record<string, never>,
): sc is Record<string, never> {
  return Object.keys(sc).length === 0;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  profile: Profile;
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

export default function ScheduleClient({ profile }: Props) {
  const router = useRouter();

  const initialValues = isEmptyScheduleConfig(profile.schedule_config)
    ? DEFAULT_VALUES
    : (profile.schedule_config as ScheduleConfig);

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<ScheduleConfig>({
    resolver: zodResolver(ScheduleConfigSchema),
    defaultValues: initialValues,
  });

  const frequency = watch('frequency');
  const preferredTimes = watch('preferredTimes');
  const daysOff = watch('daysOff');
  const platforms = watch('platforms');

  // ---- Submit ---------------------------------------------------------------
  async function onSubmit(data: ScheduleConfig) {
    const result = await saveScheduleConfig(data);
    if (!result.ok) {
      toast.error(`Error al guardar: ${result.error.message}`);
      return;
    }
    toast.success('Configuración guardada correctamente.');
    router.refresh();
  }

  // ---- Time slots helpers ---------------------------------------------------
  function addTimeSlot() {
    if (preferredTimes.length >= 5) return;
    setValue('preferredTimes', [...preferredTimes, '12:00'], { shouldValidate: true });
  }

  function removeTimeSlot(index: number) {
    setValue(
      'preferredTimes',
      preferredTimes.filter((_, i) => i !== index),
      { shouldValidate: true },
    );
  }

  function updateTimeSlot(index: number, value: string) {
    const updated = [...preferredTimes];
    updated[index] = value;
    setValue('preferredTimes', updated, { shouldValidate: true });
  }

  // ---- Days off toggle ------------------------------------------------------
  function toggleDayOff(day: number) {
    if (daysOff.includes(day)) {
      setValue(
        'daysOff',
        daysOff.filter((d) => d !== day),
        { shouldValidate: true },
      );
    } else {
      setValue('daysOff', [...daysOff, day], { shouldValidate: true });
    }
  }

  // ---- Platform toggle ------------------------------------------------------
  function togglePlatform(platform: string) {
    if (platforms.includes(platform)) {
      // Keep at least one platform (schema min(1))
      if (platforms.length <= 1) return;
      setValue(
        'platforms',
        platforms.filter((p) => p !== platform),
        { shouldValidate: true },
      );
    } else {
      setValue('platforms', [...platforms, platform], { shouldValidate: true });
    }
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-col gap-6">

        {/* ----------------------------------------------------------------- */}
        {/* Section 1 — Frecuencia                                            */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Frecuencia
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Con qué regularidad se publican los videos.
          </p>

          <div className="flex flex-wrap gap-2">
            {FREQUENCY_OPTIONS.map(({ value, label }) => {
              const active = frequency === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('frequency', value, { shouldValidate: true })}
                  className={[
                    'px-4 py-2 rounded-md text-sm font-medium border transition-colors',
                    active
                      ? 'bg-accent text-accent-fg border-accent'
                      : 'border-border text-text-secondary hover:border-accent/50 hover:text-text-primary',
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 2 — Horarios preferidos                                   */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Horarios preferidos
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Los videos se programarán en estos horarios. Máximo 5.
          </p>

          <div className="flex flex-col gap-3">
            {preferredTimes.map((time, index) => (
              <div key={index} className="flex items-center gap-3">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => updateTimeSlot(index, e.target.value)}
                  className={[
                    'h-9 rounded-md border border-border bg-transparent px-3 text-sm text-text-primary',
                    'outline-none focus:border-accent transition-colors',
                    '[color-scheme:dark]',
                  ].join(' ')}
                  aria-label={`Horario ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeTimeSlot(index)}
                  disabled={preferredTimes.length <= 1}
                  aria-label={`Eliminar horario ${index + 1}`}
                  className="flex items-center justify-center size-7 rounded-md border border-border text-text-tertiary hover:text-text-primary hover:border-border/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTimeSlot}
              disabled={preferredTimes.length >= 5}
              className="self-start border-border text-text-secondary hover:text-text-primary gap-1.5 mt-1"
            >
              <Plus className="size-3.5" />
              Agregar horario
            </Button>

            <p className="text-text-tertiary text-xs">
              {preferredTimes.length}/5 horarios configurados
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 3 — Días off                                              */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Días off
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Los días resaltados en verde son días activos. Los días sin color son días de descanso.
          </p>

          <div className="flex flex-wrap gap-2">
            {DAYS.map(({ value, label }) => {
              const isOff = daysOff.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDayOff(value)}
                  className={[
                    'w-12 py-2 rounded-md text-sm font-medium border transition-colors',
                    isOff
                      ? 'bg-bg-surface-high border-border text-text-tertiary'
                      : 'bg-accent/10 border-accent text-accent',
                  ].join(' ')}
                  aria-pressed={!isOff}
                  aria-label={`${label} — ${isOff ? 'día off' : 'día activo'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {daysOff.length > 0 && (
            <p className="text-text-tertiary text-xs mt-3">
              {daysOff.length} {daysOff.length === 1 ? 'día' : 'días'} sin publicación por semana
            </p>
          )}
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 4 — Plataformas activas                                   */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Plataformas activas
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Seleccioná en qué plataformas se publicará el contenido.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {/* Instagram — única plataforma disponible */}
            <button
              type="button"
              onClick={() => togglePlatform('instagram')}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors',
                platforms.includes('instagram')
                  ? 'bg-accent text-accent-fg border-accent'
                  : 'border-border text-text-secondary hover:border-accent/50 hover:text-text-primary',
              ].join(' ')}
              aria-pressed={platforms.includes('instagram')}
            >
              <Instagram className="size-3.5" aria-hidden="true" />
              Instagram
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border/60 bg-bg-surface-high px-3 py-2.5">
            <Info className="size-3.5 mt-0.5 shrink-0 text-text-tertiary" aria-hidden="true" />
            <p className="text-text-tertiary text-xs leading-relaxed">
              Auto-publicar desactivado — Instagram no tiene API pública para publicación directa.
              Los videos se exportan listos para subir manualmente.
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 5 — Auto-publicar                                         */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label className="text-text-primary text-sm font-semibold cursor-default">
                Auto-publicar
              </Label>
              <p className="text-text-tertiary text-sm">
                Siempre en manual — Instagram no tiene API pública para publicación directa.
              </p>
            </div>
            <Switch
              checked={false}
              disabled
              aria-label="Auto-publicar (deshabilitado)"
              className="shrink-0 mt-0.5 opacity-40 cursor-not-allowed"
            />
          </div>
        </section>

        <Separator />

        {/* ----------------------------------------------------------------- */}
        {/* Submit                                                            */}
        {/* ----------------------------------------------------------------- */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-accent text-accent-fg hover:bg-accent/90 gap-2"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? 'Guardando...' : 'Guardar configuración'}
        </Button>

      </div>
    </form>
  );
}
