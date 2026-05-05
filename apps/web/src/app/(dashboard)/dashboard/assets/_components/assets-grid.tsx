'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  Trash2,
  Tag,
  RefreshCw,
  Filter,
  Library,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetGridRow {
  id: string;
  project_id: string;
  type: 'video' | 'image';
  category: 'hook' | 'reveal' | 'cta';
  provider: string;
  status: 'pending' | 'ready' | 'failed';
  prompt: string;
  prompt_hash: string;
  template: string;
  language: string;
  storage_path: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  theme_color: string;
  tags: string[];
  burned: boolean;
  last_used_at: string | null;
  error: string | null;
  created_at: string;
  url: string | null;
}

type CategoryFilter = 'all' | 'hook' | 'reveal' | 'cta';
type TypeFilter = 'all' | 'video' | 'image';
type BurnedFilter = 'no' | 'yes' | 'all';

interface AssetsGridProps {
  initial: AssetGridRow[];
  initialUseCounts: Record<string, number>;
  projectId: string;
  initialFilters: {
    category: CategoryFilter;
    type: TypeFilter;
    burned: BurnedFilter;
    tag: string;
  };
}

const PAGE_SIZE = 24;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssetsGrid({
  initial,
  initialUseCounts,
  projectId,
  initialFilters,
}: AssetsGridProps) {
  const [assets, setAssets] = useState<AssetGridRow[]>(initial);
  const [useCounts, setUseCounts] =
    useState<Record<string, number>>(initialUseCounts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<CategoryFilter>(initialFilters.category);
  const [type, setType] = useState<TypeFilter>(initialFilters.type);
  const [burned, setBurned] = useState<BurnedFilter>(initialFilters.burned);
  const [tag, setTag] = useState(initialFilters.tag);
  const [tagDraft, setTagDraft] = useState(initialFilters.tag);

  const [tagDialog, setTagDialog] = useState<AssetGridRow | null>(null);
  const [, startTransition] = useTransition();

  // Reload from API when filters change
  useEffect(() => {
    const ctrl = new AbortController();
    async function reload() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          projectId,
          limit: String(PAGE_SIZE),
          page: '1',
        });
        if (category !== 'all') params.set('category', category);
        if (type !== 'all') params.set('type', type);
        params.set('burned', burned === 'no' ? 'false' : burned === 'yes' ? 'true' : 'all');
        if (tag.trim()) params.set('tag', tag.trim());

        const res = await fetch(`/api/assets?${params.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { assets: AssetGridRow[] };
        startTransition(() => {
          setAssets(body.assets);
          setPage(1);
          setHasMore(body.assets.length === PAGE_SIZE);
        });
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Error al cargar');
      } finally {
        setLoading(false);
      }
    }
    void reload();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, type, burned, tag, projectId]);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const next = page + 1;
      const params = new URLSearchParams({
        projectId,
        limit: String(PAGE_SIZE),
        page: String(next),
      });
      if (category !== 'all') params.set('category', category);
      if (type !== 'all') params.set('type', type);
      params.set('burned', burned === 'no' ? 'false' : burned === 'yes' ? 'true' : 'all');
      if (tag.trim()) params.set('tag', tag.trim());

      const res = await fetch(`/api/assets?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { assets: AssetGridRow[] };
      setAssets((prev) => [...prev, ...body.assets]);
      setPage(next);
      setHasMore(body.assets.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar más');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(asset: AssetGridRow) {
    if (!confirm(`¿Marcar este asset como burned? Los videos pasados que lo usaron siguen funcionando.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistic update
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, burned: true } : a)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  async function handleRegenerate(asset: AssetGridRow) {
    try {
      const res = await fetch(`/api/assets/${asset.id}/regenerate`, {
        method: 'POST',
      });
      if (res.status === 501) {
        setError(
          'La regeneración manual de assets aún no está implementada (V1). Próximamente.',
        );
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al regenerar');
    }
  }

  async function handleSaveTags(asset: AssetGridRow, tags: string[]) {
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, tags } : a)),
      );
      setTagDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar tags');
    }
  }

  const counts = useMemo(() => assets.length, [assets]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
        <Filter className="size-4 text-white/40" />

        <Select
          value={category}
          onValueChange={(v) => setCategory(v as CategoryFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            <SelectItem value="hook">Hook</SelectItem>
            <SelectItem value="reveal">Reveal</SelectItem>
            <SelectItem value="cta">CTA</SelectItem>
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={(v) => setType(v as TypeFilter)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="image">Imagen</SelectItem>
          </SelectContent>
        </Select>

        <Select value={burned} onValueChange={(v) => setBurned(v as BurnedFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">Solo activos</SelectItem>
            <SelectItem value="yes">Solo burned</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTag(tagDraft);
          }}
          className="flex items-center gap-1"
        >
          <Input
            placeholder="Tag…"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            className="h-8 w-[140px]"
          />
          <Button type="submit" size="sm" variant="outline">
            Filtrar
          </Button>
        </form>

        <div className="ml-auto text-xs text-white/40">
          {counts} {counts === 1 ? 'asset' : 'assets'}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {assets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assets.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              useCount={useCounts[a.id] ?? 0}
              onDelete={() => handleDelete(a)}
              onRegenerate={() => handleRegenerate(a)}
              onTag={() => setTagDialog(a)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button onClick={loadMore} disabled={loading} variant="outline">
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Cargar más
          </Button>
        </div>
      )}

      {tagDialog && (
        <TagsDialog
          asset={tagDialog}
          onClose={() => setTagDialog(null)}
          onSave={(tags) => handleSaveTags(tagDialog, tags)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetCard
// ---------------------------------------------------------------------------

function AssetCard({
  asset,
  useCount,
  onDelete,
  onRegenerate,
  onTag,
}: {
  asset: AssetGridRow;
  useCount: number;
  onDelete: () => void;
  onRegenerate: () => void;
  onTag: () => void;
}) {
  const lastUsed = asset.last_used_at ? formatRelativeDays(asset.last_used_at) : 'Nunca';

  return (
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-white/[0.04] transition-colors',
        asset.burned
          ? 'border-red-500/20 opacity-60'
          : 'border-white/[0.08] hover:border-white/[0.16]',
      )}
    >
      <div className="relative aspect-[9/16] w-full bg-black">
        {asset.url && asset.status === 'ready' ? (
          asset.type === 'video' ? (
            <video
              src={asset.url}
              muted
              loop
              autoPlay
              playsInline
              className="size-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.url}
              alt={asset.prompt.slice(0, 60)}
              className="size-full object-cover"
            />
          )
        ) : (
          <div className="flex size-full items-center justify-center text-white/30">
            {asset.type === 'video' ? (
              <VideoIcon className="size-10" />
            ) : (
              <ImageIcon className="size-10" />
            )}
          </div>
        )}
        <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/80">
          {asset.category}
        </div>
        {asset.burned && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-red-500/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-200">
            burned
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-xs text-white/70 line-clamp-2 min-h-[2.4em]">
          {asset.prompt.length > 80 ? `${asset.prompt.slice(0, 80)}…` : asset.prompt}
        </p>
        <div className="flex items-center justify-between text-[11px] text-white/40">
          <span>{lastUsed}</span>
          <span>
            usado {useCount}{useCount === 1 ? ' vez' : ' veces'}
          </span>
        </div>

        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/60"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center gap-1 pt-2">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onTag}
            aria-label="Editar tags"
          >
            <Tag className="size-3" />
            Tags
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onRegenerate}
            aria-label="Regenerar"
          >
            <RefreshCw className="size-3" />
            Regenerar
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onDelete}
            aria-label="Eliminar"
            className="ml-auto text-red-300 hover:text-red-200 hover:bg-red-500/10"
            disabled={asset.burned}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TagsDialog
// ---------------------------------------------------------------------------

function TagsDialog({
  asset,
  onClose,
  onSave,
}: {
  asset: AssetGridRow;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState(asset.tags.join(', '));

  function handleSave() {
    const tags = draft
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 32);
    onSave(tags);
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tags</DialogTitle>
          <DialogDescription>
            Separá los tags con comas. Máximo 32 tags por asset.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="cinematic, dev, reveal"
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-12 flex flex-col items-center text-center">
      <Library className="w-10 h-10 text-white/20 mb-4" />
      <p className="text-sm text-white/60 font-medium">
        Aún no hay assets en este proyecto
      </p>
      <p className="text-xs text-white/40 mt-1.5 max-w-md">
        Los assets se generan automáticamente cuando aprobás una idea con la pipeline
        de visuales habilitada.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDays(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diffMs = Date.now() - ts;
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return 'Usado hoy';
  if (days === 1) return 'Hace 1 día';
  if (days < 30) return `Hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'Hace 1 mes';
  return `Hace ${months} meses`;
}
