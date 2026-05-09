'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import type { CarouselCaptionRow } from '@/app/(dashboard)/dashboard/carousels/[id]/page';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CaptionPickerProps {
  captions: CarouselCaptionRow[];
  carouselId: string;
  onRegenerate: () => Promise<void>;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const FRAMEWORK_LABELS: Record<string, string> = {
  pas: 'Hook + PAS + CTA',
  aida: 'Hook + AIDA',
  hook_story_cta: 'Contrarian',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCaption(fullText: string): { body: string; hashtags: string[] } {
  const sep = fullText.lastIndexOf('\n\n');
  if (sep === -1) return { body: fullText, hashtags: [] };
  const tail = fullText.slice(sep + 2);
  if (/^#\w/.test(tail)) {
    const tags = (tail.match(/#(\w+)/g) ?? []).map(h => h.slice(1));
    return { body: fullText.slice(0, sep), hashtags: tags };
  }
  return { body: fullText, hashtags: [] };
}

function computeCharCount(body: string, hashtags: string[]): number {
  return body.length + (hashtags.length > 0 ? 2 + hashtags.map(h => '#' + h).join(' ').length : 0);
}

// ─── CaptionPicker ────────────────────────────────────────────────────────────

export function CaptionPicker({ captions, carouselId, onRegenerate }: CaptionPickerProps) {
  const [editedBodies, setEditedBodies] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const c of captions) {
      map[c.variant_idx] = parseCaption(c.text).body;
    }
    return map;
  });

  const [editedHashtags, setEditedHashtags] = useState<Record<number, string[]>>(() => {
    const map: Record<number, string[]> = {};
    for (const c of captions) {
      map[c.variant_idx] = parseCaption(c.text).hashtags;
    }
    return map;
  });

  const [saveStatus, setSaveStatus] = useState<Record<number, SaveStatus>>({});
  const [selectedIdx, setSelectedIdx] = useState<number | null>(
    () => captions.find(c => c.selected)?.variant_idx ?? null,
  );
  const [regenerating, setRegenerating] = useState(false);

  const saveTimers = useRef<Record<number, NodeJS.Timeout>>({});

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  // When new captions arrive (e.g. after regenerate), seed state for any missing variants
  useEffect(() => {
    setEditedBodies(prev => {
      const next = { ...prev };
      for (const c of captions) {
        if (!(c.variant_idx in next)) {
          next[c.variant_idx] = parseCaption(c.text).body;
        }
      }
      return next;
    });
    setEditedHashtags(prev => {
      const next = { ...prev };
      for (const c of captions) {
        if (!(c.variant_idx in next)) {
          next[c.variant_idx] = parseCaption(c.text).hashtags;
        }
      }
      return next;
    });
  }, [captions]);

  // ── Auto-save ──────────────────────────────────────────────────────────────

  function scheduleAutoSave(variantIdx: number, body: string, hashtags: string[]) {
    clearTimeout(saveTimers.current[variantIdx]);
    setSaveStatus(prev => ({ ...prev, [variantIdx]: 'saving' }));
    saveTimers.current[variantIdx] = setTimeout(() => {
      void doSave(variantIdx, body, hashtags);
    }, 800);
  }

  async function doSave(variantIdx: number, body: string, hashtags: string[]) {
    const res = await fetch(`/api/carousels/${carouselId}/captions/${variantIdx}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: body, hashtags }),
    });
    setSaveStatus(prev => ({
      ...prev,
      [variantIdx]: res.ok ? 'saved' : 'error',
    }));
  }

  // ── Hashtag helpers ────────────────────────────────────────────────────────

  function addHashtag(variantIdx: number, raw: string) {
    const tag = raw.replace(/^#+/, '').trim().toLowerCase();
    if (!tag) return;
    setEditedHashtags(prev => {
      const existing = prev[variantIdx] ?? [];
      if (existing.includes(tag)) return prev;
      const updated = [...existing, tag];
      scheduleAutoSave(variantIdx, editedBodies[variantIdx] ?? '', updated);
      return { ...prev, [variantIdx]: updated };
    });
  }

  function removeHashtag(variantIdx: number, tag: string) {
    setEditedHashtags(prev => {
      const updated = (prev[variantIdx] ?? []).filter(h => h !== tag);
      scheduleAutoSave(variantIdx, editedBodies[variantIdx] ?? '', updated);
      return { ...prev, [variantIdx]: updated };
    });
  }

  // ── Action handlers ────────────────────────────────────────────────────────

  async function handleCopy(variantIdx: number) {
    const body = editedBodies[variantIdx] ?? '';
    const hashtags = editedHashtags[variantIdx] ?? [];
    const full = hashtags.length > 0
      ? body + '\n\n' + hashtags.map(h => '#' + h).join(' ')
      : body;
    await navigator.clipboard.writeText(full);
    toast('Copiado al portapapeles');
  }

  async function handleSelect(variantIdx: number) {
    const prev = selectedIdx;
    setSelectedIdx(variantIdx);
    const res = await fetch(`/api/carousels/${carouselId}/captions/${variantIdx}/select`, {
      method: 'POST',
    });
    if (!res.ok) {
      setSelectedIdx(prev);
      toast.error('Error al marcar caption');
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await onRegenerate();
    } catch {
      toast.error('Error al regenerar captions');
    } finally {
      setRegenerating(false);
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (captions.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-6 space-y-4">
        <p className="text-xs font-medium uppercase tracking-widest text-white/40">Caption</p>
        <p className="text-sm text-white/50">Generando captions… ~15s</p>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4 bg-white/5" />
          <Skeleton className="h-4 w-1/2 bg-white/5" />
          <Skeleton className="h-4 w-2/3 bg-white/5" />
        </div>
      </div>
    );
  }

  // ── Loaded state ───────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-6 space-y-4">
      <p className="text-xs font-medium uppercase tracking-widest text-white/40">Caption</p>

      <Tabs defaultValue={captions[0]?.framework ?? 'pas'} className="w-full">
        <TabsList className="flex overflow-x-auto w-full gap-1 bg-white/5 p-1 rounded-lg mb-4">
          {captions.map(caption => (
            <TabsTrigger
              key={caption.variant_idx}
              value={caption.framework}
              className="flex-1 text-xs text-white/60 data-active:text-white data-active:bg-white/10"
            >
              <span className="flex items-center gap-1.5">
                {FRAMEWORK_LABELS[caption.framework] ?? caption.framework}
                {selectedIdx === caption.variant_idx && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#C8FF57]" />
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {captions.map(caption => {
          const body = editedBodies[caption.variant_idx] ?? '';
          const hashtags = editedHashtags[caption.variant_idx] ?? [];
          const charCount = computeCharCount(body, hashtags);
          const charWarning = charCount < 120 ? 'text-amber-400' : charCount > 300 ? 'text-red-400' : 'text-white/40';
          const status = saveStatus[caption.variant_idx] ?? 'idle';
          const isSelected = selectedIdx === caption.variant_idx;

          return (
            <TabsContent key={caption.variant_idx} value={caption.framework} className="space-y-3">
              {/* Framework pill */}
              <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/60">
                {FRAMEWORK_LABELS[caption.framework] ?? caption.framework}
              </span>

              {/* Textarea */}
              <Textarea
                value={body}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditedBodies(prev => ({ ...prev, [caption.variant_idx]: val }));
                  scheduleAutoSave(caption.variant_idx, val, hashtags);
                }}
                className="min-h-[120px] bg-white/5 border-white/10 text-white/80 resize-none"
              />

              {/* Char counter + save indicator */}
              <div className="flex items-center justify-between">
                <span className={cn('text-xs tabular-nums', charWarning)}>
                  {charCount} caracteres
                </span>
                {status === 'saving' && (
                  <span className="text-white/30 text-xs">Guardando…</span>
                )}
                {status === 'saved' && (
                  <span className="text-emerald-400 text-xs">Guardado</span>
                )}
                {status === 'error' && (
                  <span className="text-red-400 text-xs">Error al guardar</span>
                )}
              </div>

              {/* Hashtag chips */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {hashtags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeHashtag(caption.variant_idx, tag)}
                      className="text-white/40 hover:text-white/80 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder="#hashtag"
                  className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-white/60 outline-none focus:border-white/30 w-24"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addHashtag(caption.variant_idx, e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => void handleCopy(caption.variant_idx)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-xs font-medium text-white/60 hover:border-white/20 hover:text-white/80 transition-colors"
                >
                  Copiar
                </button>

                <button
                  type="button"
                  onClick={() => void handleSelect(caption.variant_idx)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    isSelected
                      ? 'border-[#C8FF57]/40 bg-[#C8FF57] text-[#111318]'
                      : 'border-white/10 bg-transparent text-white/60 hover:border-white/20 hover:text-white/80',
                  )}
                >
                  {isSelected ? 'Elegido' : 'Marcar como elegido'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleRegenerate()}
                  disabled={regenerating}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-transparent px-3 py-1.5 text-xs font-medium text-white/40 hover:border-white/15 hover:text-white/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
                >
                  {regenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : null}
                  Regenerar todas
                </button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
