'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clapperboard,
  CheckCircle2,
  Film,
  Mic,
  PenLine,
  Send,
  Sparkles,
  TimerReset,
  TriangleAlert,
  Loader2,
  RefreshCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { createClient } from '@/lib/supabase/browser';
import type { PipelineVideoRow } from '../page';

type Status = PipelineVideoRow['status'];
type StatusFilter = 'all' | 'active' | 'ready' | 'published' | 'failed';

const ACTIVE_STATUSES: Status[] = ['pending', 'scripting', 'audio', 'captions', 'rendering'];

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'En proceso' },
  { id: 'ready', label: 'Listos' },
  { id: 'published', label: 'Publicados' },
  { id: 'failed', label: 'Fallidos' },
];

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Esperando',
  scripting: 'Escribiendo',
  audio: 'Audio',
  captions: 'Subtítulos',
  rendering: 'Renderizando',
  ready: 'Listo',
  published: 'Publicado',
  failed: 'Fallido',
};

const STATUS_PROGRESS: Record<Status, number> = {
  pending: 5,
  scripting: 20,
  audio: 45,
  captions: 65,
  rendering: 85,
  ready: 100,
  published: 100,
  failed: 0,
};

const STATUS_COLOR: Record<Status, string> = {
  pending: 'text-white/60',
  scripting: 'text-blue-400',
  audio: 'text-purple-400',
  captions: 'text-amber-400',
  rendering: 'text-orange-400',
  ready: 'text-emerald-400',
  published: 'text-emerald-300',
  failed: 'text-red-400',
};

function StatusIcon({ status }: { status: Status }) {
  const cls = `w-5 h-5 shrink-0 ${STATUS_COLOR[status]}`;
  switch (status) {
    case 'pending':
      return <TimerReset className={cls} />;
    case 'scripting':
      return <PenLine className={`${cls} animate-pulse`} />;
    case 'audio':
      return <Mic className={`${cls} animate-pulse`} />;
    case 'captions':
      return <Sparkles className={`${cls} animate-pulse`} />;
    case 'rendering':
      return <Film className={`${cls} animate-spin`} style={{ animationDuration: '3s' }} />;
    case 'ready':
      return <CheckCircle2 className={cls} />;
    case 'published':
      return <Send className={cls} />;
    case 'failed':
      return <TriangleAlert className={cls} />;
  }
}

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

/**
 * Mount-only relative time. The server renders an empty span; after hydration
 * the client computes and updates every 30s. Avoids the SSR/CSR mismatch that
 * `relativeTime(now)` causes when the second crosses between server render
 * and client hydration.
 */
function RelativeTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setText(relativeTime(iso));
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [iso]);
  // Render the same wrapper element on both server and client so React's
  // hydration aligns the tree shape; only the text content is empty initially.
  return <span suppressHydrationWarning>{text ?? ''}</span>;
}

interface PipelineClientProps {
  initialVideos: PipelineVideoRow[];
}

