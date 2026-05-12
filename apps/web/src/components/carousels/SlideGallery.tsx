'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, RefreshCcw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CarouselSlideRow } from '@/app/(dashboard)/dashboard/carousels/[id]/page';
import { SlideFullscreenModal } from './SlideFullscreenModal';

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  hook: 'Hook',
  problem: 'Problema',
  insight: 'Insight',
  data: 'Dato',
  example: 'Ejemplo',
  cta: 'CTA',
};

function getRole(slide: CarouselSlideRow): string | null {
  if (!slide.overlay_text) return null;
  try {
    const spec = JSON.parse(slide.overlay_text) as { role?: string };
    return spec.role ?? null;
  } catch {
    return null;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideGalleryProps {
  carouselId: string;
  slides: CarouselSlideRow[];
  slideCount: number;
  onRegenerate: (idx: number, hint?: string) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SlideGallery({
  carouselId,
  slides,
  slideCount,
  onRegenerate,
}: SlideGalleryProps) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  // Cache key = "path@updated_at" so that a re-generated slide (same storage path,
  // new file content) gets a fresh signed URL after the DB row's updated_at changes.
  const fetchedRef = useRef(new Set<string>());

  // Fetch signed URLs for paths not yet fetched (or whose slide was updated).
  useEffect(() => {
    const toFetch: string[] = [];
    const vKeys: string[] = [];

    for (const slide of slides) {
      const v = slide.updated_at ?? '';
      if (slide.composed_path) {
        const vk = `${slide.composed_path}@${v}`;
        if (!fetchedRef.current.has(vk)) {
          toFetch.push(slide.composed_path);
          vKeys.push(vk);
        }
      }
      if (slide.image_path) {
        const vk = `${slide.image_path}@${v}`;
        if (!fetchedRef.current.has(vk)) {
          toFetch.push(slide.image_path);
          vKeys.push(vk);
        }
      }
    }
    if (toFetch.length === 0) return;

    vKeys.forEach((vk) => fetchedRef.current.add(vk));

    const params = new URLSearchParams();
    toFetch.forEach((p) => params.append('p', p));

    fetch(`/api/carousels/${carouselId}/slides/signed-urls?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { urls?: Record<string, string> } | null) => {
        if (body?.urls) {
          setSignedUrls((prev) => ({ ...prev, ...body.urls! }));
        }
      })
      .catch(() => {
        // Remove from fetched set so they can be retried next render
        vKeys.forEach((vk) => fetchedRef.current.delete(vk));
      });
  }, [slides, carouselId]);

  const totalSlots = Math.max(slides.length, slideCount);
  const slots = Array.from({ length: totalSlots }, (_, i) => slides[i] ?? null);
  const selectedSlide = selectedIdx !== null ? (slides[selectedIdx] ?? null) : null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-4">
        Slides
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {slots.map((slide, i) => {
          const isDone = slide?.status === 'ready';
          const isFailed = slide?.status === 'failed';
          const isRegenerating =
            slide?.status === 'pending' || slide?.status === 'generating';

          const composedUrl = slide?.composed_path
            ? signedUrls[slide.composed_path]
            : undefined;
          const baseUrl = slide?.image_path ? signedUrls[slide.image_path] : undefined;
          const displayUrl = composedUrl ?? baseUrl;

          const role = slide ? getRole(slide) : null;
          const num = String(i + 1).padStart(2, '0');
          const total = String(totalSlots).padStart(2, '0');

          return (
            <button
              key={slide?.id ?? `placeholder-${i}`}
              type="button"
              aria-label={`Ver slide ${i + 1}`}
              onClick={() => slide && setSelectedIdx(i)}
              disabled={!slide}
              className={cn(
                'relative rounded-lg overflow-hidden bg-white/5 group text-left',
                isFailed && 'ring-1 ring-inset ring-red-500/50',
                !slide && 'cursor-default',
              )}
              style={{ aspectRatio: '4/5' }}
            >
              {/* Image or skeleton */}
              {displayUrl ? (
                <img
                  src={displayUrl}
                  alt={`Slide ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className={cn(
                    'w-full h-full',
                    isFailed ? 'bg-red-500/10' : 'bg-white/5 animate-pulse',
                  )}
                />
              )}

              {/* Regenerating shimmer */}
              {isRegenerating && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center">
                  <RefreshCcw className="w-5 h-5 text-white/60 animate-spin" />
                </div>
              )}

              {/* Failed indicator */}
              {isFailed && !isRegenerating && (
                <div className="absolute inset-0 bg-red-900/20 flex items-center justify-center">
                  <TriangleAlert className="w-5 h-5 text-red-400" />
                </div>
              )}

              {/* Slide number */}
              <div className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm tabular-nums leading-tight pointer-events-none">
                {num}/{total}
              </div>

              {/* Role pill */}
              {role && isDone && (
                <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/70 backdrop-blur-sm pointer-events-none">
                  {ROLE_LABELS[role] ?? role}
                </div>
              )}

              {/* Hover overlay */}
              {slide && !isRegenerating && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 pointer-events-none group-focus-visible:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white">
                    <Maximize2 className="w-3 h-3" />
                    Ver
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium',
                      isFailed
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-white/10 text-white',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRegenerate(i);
                    }}
                  >
                    <RefreshCcw className="w-3 h-3" />
                    Regenerar
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Fullscreen modal */}
      {selectedSlide && selectedIdx !== null && (
        <SlideFullscreenModal
          slide={selectedSlide}
          idx={selectedIdx}
          carouselId={carouselId}
          signedUrl={
            selectedSlide.composed_path
              ? signedUrls[selectedSlide.composed_path]
              : undefined
          }
          signedBaseUrl={
            selectedSlide.image_path ? signedUrls[selectedSlide.image_path] : undefined
          }
          onRegenerate={async (hint) => {
            await onRegenerate(selectedIdx, hint);
            setSelectedIdx(null);
          }}
          onClose={() => setSelectedIdx(null)}
        />
      )}
    </div>
  );
}
