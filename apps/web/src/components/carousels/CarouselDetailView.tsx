'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, TriangleAlert, Loader2, RefreshCcw, Download, Trash2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/browser';
import type {
  CarouselProjectRow,
  CarouselSlideRow,
  CarouselCaptionRow,
} from '@/app/(dashboard)/dashboard/carousels/[id]/page';
import { SlideGallery } from './SlideGallery';
import { CaptionPicker } from './CaptionPicker';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CarouselDetailViewProps {
  initialData: {
    project: CarouselProjectRow;
    slides: CarouselSlideRow[];
    captions: CarouselCaptionRow[];
  };
}

type CarouselStatus = CarouselProjectRow['status'];

// ─── Constants ───────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['ready', 'failed']);

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  generating_slides: 'Generando slides',
  composing: 'Componiendo',
  generating_captions: 'Generando captions',
  ready: 'Listo',
  failed: 'Fallido',
};

const STATUS_PILL_CLASS: Record<string, string> = {
  pending: 'text-white/60 border-white/20 bg-white/5',
  generating_slides: 'text-blue-400 border-blue-400/30 bg-blue-400/10 animate-pulse',
  composing: 'text-blue-400 border-blue-400/30 bg-blue-400/10 animate-pulse',
  generating_captions: 'text-blue-400 border-blue-400/30 bg-blue-400/10 animate-pulse',
  ready: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  failed: 'text-red-400 border-red-400/30 bg-red-400/10',
};

// ─── RelativeTime ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

function RelativeTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setText(relativeTime(iso));
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [iso]);
  return <span suppressHydrationWarning>{text ?? ''}</span>;
}

// ─── StatusTimeline ───────────────────────────────────────────────────────────

const TIMELINE_STEPS: { status: string; label: string }[] = [
  { status: 'pending', label: 'Pendiente' },
  { status: 'generating_slides', label: 'Generando slides' },
  { status: 'composing', label: 'Componiendo' },
  { status: 'generating_captions', label: 'Generando captions' },
  { status: 'ready', label: 'Listo' },
];

const STATUS_STEP_INDEX: Record<string, number> = {
  pending: 0,
  generating_slides: 1,
  composing: 2,
  generating_captions: 3,
  ready: 4,
  failed: 4, // all steps show red on failure
};

