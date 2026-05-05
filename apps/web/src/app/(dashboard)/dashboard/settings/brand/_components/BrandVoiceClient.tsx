'use client';

import { useState, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import { BrandVoiceSchema, type BrandVoice } from '@/lib/zod/profile-schemas';
import type { Profile } from '@/server/profile/types';
import { saveBrandVoice } from '@/server/profile/actions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TONE_CHIPS = [
  'directo',
  'irónico',
  'técnico',
  'accesible',
  'contrarian',
  'entusiasta',
] as const satisfies BrandVoice['toneChips'];

const CTA_OPTIONS: { value: BrandVoice['ctaPreferred']; label: string }[] = [
  { value: 'comment_keyword', label: 'Comentá una keyword' },
  { value: 'tag_friend', label: 'Taggea un amigo' },
  { value: 'save', label: 'Guardalo' },
  { value: 'follow', label: 'Seguime' },
];

const DEFAULT_VALUES: BrandVoice = {
  pillars: { educational: 34, hotTake: 33, personal: 33 },
  toneChips: ['directo'],
  language: 'es-AR',
  audience: 'LATAM',
  topicsFav: [],
  topicsAvoid: [],
  hashtags: [],
  ctaPreferred: 'comment_keyword',
  handle: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmptyBrandVoice(bv: BrandVoice | Record<string, never>): bv is Record<string, never> {
  return Object.keys(bv).length === 0;
}

// ---------------------------------------------------------------------------
// TagsInput sub-component
// ---------------------------------------------------------------------------

interface TagsInputProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  max: number;
  placeholder?: string;
  hashPrefix?: boolean;
}