export default function PipelineClient({ initialVideos }: PipelineClientProps) {
  const [videos, setVideos] = useState<PipelineVideoRow[]>(initialVideos);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const channelName = `pipeline-page-${user.id}-${Math.random().toString(36).slice(2, 8)}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'videos',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (cancelled) return;
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT') {
              const row = newRecord as PipelineVideoRow;
              setVideos((prev) => [row, ...prev].slice(0, 100));
            } else if (eventType === 'UPDATE') {
              const row = newRecord as PipelineVideoRow;
              setVideos((prev) =>
                prev.map((v) => (v.id === row.id ? { ...v, ...row } : v)),
              );
            } else if (eventType === 'DELETE') {
              const row = oldRecord as { id: string };
              setVideos((prev) => prev.filter((v) => v.id !== row.id));
            }
          },
        )
        .subscribe();

      if (cancelled && channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    init();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, []);

  const counts = useMemo(() => {
    const c = { all: videos.length, active: 0, ready: 0, published: 0, failed: 0 };
    for (const v of videos) {
      if (v.status === 'ready') c.ready++;
      else if (v.status === 'published') c.published++;
      else if (v.status === 'failed') c.failed++;
      else if (ACTIVE_STATUSES.includes(v.status)) c.active++;
    }
    return c;
  }, [videos]);

  const filtered = useMemo(() => {
    if (filter === 'all') return videos;
    if (filter === 'active') return videos.filter((v) => ACTIVE_STATUSES.includes(v.status));
    return videos.filter((v) => v.status === filter);
  }, [videos, filter]);

  async function handleRetry(videoId: string) {
    setRetryingId(videoId);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/retry`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reintentar');
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      <header>
        <div className="flex items-center gap-2 text-white/40 mb-2">
          <Clapperboard size={16} />
          <span className="text-xs font-medium uppercase tracking-widest">Pipeline</span>
        </div>
        <h1 className="text-3xl font-bold text-white">Videos en producción</h1>
        <p className="text-sm text-white/50 mt-1">
          Estado en tiempo real de cada paso: script → audio → subtítulos → render → publicación.
        </p>
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
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.map((video) => (
              <motion.li
                key={video.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
              >
                <VideoRow
                  video={video}
                  retrying={retryingId === video.id}
                  onRetry={() => handleRetry(video.id)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}

function VideoRow({
  video,
  retrying,
  onRetry,
}: {
  video: PipelineVideoRow;
  retrying: boolean;
  onRetry: () => void;
}) {
  const title = video.video_ideas?.hook ?? 'Video sin idea';
  const isFailed = video.status === 'failed';
  const errorSummary = video.error ? video.error.split('\n')[0]?.slice(0, 200) : null;
  const isReady = video.status === 'ready' || video.status === 'published';

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-colors',
        isFailed
          ? 'border-red-500/[0.2] bg-red-500/[0.04]'
          : 'border-white/[0.08] bg-white/[0.04] hover:border-white/[0.15]',
      )}
    >
      <div className="flex items-start gap-4">
        <StatusIcon status={video.status} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                STATUS_COLOR[video.status],
              )}
            >
              {STATUS_LABELS[video.status]}
            </span>
            {video.video_ideas?.format && (
              <span className="text-[10px] uppercase tracking-wide text-white/40">
                · {video.video_ideas.format}
              </span>
            )}
            <span className="text-[10px] text-white/40">· <RelativeTime iso={video.created_at} /></span>
          </div>

          <p className="text-sm font-medium text-white leading-snug line-clamp-2">{title}</p>

          {errorSummary && (
            <p className="text-xs text-red-300/80 mt-2 font-mono break-all line-clamp-2">
              {errorSummary}
            </p>
          )}

          <div className="mt-3 flex items-center gap-3">
            <Progress value={STATUS_PROGRESS[video.status]} className="h-1 flex-1" />
            <span className="text-[10px] text-white/40 tabular-nums shrink-0">
              {STATUS_PROGRESS[video.status]}%
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {isFailed && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/[0.3] bg-red-500/[0.1] px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/[0.2] disabled:opacity-50 transition-colors"
            >
              {retrying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="w-3.5 h-3.5" />
              )}
              Reintentar
            </button>
          )}
          {isReady && video.video_url && (
            <a
              href={video.video_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/[0.3] bg-emerald-500/[0.1] px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/[0.2] transition-colors"
            >
              Ver render →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-12 flex flex-col items-center text-center">
      <Clapperboard className="w-10 h-10 text-white/20 mb-4" />
      <p className="text-sm text-white/60 font-medium">No hay videos en este filtro</p>
      <p className="text-xs text-white/40 mt-1.5 max-w-md">
        Andá a <a href="/dashboard/ideas" className="text-[#C8FF57] hover:underline">Ideas</a> y tocá &quot;Generar video de prueba&quot; para arrancar uno.
      </p>
    </div>
  );
}
