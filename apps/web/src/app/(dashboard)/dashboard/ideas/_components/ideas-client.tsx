'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  Check,
  X,
  Sparkles,
  Clock,
  PlayCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IdeaRow } from '../page';
import { AssetChoicesForm } from './asset-choices-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { visuals } from '@virus/shared';

type AssetChoices = visuals.AssetChoices;

const DEFAULT_ASSET_CHOICES: AssetChoices = {
  hook: { mode: 'fresh' },
  reveal: { mode: 'fresh' },
  cta: { mode: 'fresh' },
};

type StatusFilter = 'all' | 'draft' | 'approved' | 'rejected' | 'scripted';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'draft', label: 'Borradores' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'scripted', label: 'En script' },
  { id: 'rejected', label: 'Rechazadas' },
];

const STATUS_STYLES: Record<IdeaRow['status'], string> = {
  draft: 'bg-white/[0.06] text-white/60 border-white/[0.1]',
  approved: 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/[0.25]',
  scripted: 'bg-blue-500/[0.12] text-blue-300 border-blue-500/[0.25]',
  rejected: 'bg-red-500/[0.12] text-red-300 border-red-500/[0.25]',
};

const STATUS_LABELS: Record<IdeaRow['status'], string> = {
  draft: 'Borrador',
  approved: 'Aprobada',
  scripted: 'En script',
  rejected: 'Rechazada',
};

interface IdeasClientProps {
  initialIdeas: IdeaRow[];
  projectId: string | null;
  projectName: string | null;
}

export default function IdeasClient({
  initialIdeas,
  projectId,
  projectName,
}: IdeasClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [ideas, setIdeas] = useState<IdeaRow[]>(initialIdeas);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Approve flow with asset choices dialog
  const [approveTarget, setApproveTarget] = useState<IdeaRow | null>(null);
  const [pendingChoices, setPendingChoices] =
    useState<AssetChoices>(DEFAULT_ASSET_CHOICES);

  const filtered = useMemo(() => {
    if (filter === 'all') return ideas;
    return ideas.filter((i) => i.status === filter);
  }, [ideas, filter]);

  const counts = useMemo(() => {
    const c = { all: ideas.length, draft: 0, approved: 0, rejected: 0, scripted: 0 };
    for (const i of ideas) c[i.status]++;
    return c;
  }, [ideas]);

  function openApproveDialog(idea: IdeaRow) {
    setError(null);
    setPendingChoices(DEFAULT_ASSET_CHOICES);
    setApproveTarget(idea);
  }

  async function confirmApprove() {
    if (!approveTarget) return;
    const ideaId = approveTarget.id;
    setBusyId(ideaId);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_choices: pendingChoices }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setIdeas((prev) =>
        prev.map((i) => (i.id === ideaId ? { ...i, status: 'approved' } : i)),
      );
      setApproveTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar');
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerateTestVideo() {
    if (!projectId) {
      setError('No hay proyecto disponible');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ideas/test-seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, autoApprove: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        videoId?: string;
        ideaId?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      router.push('/dashboard/pipeline');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar');
      setGenerating(false);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-white/40 mb-2">
            <Lightbulb size={16} />
            <span className="text-xs font-medium uppercase tracking-widest">Ideas</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Banco de ideas</h1>
          <p className="text-sm text-white/50 mt-1">
            {projectName ? `Proyecto: ${projectName}` : 'Sin proyecto activo'} · Aprobá una idea o generá un video de prueba directo.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerateTestVideo}
          disabled={!projectId || generating}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors',
            'bg-[#C8FF57] text-black hover:bg-[#b7ed42] disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Generar video de prueba
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          const count = counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-[#C8FF57] bg-[#C8FF57]/10 text-[#C8FF57]'
                  : 'border-white/[0.08] bg-white/[0.04] text-white/60 hover:border-white/[0.15] hover:text-white/80',
              )}
            >
              {f.label}
              <span className={cn('text-xs', active ? 'text-[#C8FF57]/70' : 'text-white/40')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.map((idea, i) => (
              <motion.li
                key={idea.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.15) }}
              >
                <IdeaCard
                  idea={idea}
                  busy={busyId === idea.id}
                  onApprove={() => openApproveDialog(idea)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Dialog
        open={approveTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) setApproveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aprobar y generar video</DialogTitle>
            <DialogDescription>
              Elegí cómo querés que se generen los visuales de cada slot. Por defecto se
              generan frescos.
            </DialogDescription>
          </DialogHeader>

          {approveTarget && projectId && (
            <AssetChoicesForm
              projectId={projectId}
              initial={DEFAULT_ASSET_CHOICES}
              onChange={setPendingChoices}
              disabled={busyId !== null}
            />
          )}

          {!projectId && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
              No hay proyecto activo — los visuales se generarán con defaults.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setApproveTarget(null)}
              disabled={busyId !== null}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmApprove}
              disabled={busyId !== null}
              className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40"
            >
              {busyId === approveTarget?.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Confirmar aprobación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IdeaCard({
  idea,
  busy,
  onApprove,
}: {
  idea: IdeaRow;
  busy: boolean;
  onApprove: () => void;
}) {
  const canApprove = idea.status === 'draft';

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5 hover:border-white/[0.15] transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                STATUS_STYLES[idea.status],
              )}
            >
              {STATUS_LABELS[idea.status]}
            </span>
            {idea.format && (
              <span className="text-[10px] uppercase tracking-wide text-white/40">
                · {idea.format}
              </span>
            )}
            {idea.estimated_duration != null && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
                <Clock className="w-3 h-3" />
                {idea.estimated_duration}s
              </span>
            )}
          </div>
          <p className="text-base font-medium text-white leading-snug">
            {idea.hook ?? 'Sin hook'}
          </p>
          {idea.angle && (
            <p className="text-sm text-white/50 mt-1.5 line-clamp-2">{idea.angle}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {idea.status === 'scripted' && (
            <a
              href={`/dashboard/pipeline`}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/[0.08] transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Ver render
            </a>
          )}
          {canApprove && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/[0.15] border border-emerald-500/[0.3] px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/[0.25] disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Aprobar y generar
            </button>
          )}
          {idea.status === 'approved' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300/70">
              <Check className="w-3.5 h-3.5" />
              En cola
            </span>
          )}
          {idea.status === 'rejected' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-white/30">
              <X className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: StatusFilter }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-12 flex flex-col items-center text-center">
      <Lightbulb className="w-10 h-10 text-white/20 mb-4" />
      <p className="text-sm text-white/60 font-medium">
        {filter === 'all'
          ? 'Aún no hay ideas en este proyecto'
          : `No hay ideas con estado "${STATUS_LABELS[filter as IdeaRow['status']]}"`}
      </p>
      <p className="text-xs text-white/40 mt-1.5 max-w-md">
        Por ahora las ideas se crean automáticamente cuando el motor sugiere un hook al generar un video. Tocá <span className="text-[#C8FF57]">Generar video de prueba</span> para que el sistema sugiera y guarde una idea nueva.
      </p>
    </div>
  );
}
