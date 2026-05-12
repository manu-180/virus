'use client';

import { useState } from 'react';
import { Download, RefreshCcw, X, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { CarouselSlideRow } from '@/app/(dashboard)/dashboard/carousels/[id]/page';

interface SlideFullscreenModalProps {
  slide: CarouselSlideRow;
  idx: number;
  carouselId: string;
  signedUrl: string | undefined;
  signedBaseUrl: string | undefined;
  onRegenerate: (hint?: string) => Promise<void>;
  onClose: () => void;
}

const MAX_HINT_LEN = 240;

export function SlideFullscreenModal({
  slide,
  idx,
  carouselId,
  signedUrl,
  signedBaseUrl,
  onRegenerate,
  onClose,
}: SlideFullscreenModalProps) {
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState<'composed' | 'base' | null>(null);
  const [hint, setHint] = useState('');

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const trimmed = hint.trim();
      await onRegenerate(trimmed.length > 0 ? trimmed : undefined);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDownload(type: 'composed' | 'base') {
    setDownloading(type);
    try {
      const res = await fetch(
        `/api/carousels/${carouselId}/slides/${idx}/download?type=${type}`,
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slide-${idx + 1}-${type}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  const hasComposed = Boolean(signedUrl);
  const hasBase = Boolean(signedBaseUrl);
  const defaultTab = hasComposed ? 'composed' : 'base';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl bg-[#111318] border-white/[0.08] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold text-white">
              Slide {idx + 1}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6">
          <Tabs defaultValue={defaultTab} className="mt-4">
            <TabsList className="bg-white/5 border border-white/10 mb-4">
              <TabsTrigger
                value="composed"
                disabled={!hasComposed}
                className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50"
              >
                Compuesto
              </TabsTrigger>
              <TabsTrigger
                value="base"
                disabled={!hasBase}
                className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50"
              >
                Base
              </TabsTrigger>
            </TabsList>

            <TabsContent value="composed">
              <SlideImage url={signedUrl} alt={`Slide ${idx + 1} compuesto`} />
            </TabsContent>
            <TabsContent value="base">
              <SlideImage url={signedBaseUrl} alt={`Slide ${idx + 1} base`} />
            </TabsContent>
          </Tabs>

          {/* Hint input — optional steer for the new image */}
          <div className="mt-4 space-y-1.5">
            <label
              htmlFor={`slide-hint-${idx}`}
              className="block text-[11px] font-medium uppercase tracking-widest text-white/40"
            >
              Indicación opcional para la nueva imagen
            </label>
            <textarea
              id={`slide-hint-${idx}`}
              value={hint}
              onChange={(e) => setHint(e.target.value.slice(0, MAX_HINT_LEN))}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !regenerating) {
                  e.preventDefault();
                  void handleRegenerate();
                }
              }}
              placeholder='ej. "más oscuro", "sin manos en cuadro", "paleta más fría"'
              rows={2}
              maxLength={MAX_HINT_LEN}
              disabled={regenerating}
              className="w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
            />
            <p className="text-[10px] text-white/30 text-right tabular-nums">
              {hint.length}/{MAX_HINT_LEN}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors"
            >
              {regenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="w-3.5 h-3.5" />
              )}
              Regenerar
            </button>

            {hasComposed && (
              <button
                type="button"
                onClick={() => handleDownload('composed')}
                disabled={downloading !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors"
              >
                {downloading === 'composed' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Descargar compuesto
              </button>
            )}

            {hasBase && (
              <button
                type="button"
                onClick={() => handleDownload('base')}
                disabled={downloading !== null}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/10 hover:text-white/70 disabled:opacity-50 transition-colors',
                )}
              >
                {downloading === 'base' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Descargar base
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SlideImage({ url, alt }: { url: string | undefined; alt: string }) {
  if (!url) {
    return (
      <div
        className="w-full bg-white/5 animate-pulse rounded-lg"
        style={{ aspectRatio: '4/5' }}
      />
    );
  }

  return (
    <div className="w-full flex justify-center">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="rounded-lg object-contain max-h-[60vh] w-auto"
        style={{ aspectRatio: '4/5' }}
      />
    </div>
  );
}
