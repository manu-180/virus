'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutGrid, Plus, Images } from 'lucide-react';
import type { CarouselListItem } from '@/app/(dashboard)/dashboard/carousels/page';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  generating_slides: 'Generando',
  composing: 'Componiendo',
  generating_captions: 'Captions',
  ready: 'Listo',
  failed: 'Fallido',
};

const STATUS_PILL: Record<string, string> = {
  pending: 'text-white/60 border-white/20 bg-white/5',
  generating_slides: 'text-blue-400 border-blue-400/30 bg-blue-400/10 animate-pulse',
  composing: 'text-blue-400 border-blue-400/30 bg-blue-400/10 animate-pulse',
  generating_captions: 'text-blue-400 border-blue-400/30 bg-blue-400/10 animate-pulse',
  ready: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  failed: 'text-red-400 border-red-400/30 bg-red-400/10',
};

const IN_PROGRESS = new Set(['generating_slides', 'composing', 'generating_captions', 'pending']);

const FILTER_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'ready', label: 'Listos' },
  { value: 'in-progress', label: 'En progreso' },
  { value: 'failed', label: 'Fallidos' },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'justo ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

interface Props {
  items: CarouselListItem[];
  statusFilter: string | null;
}

export default function CarouselsList({ items, statusFilter }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function handleFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const params = new URLSearchParams();
    if (val) params.set('status', val);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#111318] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
            <Images className="h-8 w-8 text-white/25" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            {statusFilter ? 'Sin resultados para este filtro' : 'Sin carruseles todavía'}
          </h2>
          <p className="text-white/50 text-sm mb-6">
            {statusFilter
              ? 'Cambia o elimina el filtro para ver otros carruseles.'
              : 'Crea tu primer carrusel y aparecerá aquí.'}
          </p>
          {!statusFilter && (
            <Link
              href="/dashboard/carousels/new"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Crear primer carrusel
            </Link>
          )}
          {statusFilter && (
            <button
              onClick={() => router.push(pathname)}
              className="text-sm text-accent hover:underline"
            >
              Ver todos los carruseles
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LayoutGrid className="h-5 w-5 text-accent shrink-0" aria-hidden />
            <h1 className="text-xl font-bold text-white">Carruseles</h1>
            <span className="text-sm text-white/40">
              {items.length} resultado{items.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={statusFilter ?? ''}
              onChange={handleFilterChange}
              className="rounded-md border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-sm text-white/70 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
              aria-label="Filtrar por estado"
            >
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <Link
              href="/dashboard/carousels/new"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nuevo
            </Link>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => {
            const pillClass = STATUS_PILL[item.status] ?? STATUS_PILL.pending;
            const isInProgress = IN_PROGRESS.has(item.status);

            return (
              <Link
                key={item.id}
                href={`/dashboard/carousels/${item.id}`}
                className="group block rounded-xl border border-white/[0.08] bg-white/[0.04] overflow-hidden hover:border-white/[0.18] hover:bg-white/[0.07] transition-all duration-200"
              >
                {/* Thumbnail — 4:5 ratio */}
                <div className="relative aspect-[4/5] bg-white/[0.06] overflow-hidden">
                  {item.thumb_url ? (
                    <Image
                      src={item.thumb_url}
                      alt={item.brief.topic as string}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      {isInProgress ? (
                        <div className="h-6 w-6 rounded-full border-2 border-blue-400/40 border-t-blue-400 animate-spin" />
                      ) : (
                        <Images className="h-8 w-8 text-white/20" />
                      )}
                    </div>
                  )}

                  {/* Status pill */}
                  <div className="absolute top-2 right-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${pillClass}`}
                    >
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </div>
                </div>

                {/* Card info */}
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium text-white line-clamp-2 leading-snug">
                    {item.brief.topic as string}
                  </p>
                  <p className="text-[11px] text-white/40">
                    {item.slide_count} slide{item.slide_count !== 1 ? 's' : ''} ·{' '}
                    {relativeTime(item.created_at)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