function StatusTimeline({ status }: { status: CarouselStatus }) {
  const isFailed = status === 'failed';
  // For failed status, we don't have a clear "stopped at" step, so highlight none actively
  const activeIdx = isFailed ? -1 : (STATUS_STEP_INDEX[status] ?? 0);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-4">
        Progreso
      </p>
      <div className="flex items-center">
        {TIMELINE_STEPS.map((step, i) => {
          const isCompleted = !isFailed && i < activeIdx;
          const isActive = !isFailed && i === activeIdx;
          const isFailed_ = isFailed && i <= activeIdx;
          const isLast = i === TIMELINE_STEPS.length - 1;

          return (
            <div key={step.status} className="flex items-center flex-1 last:flex-none">
              {/* Circle */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'relative w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all',
                    isCompleted && 'border-emerald-400 bg-emerald-400',
                    isActive && 'border-[#C8FF57] bg-[#C8FF57]/20 animate-pulse',
                    isFailed_ && 'border-red-400 bg-red-400/20',
                    !isCompleted && !isActive && !isFailed_ && 'border-white/20 bg-transparent',
                  )}
                >
                  {isCompleted && <Check className="w-3.5 h-3.5 text-[#111318]" strokeWidth={3} />}
                  {isActive && (
                    <div className="w-2.5 h-2.5 rounded-full bg-[#C8FF57]" />
                  )}
                  {isFailed_ && <TriangleAlert className="w-3 h-3 text-red-400" />}
                </div>
                <span
                  className={cn(
                    'text-[10px] text-center leading-tight max-w-[72px]',
                    isCompleted && 'text-emerald-400',
                    isActive && 'text-[#C8FF57] font-semibold',
                    isFailed_ && 'text-red-400',
                    !isCompleted && !isActive && !isFailed_ && 'text-white/30',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-px mx-1 mb-5',
                    i < activeIdx && !isFailed ? 'bg-emerald-400/50' : 'bg-white/10',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SlideGalleryPlaceholder ──────────────────────────────────────────────────

function SlideGalleryPlaceholder({
  slides,
  slideCount,
}: {
  slides: CarouselSlideRow[];
  slideCount: number;
}) {
  const totalSlots = Math.max(slides.length, slideCount);
  const slots = Array.from({ length: totalSlots }, (_, i) => slides[i] ?? null);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-4">
        Slides
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {slots.map((slide, i) => {
          const hasImage = slide?.composed_path ?? slide?.image_path;
          const isDone = slide?.status === 'done';
          const isSlideFailed = slide?.status === 'failed';

          return (
            <div
              key={slide?.id ?? `placeholder-${i}`}
              className="relative rounded-lg overflow-hidden bg-white/5"
              style={{ aspectRatio: '4/5' }}
            >
              {hasImage ? (
                <img
                  src={slide!.composed_path ?? slide!.image_path!}
                  alt={`Slide ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className={cn(
                    'w-full h-full',
                    isSlideFailed
                      ? 'bg-red-500/10'
                      : 'bg-white/5 animate-pulse',
                  )}
                />
              )}

              {/* Slide number badge */}
              <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/80 backdrop-blur-sm">
                {i + 1}
              </div>

              {/* Status pill — only when not done */}
              {slide && !isDone && (
                <div
                  className={cn(
                    'absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur-sm',
                    isSlideFailed
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-black/50 text-white/60',
                  )}
                >
                  {slide.status}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setMessage(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), 3000);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { message, showToast };
}

// ─── CarouselCostDetails ──────────────────────────────────────────────────────

interface CostData {
  totalUsd: number;
  totalCents: number;
  byProvider: Record<string, number>;
  recordCount: number;
  generationTimeMs: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini (imágenes)',
  anthropic: 'Claude (texto)',
};

function CarouselCostDetails({ carouselId }: { carouselId: string }) {
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || cost) return;
    setLoading(true);
    fetch(`/api/carousels/${carouselId}/cost`)
      .then((r) => r.json() as Promise<CostData>)
      .then(setCost)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, carouselId, cost]);

  const genTimeSec = cost ? Math.round(cost.generationTimeMs / 1000) : 0;
  const genTimeLabel =
    genTimeSec < 60
      ? `${genTimeSec}s`
      : `${Math.floor(genTimeSec / 60)}m ${genTimeSec % 60}s`;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-xs font-medium uppercase tracking-widest text-white/40">
          Detalles de costo
        </span>
        <ChevronDown
          className={cn('w-4 h-4 text-white/30 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-5 pb-5 pt-4 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Calculando...
            </div>
          )}

          {!loading && cost && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Costo total</span>
                <span className="text-sm font-semibold text-[#C8FF57] tabular-nums">
                  ${cost.totalUsd.toFixed(4)} USD
                </span>
              </div>

              {Object.entries(cost.byProvider).map(([provider, usd]) => (
                <div key={provider} className="flex items-center justify-between pl-4">
                  <span className="text-xs text-white/40">
                    {PROVIDER_LABELS[provider] ?? provider}
                  </span>
                  <span className="text-xs text-white/60 tabular-nums">
                    ${usd.toFixed(4)}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                <span className="text-xs text-white/50">Tiempo de generación</span>
                <span className="text-xs text-white/60 tabular-nums">{genTimeLabel}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Registros AI</span>
                <span className="text-xs text-white/60 tabular-nums">{cost.recordCount}</span>
              </div>
            </>
          )}

          {!loading && !cost && (
            <p className="text-xs text-white/30">No hay datos de costo disponibles.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CarouselDetailView({ initialData }: CarouselDetailViewProps) {
  const [project, setProject] = useState<CarouselProjectRow>(initialData.project);
  const [slides, setSlides] = useState<CarouselSlideRow[]>(
    [...initialData.slides].sort((a, b) => a.idx - b.idx),
  );
  const [captions, setCaptions] = useState<CarouselCaptionRow[]>(initialData.captions);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { message: toastMessage, showToast } = useToast();

  const isTerminal = TERMINAL_STATUSES.has(project.status);
  const router = useRouter();

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let ch1: ReturnType<typeof supabase.channel> | null = null;
    let ch2: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Channel 1: carousel_projects — UPDATE events for this carousel
      const c1 = supabase
        .channel(`carousel-project-${project.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'carousel_projects',
            filter: `id=eq.${project.id}`,
          },
          (payload) => {
            if (cancelled) return;
            setProject((prev) => ({ ...prev, ...(payload.new as CarouselProjectRow) }));
          },
        )
        .subscribe();
      if (cancelled) { supabase.removeChannel(c1); return; }
      ch1 = c1;

      // Channel 2: carousel_slides — INSERT + UPDATE for this carousel
      const c2 = supabase
        .channel(`carousel-slides-${project.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'carousel_slides',
            filter: `carousel_id=eq.${project.id}`,
          },
          (payload) => {
            if (cancelled) return;
            const { eventType, new: newRow } = payload;
            if (eventType === 'INSERT') {
              const row = newRow as CarouselSlideRow;
              setSlides((prev) => [...prev, row].sort((a, b) => a.idx - b.idx));
            } else if (eventType === 'UPDATE') {
              const row = newRow as CarouselSlideRow;
              setSlides((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...row } : s)));
            }
          },
        )
        .subscribe();
      if (cancelled) { supabase.removeChannel(c2); return; }
      ch2 = c2;
    };

    init();

    return () => {
      cancelled = true;
      if (ch1) supabase.removeChannel(ch1);
      if (ch2) supabase.removeChannel(ch2);
    };
  }, [project.id]);

  // ── Polling fallback (every 5s while non-terminal) ────────────────────────
  useEffect(() => {
    if (isTerminal) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/carousels/${project.id}`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          project: CarouselProjectRow;
          slides: CarouselSlideRow[];
          captions: CarouselCaptionRow[];
        };
        // Only update project if poll data is newer than current state
        setProject((prev) => {
          if (new Date(body.project.updated_at) > new Date(prev.updated_at)) {
            return { ...prev, ...body.project };
          }
          return prev;
        });
        // Merge slides by updated_at to avoid overwriting fresher realtime data
        setSlides((prev) => {
          const map = new Map(prev.map((s) => [s.id, s]));
          for (const slide of body.slides) {
            const existing = map.get(slide.id);
            if (!existing || new Date(slide.updated_at) > new Date(existing.updated_at)) {
              map.set(slide.id, slide);
            }
          }
          return [...map.values()].sort((a, b) => a.idx - b.idx);
        });
        setCaptions(body.captions);
      } catch {
        // silent — realtime is primary
      }
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [project.id, isTerminal]);

  // ── Parse brief ───────────────────────────────────────────────────────────
  const brief = (() => {
    try {
      return JSON.parse(project.brief) as {
        topic?: string;
        angle?: string;
        tone?: string;
        audience?: string;
        slideCount?: number;
        language?: string;
        cta?: string;
      };
    } catch {
      return null;
    }
  })();

  const title = brief?.topic ?? 'Carrusel sin título';

  // ── First failed slide error ───────────────────────────────────────────────
  const firstFailedSlide = slides.find((s) => s.status === 'failed');

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/carousels/${project.id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setProject((prev) => ({ ...prev, status: 'pending', error: null }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al reintentar');
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      '¿Eliminar este carrusel? Esta acción no se puede deshacer.',
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/carousels/${project.id}`, { method: 'DELETE' });
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        showToast('No implementado aún');
        return;
      }
      if (!res.ok) {
        showToast('Error al eliminar el carrusel');
        return;
      }
      router.push('/dashboard/carousels');
    } catch {
      showToast('No implementado aún');
    } finally {
      setDeleting(false);
    }
  }

  async function handleRegenerate(idx: number) {
    // Optimistic: mark the slide as pending locally so the shimmer shows immediately
    setSlides((prev) =>
      prev.map((s) => (s.idx === idx ? { ...s, status: 'pending', error: null } : s)),
    );
    try {
      const res = await fetch(`/api/carousels/${project.id}/slides/${idx}/regenerate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? 'Error al regenerar el slide');
        // Roll back optimistic update on failure
        setSlides((prev) =>
          prev.map((s) => (s.idx === idx ? { ...s, status: 'failed' } : s)),
        );
      }
    } catch {
      showToast('Error al regenerar el slide');
      setSlides((prev) =>
        prev.map((s) => (s.idx === idx ? { ...s, status: 'failed' } : s)),
      );
    }
  }

  async function handleDownload() {
    try {
      const res = await fetch(`/api/carousels/${project.id}/export`);
      if (res.status === 501 || res.status === 404) {
        showToast('Próximamente');
        return;
      }
      if (!res.ok) {
        showToast('Error al descargar');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carrusel-${project.id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Próximamente');
    }
  }

  async function handleCaptionRegenerate() {
    const res = await fetch(`/api/carousels/${project.id}/captions/regenerate`, { method: 'POST' });
    if (res.status === 429) {
      showToast('Límite de regeneraciones alcanzado (máx. 3)');
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      showToast(body.error ?? 'Error al regenerar captions');
      return;
    }
    setCaptions([]); // Clear so picker shows loading state; polling/realtime will refetch
  }

  // ── Deletable statuses ─────────────────────────────────────────────────────
  const isGenerating =
    project.status === 'generating_slides' ||
    project.status === 'composing' ||
    project.status === 'generating_captions';
  const canDelete = !isGenerating;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header className="space-y-3">
          <Link
            href="/dashboard/carousels"
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Carruseles
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold text-white leading-tight">{title}</h1>
              <div className="flex flex-wrap items-center gap-3">
                {/* Status pill */}
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    STATUS_PILL_CLASS[project.status] ?? 'text-white/60 border-white/20 bg-white/5',
                  )}
                >
                  {STATUS_LABELS[project.status] ?? project.status}
                </span>
                <span className="text-xs text-white/40">
                  <RelativeTime iso={project.created_at} />
                </span>
              </div>
            </div>

            {/* Delete button in header — only when not generating */}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Eliminar
              </button>
            )}
          </div>
        </header>

        {/* ── ERROR BANNER ───────────────────────────────────────────────── */}
        {project.status === 'failed' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <TriangleAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-semibold text-red-300">Pipeline fallido</p>
                {project.error && (
                  <p className="text-xs text-red-400/80 font-mono break-all">
                    {project.error}
                  </p>
                )}
                {firstFailedSlide?.error && firstFailedSlide.error !== project.error && (
                  <p className="text-xs text-red-400/60 font-mono break-all mt-1">
                    Slide {firstFailedSlide.idx + 1}: {firstFailedSlide.error}
                  </p>
                )}
              </div>
            </div>
            <div className="pl-8">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {retrying ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="w-3.5 h-3.5" />
                )}
                Reintentar
              </button>
            </div>
          </div>
        )}

        {/* ── STATUS TIMELINE ────────────────────────────────────────────── */}
        <StatusTimeline status={project.status} />

        {/* ── SLIDE GALLERY ──────────────────────────────────────────────── */}
        <SlideGallery
          carouselId={project.id}
          slides={slides}
          slideCount={project.slide_count}
          onRegenerate={handleRegenerate}
        />

        {/* ── CAPTION PICKER ─────────────────────────────────────────────── */}
        {(project.status === 'ready' || project.status === 'generating_captions' || captions.length > 0) && (
          <CaptionPicker
            captions={captions}
            carouselId={project.id}
            onRegenerate={handleCaptionRegenerate}
          />
        )}

        {/* ── COST DETAILS ───────────────────────────────────────────────── */}
        {project.status === 'ready' && (
          <CarouselCostDetails carouselId={project.id} />
        )}

        {/* ── BOTTOM BAR ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-4">
          <button
            type="button"
            onClick={handleDownload}
            disabled={project.status !== 'ready'}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors',
              project.status === 'ready'
                ? 'bg-[#C8FF57] text-[#111318] hover:bg-[#d4ff6e]'
                : 'bg-white/5 text-white/30 cursor-not-allowed',
            )}
          >
            <Download className="w-4 h-4" />
            Descargar ZIP
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || !canDelete}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-500/20 bg-transparent px-3 py-2 text-xs font-medium text-red-400/70 hover:border-red-500/40 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Eliminar carrusel
          </button>
        </div>
      </div>

      {/* ── TOAST ──────────────────────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-white/10 bg-[#1a1d24] px-4 py-3 text-sm text-white shadow-xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