function TagsInput({ tags, onAdd, onRemove, max, placeholder = 'Agregar...', hashPrefix = false }: TagsInputProps) {
  const [inputValue, setInputValue] = useState('');

  function handleAdd() {
    const trimmed = inputValue.trim();
    if (!trimmed || tags.length >= max) return;
    onAdd(trimmed);
    setInputValue('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex items-center rounded-lg border border-border bg-transparent focus-within:border-accent transition-colors overflow-hidden flex-1">
          {hashPrefix && (
            <span className="px-2.5 py-1 text-text-tertiary text-sm select-none shrink-0">#</span>
          )}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={50}
            disabled={tags.length >= max}
            className="h-8 flex-1 min-w-0 bg-transparent px-2.5 py-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-50"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!inputValue.trim() || tags.length >= max}
          className="border-border text-text-secondary hover:text-text-primary shrink-0"
        >
          Agregar
        </Button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-bg-surface-high text-text-secondary"
            >
              {hashPrefix ? `#${tag}` : tag}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Eliminar ${tag}`}
                className="text-text-tertiary hover:text-text-primary transition-colors ml-0.5"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-text-tertiary text-xs">
        {tags.length}/{max} items
      </p>
    </div>
  );
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

export default function BrandVoiceClient({ profile }: Props) {
  const router = useRouter();

  const initialValues = isEmptyBrandVoice(profile.brand_voice)
    ? DEFAULT_VALUES
    : (profile.brand_voice as BrandVoice);

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<BrandVoice>({
    resolver: zodResolver(BrandVoiceSchema),
    defaultValues: initialValues,
  });

  // Watched fields
  const pillars = watch('pillars');
  const toneChips = watch('toneChips');
  const language = watch('language');
  const audience = watch('audience');
  const topicsFav = watch('topicsFav');
  const topicsAvoid = watch('topicsAvoid');
  const hashtags = watch('hashtags');
  const ctaPreferred = watch('ctaPreferred');
  const handle = watch('handle');

  const pillarTotal = pillars.educational + pillars.hotTake + pillars.personal;
  const pillarValid = pillarTotal === 100;

  // ---- Submit ---------------------------------------------------------------
  async function onSubmit(data: BrandVoice) {
    const result = await saveBrandVoice(data);
    if (!result.ok) {
      toast.error(`Error al guardar: ${result.error.message}`);
      return;
    }
    toast.success('Brand voice guardado correctamente.');
    router.refresh();
  }

  // ---- Tone chips toggle ----------------------------------------------------
  function toggleTone(chip: BrandVoice['toneChips'][number]) {
    if (toneChips.includes(chip)) {
      setValue('toneChips', toneChips.filter((c) => c !== chip), { shouldValidate: true });
    } else {
      setValue('toneChips', [...toneChips, chip], { shouldValidate: true });
    }
  }

  // ---- Tags helpers ---------------------------------------------------------
  function addTag(field: 'topicsFav' | 'topicsAvoid' | 'hashtags', tag: string) {
    const current = field === 'topicsFav' ? topicsFav : field === 'topicsAvoid' ? topicsAvoid : hashtags;
    setValue(field, [...current, tag], { shouldValidate: true });
  }

  function removeTag(field: 'topicsFav' | 'topicsAvoid' | 'hashtags', index: number) {
    const current = field === 'topicsFav' ? topicsFav : field === 'topicsAvoid' ? topicsAvoid : hashtags;
    setValue(field, current.filter((_, i) => i !== index), { shouldValidate: true });
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-col gap-6">

        {/* ----------------------------------------------------------------- */}
        {/* Section 1 — Pilares de contenido                                  */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Pilares de contenido
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Distribuí el peso de cada pilar. Deben sumar 100%.
          </p>

          <div className="flex flex-col gap-5">
            {/* Educational */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-text-secondary text-sm">Educativo</Label>
                <span className="text-text-primary text-sm font-semibold tabular-nums">
                  {pillars.educational}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={pillars.educational}
                onChange={(e) =>
                  setValue('pillars.educational', Number(e.target.value), { shouldValidate: true })
                }
                className="w-full h-1.5 rounded-full bg-bg-surface-high appearance-none cursor-pointer accent-[#3ECF8E]"
                aria-label="Porcentaje educativo"
              />
            </div>

            {/* Hot take */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-text-secondary text-sm">Hot Take</Label>
                <span className="text-text-primary text-sm font-semibold tabular-nums">
                  {pillars.hotTake}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={pillars.hotTake}
                onChange={(e) =>
                  setValue('pillars.hotTake', Number(e.target.value), { shouldValidate: true })
                }
                className="w-full h-1.5 rounded-full bg-bg-surface-high appearance-none cursor-pointer accent-[#3ECF8E]"
                aria-label="Porcentaje hot take"
              />
            </div>

            {/* Personal */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-text-secondary text-sm">Personal</Label>
                <span className="text-text-primary text-sm font-semibold tabular-nums">
                  {pillars.personal}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={pillars.personal}
                onChange={(e) =>
                  setValue('pillars.personal', Number(e.target.value), { shouldValidate: true })
                }
                className="w-full h-1.5 rounded-full bg-bg-surface-high appearance-none cursor-pointer accent-[#3ECF8E]"
                aria-label="Porcentaje personal"
              />
            </div>

            {/* Total */}
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-text-secondary text-sm">Total</span>
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'text-sm font-semibold tabular-nums',
                    pillarValid ? 'text-accent' : 'text-danger',
                  ].join(' ')}
                >
                  {pillarTotal}% / 100%
                </span>
              </div>
            </div>
            {!pillarValid && (
              <p className="text-danger text-xs" role="alert">
                Los pilares deben sumar 100%
              </p>
            )}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 2 — Tono de voz                                           */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Tono de voz
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Seleccioná uno o varios tonos que definen tu estilo de comunicación.
          </p>

          <div className="flex flex-wrap gap-2">
            {TONE_CHIPS.map((chip) => {
              const active = toneChips.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleTone(chip)}
                  className={[
                    'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors capitalize',
                    active
                      ? 'bg-accent text-accent-fg border-accent'
                      : 'border-border text-text-secondary hover:border-accent/50 hover:text-text-primary',
                  ].join(' ')}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 3 — Idioma y audiencia                                    */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-5">
            Idioma y audiencia
          </h2>

          {/* Idioma */}
          <div className="flex flex-col gap-3 mb-6">
            <Label className="text-text-secondary text-sm">Idioma</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: 'es-AR', label: 'Español AR' },
                  { value: 'en-US', label: 'English US' },
                ] as { value: BrandVoice['language']; label: string }[]
              ).map(({ value, label }) => {
                const active = language === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('language', value, { shouldValidate: true })}
                    className={[
                      'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
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
          </div>

          {/* Audiencia */}
          <div className="flex flex-col gap-3">
            <Label className="text-text-secondary text-sm">Audiencia</Label>
            <div className="flex flex-wrap gap-2">
              {(
                ['LATAM', 'Global', 'Mixed'] as BrandVoice['audience'][]
              ).map((value) => {
                const active = audience === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('audience', value, { shouldValidate: true })}
                    className={[
                      'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                      active
                        ? 'bg-accent text-accent-fg border-accent'
                        : 'border-border text-text-secondary hover:border-accent/50 hover:text-text-primary',
                    ].join(' ')}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 4 — Temas favoritos                                       */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Temas favoritos
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Temas que aparecen frecuentemente en tu contenido. Máximo 20.
          </p>

          <TagsInput
            tags={topicsFav}
            onAdd={(tag) => addTag('topicsFav', tag)}
            onRemove={(i) => removeTag('topicsFav', i)}
            max={20}
            placeholder="Ej: productividad, IA, startups..."
          />
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 5 — Temas a evitar                                        */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Temas a evitar
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Temas que no querés que aparezcan en tu contenido. Máximo 20.
          </p>

          <TagsInput
            tags={topicsAvoid}
            onAdd={(tag) => addTag('topicsAvoid', tag)}
            onRemove={(i) => removeTag('topicsAvoid', i)}
            max={20}
            placeholder="Ej: política, religión..."
          />
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 6 — Hashtags fijos                                        */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Hashtags fijos
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Hashtags que se agregan automáticamente a tus posts. Máximo 30.
          </p>

          <TagsInput
            tags={hashtags}
            onAdd={(tag) => {
              const clean = tag.startsWith('#') ? tag.slice(1) : tag;
              if (clean) addTag('hashtags', clean);
            }}
            onRemove={(i) => removeTag('hashtags', i)}
            max={30}
            placeholder="Ej: emprendimiento, growth..."
            hashPrefix
          />
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Section 7 — CTA preferido                                         */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            CTA preferido
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            El llamado a la acción que más usás en tus posts.
          </p>

          <div className="flex flex-wrap gap-2">
            {CTA_OPTIONS.map(({ value, label }) => {
              const active = ctaPreferred === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('ctaPreferred', value, { shouldValidate: true })}
                  className={[
                    'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
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
        {/* Section 8 — Handle                                                */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-bg-surface rounded-lg border border-border p-6">
          <h2 className="text-text-primary text-base font-semibold mb-1">
            Handle
          </h2>
          <p className="text-text-tertiary text-sm mb-5">
            Tu handle se muestra en las tarjetas CTA generadas por la IA.
          </p>

          <div className="flex flex-col gap-2 max-w-sm">
            <Label htmlFor="brand-handle" className="text-text-secondary text-sm">
              Handle
            </Label>
            <div className="flex items-center rounded-lg border border-border bg-transparent focus-within:border-accent transition-colors overflow-hidden">
              <span className="px-2.5 py-1 text-text-tertiary text-sm select-none shrink-0">@</span>
              <input
                id="brand-handle"
                type="text"
                value={handle}
                onChange={(e) => setValue('handle', e.target.value, { shouldValidate: true })}
                maxLength={50}
                placeholder="tuhandle"
                className="h-8 flex-1 min-w-0 bg-transparent px-1 py-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>
            <p className="text-text-tertiary text-xs">
              Máximo 50 caracteres. Se muestra como @{handle || 'tuhandle'}.
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Submit                                                            */}
        {/* ----------------------------------------------------------------- */}
        <Button
          type="submit"
          disabled={isSubmitting || !pillarValid}
          title={!pillarValid ? 'Los pilares deben sumar 100% antes de guardar' : undefined}
          className="w-full bg-accent text-accent-fg hover:bg-accent/90 gap-2 disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? 'Guardando...' : 'Guardar brand voice'}
        </Button>

      </div>
    </form>
  );
}
