'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Library, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { visuals } from '@virus/shared';

type AssetChoices = visuals.AssetChoices;
type AssetChoice = visuals.AssetChoice;

const SLOTS = ['hook', 'reveal', 'cta'] as const;
type Slot = (typeof SLOTS)[number];

const SLOT_LABELS: Record<Slot, string> = {
  hook: 'Hook visual',
  reveal: 'Reveal',
  cta: 'CTA',
};

const SLOT_HINTS: Record<Slot, string> = {
  hook: 'Primer 0-3s. Video Luma.',
  reveal: 'Punchline. Imagen Gemini.',
  cta: 'Cierre. Video Luma.',
};

type ModeValue = 'fresh' | 'reuse' | 'manual';

const DEFAULT_CHOICES: AssetChoices = {
  hook: { mode: 'fresh' },
  reveal: { mode: 'fresh' },
  cta: { mode: 'fresh' },
};

interface AssetChoicesFormProps {
  initial?: AssetChoices;
  projectId: string;
  onChange: (choices: AssetChoices) => void;
  disabled?: boolean;
}

export function AssetChoicesForm({
  initial,
  projectId,
  onChange,
  disabled = false,
}: AssetChoicesFormProps) {
  const [choices, setChoices] = useState<AssetChoices>(initial ?? DEFAULT_CHOICES);
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);

  function updateSlot(slot: Slot, choice: AssetChoice) {
    const next: AssetChoices = { ...choices, [slot]: choice };
    setChoices(next);
    onChange(next);
  }

  function handleModeChange(slot: Slot, mode: ModeValue) {
    if (mode === 'manual') {
      // Open picker; only persist 'manual' once an asset is picked.
      setPickerSlot(slot);
      return;
    }
    updateSlot(slot, { mode });
  }

  function handleManualPicked(slot: Slot, assetId: string) {
    updateSlot(slot, { mode: 'manual', assetId });
    setPickerSlot(null);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-widest text-white/40 font-medium">
        Visuales generados por IA
      </div>
      <div className="grid gap-3">
        {SLOTS.map((slot) => {
          const value = choices[slot];
          const modeValue: ModeValue = value.mode;
          return (
            <div
              key={slot}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white/90">
                  {SLOT_LABELS[slot]}
                </div>
                <div className="text-[11px] text-white/40">{SLOT_HINTS[slot]}</div>
                {value.mode === 'manual' && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    <Library className="size-3" />
                    Manual: <span className="font-mono">{value.assetId.slice(0, 8)}…</span>
                  </div>
                )}
              </div>
              <Select
                value={modeValue}
                onValueChange={(v) => handleModeChange(slot, v as ModeValue)}
                disabled={disabled}
              >
                <SelectTrigger className="w-[160px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresh">
                    <Sparkles className="size-3.5" /> Generar fresh
                  </SelectItem>
                  <SelectItem value="reuse">
                    <Library className="size-3.5" /> Reusar de biblioteca
                  </SelectItem>
                  <SelectItem value="manual">
                    <ImageIcon className="size-3.5" /> Elegir manual…
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {pickerSlot && (
        <ManualAssetPicker
          slot={pickerSlot}
          projectId={projectId}
          onClose={() => setPickerSlot(null)}
          onPick={(assetId) => handleManualPicked(pickerSlot, assetId)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual picker dialog
// ---------------------------------------------------------------------------

interface PickerAsset {
  id: string;
  type: 'video' | 'image';
  category: 'hook' | 'reveal' | 'cta';
  prompt: string;
  url: string | null;
}

interface ManualAssetPickerProps {
  slot: Slot;
  projectId: string;
  onClose: () => void;
  onPick: (assetId: string) => void;
}

function ManualAssetPicker({ slot, projectId, onClose, onPick }: ManualAssetPickerProps) {
  const [assets, setAssets] = useState<PickerAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    async function load() {
      setError(null);
      try {
        const params = new URLSearchParams({
          projectId,
          category: slot,
          limit: '24',
        });
        const res = await fetch(`/api/assets?${params.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { assets: PickerAsset[] };
        setAssets(body.assets ?? []);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Error al cargar');
        setAssets([]);
      }
    }
    void load();
    return () => ctrl.abort();
  }, [projectId, slot]);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Elegir asset manual — {SLOT_LABELS[slot]}</DialogTitle>
          <DialogDescription>
            Pickeá un asset existente de la biblioteca del proyecto.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {assets === null ? (
          <div className="flex items-center justify-center py-12 text-white/40">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : assets.length === 0 ? (
          <div className="py-10 text-center text-sm text-white/50">
            Aún no hay assets {slot} en este proyecto.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onPick(a.id)}
                className={cn(
                  'group relative overflow-hidden rounded-lg border border-white/[0.08]',
                  'bg-black/40 hover:border-emerald-500/50 transition-colors text-left',
                )}
              >
                <div className="aspect-[9/16] w-full bg-black">
                  {a.url ? (
                    a.type === 'video' ? (
                      <video
                        src={a.url}
                        muted
                        loop
                        autoPlay
                        playsInline
                        className="size-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.url}
                        alt={a.prompt.slice(0, 60)}
                        className="size-full object-cover"
                      />
                    )
                  ) : (
                    <div className="flex size-full items-center justify-center text-white/30">
                      {a.type === 'video' ? (
                        <VideoIcon className="size-8" />
                      ) : (
                        <ImageIcon className="size-8" />
                      )}
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5 text-[11px] text-white/60 line-clamp-2">
                  {a.prompt}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
