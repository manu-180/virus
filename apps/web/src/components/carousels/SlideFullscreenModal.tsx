'use client';

import { useState } from 'react';
import { Download, RefreshCcw, X, Loader2, Pencil } from 'lucide-react';
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
const MAX_HEADLINE = 40;
const MAX_BODY = 120;

interface SlideOverlay {
  headline: string;
  body?: string;
}

function parseOverlay(overlayText: string | null): SlideOverlay {
  if (!overlayText) return { headline: '' };
  try {
    const parsed = JSON.parse(overlayText) as { headline?: string; body?: string };
    const result: SlideOverlay = { headline: parsed.headline ?? '' };
    if (parsed.body !== undefined) result.body = parsed.body;
    return result;
  } catch {
    return { headline: '' };
  }
}

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

  // Edit-text mode
  const initialOverlay = parseOverlay(slide.overlay_text);
  const [editMode, setEditMode] = useState(false);
  const [editHeadline, setEditHeadline] = useState(initialOverlay.headline);
  const [editBody, setEditBody] = useState(initialOverlay.body ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Increment after a successful save to bust the browser cache for the composed image
  const [composedBust, setComposedBust] = useState(0);

  function openEdit() {
    const overlay = parseOverlay(slide.overlay_text);
    setEditHeadline(overlay.headline);
    setEditBody(overlay.body ?? '');
    setSaveError('');
    setEditMode(true);
  }

  function cancelEdit() {
    setSaveError('');
    setEditMode(false);
  }

  async function handleSaveText() {
    const trimmedHeadline = editHeadline.trim();
    if (trimmedHeadline.length === 0) {
      setSaveError('El título no puede estar vacío.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/carousels/${carouselId}/slides/${idx}/text`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: trimmedHeadline,
          ...(editBody.trim() ? { body: editBody.trim() } : {}),
        }),
      });
      if (!res.ok) {
        let errCode: string | undefined;
        try {
          const body = await res.json() as { error?: string; message?: string };
          errCode = body.error ?? body.message;
        } catch {
          errCode = `HTTP ${res.status}`;
        }
        setSaveError(errCode ?? 'Error al guardar. Intentá de nuevo.');
        return;
      }
      setEditMode(false);
      setComposedBust((k) => k + 1);
    } catch {
      setSaveError('Error de red. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

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

  // Bust browser cache after a text save by appending a query param
  const composedUrl = signedUrl && composedBust > 0
    ? `${signedUrl}&_r=${composedBust}`
    : signedUrl;

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
              <SlideImage url={composedUrl} alt={`Slide ${idx + 1} compuesto`} />
            </TabsContent>
            <TabsContent value="base">
              <SlideImage url={signedBaseUrl} alt={`Slide ${idx + 1} base`} />
            </TabsContent>
          </Tabs>

          {/* Edit-text mode */}
          {editMode ? (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium uppercase tracking-widest text-white/40">
                    Título
                  </label>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {editHeadline.length}/{MAX_HEADLINE}
                  </span>
                </div>
                <input
                  type="text"
                  value={editHeadline}
                  onChange={(e) => setEditHeadline(e.target.value.slice(0, MAX_HEADLINE))}
                  maxLength={MAX_HEADLINE}
                  disabled={saving}
                  placeholder="Título del slide"
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium uppercase tracking-widest text-white/40">
                    Cuerpo <span className="normal-case text-white/25">(opcional)</span>
                  </label>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {editBody.length}/{MAX_BODY}
                  </span>
                </div>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value.slice(0, MAX_BODY))}
                  maxLength={MAX_BODY}
                  disabled={saving}
                  placeholder="Una oración corta y directa."
                  rows={2}
                  className="w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
                />
              </div>

              {saveError && (
                <p className="text-xs text-red-400">{saveError}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveText}
                  disabled={saving || editHeadline.trim().length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {saving ? 'Recomponiendo…' : 'Guardar texto'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-white/50 hover:text-white disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
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
                    onClick={openEdit}
                    disabled={regenerating}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar texto
                  </button>
                )}

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
            </>
          )}
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
