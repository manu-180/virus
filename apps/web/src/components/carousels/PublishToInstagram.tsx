'use client';

/**
 * PublishToInstagram — block under the carousel detail page that:
 *   1. Loads the user's connected IG accounts for this carousel's project
 *      (typically one — auto-pick).
 *   2. Loads the latest ig_publications row(s) and renders status + permalink.
 *   3. Lets the user trigger a publish and watches realtime updates so the pill
 *      flips queued → publishing → published/failed without refreshing.
 *
 * Onboarding is intentionally CLI-only (IG challenge flow needs the user's
 * phone in real-time), so this block shows "Conectá una cuenta" when no
 * active account exists and points the user at the settings page.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ExternalLink, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { InstagramIcon as Instagram } from '@/components/icons/InstagramIcon';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/browser';
import { useActiveProject } from '@/lib/active-project/hook';

// ─── Types ────────────────────────────────────────────────────────────

interface IgAccount {
  id: string;
  project_id: string;
  ig_username: string;
  display_name: string | null;
  status: string;
  post_count_24h: number;
  daily_post_limit: number;
}

interface IgPublication {
  id: string;
  ig_account_id: string;
  status: 'queued' | 'publishing' | 'published' | 'failed' | 'cancelled';
  ig_media_id: string | null;
  ig_permalink: string | null;
  published_at: string | null;
  attempts: number;
  last_attempt_at: string | null;
  error: { code?: string; message?: string } | null;
  created_at: string;
  updated_at: string;
}

interface PublishToInstagramProps {
  carouselId: string;
  projectId: string;
  hasReadyCaption: boolean;
  disabled?: boolean;
}

// ─── Status pill ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<IgPublication['status'], string> = {
  queued: 'En cola',
  publishing: 'Publicando…',
  published: 'Publicado',
  failed: 'Falló',
  cancelled: 'Cancelado',
};

const STATUS_CLASS: Record<IgPublication['status'], string> = {
  queued: 'text-white/60 border-white/15 bg-white/5',
  publishing: 'text-blue-300 border-blue-400/30 bg-blue-400/10 animate-pulse',
  published: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
  failed: 'text-red-300 border-red-400/30 bg-red-400/10',
  cancelled: 'text-white/40 border-white/10 bg-white/5',
};

function StatusPill({ status }: { status: IgPublication['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────

export function PublishToInstagram({
  carouselId,
  projectId,
  hasReadyCaption,
  disabled = false,
}: PublishToInstagramProps) {
  const { activeProject, projects, switchProject, isLoading: projectsLoading } = useActiveProject();

  // The "selected project for IG" starts as the carousel's own project_id,
  // but can be overridden by the user to pick any of their projects.
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [publications, setPublications] = useState<IgPublication[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const subscribedRef = useRef(false);

  // ── Close dropdown on outside click ──────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [dropdownOpen]);

  // ── Load accounts + publications on mount / when selectedProjectId changes ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingAccounts(true);
      setAccounts(null);
      try {
        const [aRes, pRes] = await Promise.all([
          fetch(`/api/ig-accounts?projectId=${encodeURIComponent(selectedProjectId)}`),
          fetch(`/api/carousels/${carouselId}/publish-ig`),
        ]);
        if (cancelled) return;
        if (aRes.ok) {
          const body = (await aRes.json()) as { accounts: IgAccount[] };
          setAccounts(body.accounts);
        } else {
          setAccounts([]);
        }
        if (pRes.ok) {
          const body = (await pRes.json()) as { publications: IgPublication[] };
          setPublications(body.publications ?? []);
        }
      } catch (err) {
        console.error('[publish] load failed:', err);
        setAccounts([]);
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carouselId, selectedProjectId]);

  // ── Realtime subscription for ig_publications ──────────────────────
  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    const supabase = createClient();
    const channel = supabase
      .channel(`ig-publications-${carouselId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ig_publications',
          filter: `carousel_id=eq.${carouselId}`,
        },
        (payload) => {
          const row = payload.new as IgPublication;
          if (!row?.id) return;
          setPublications((prev) => {
            const existing = prev.find((p) => p.id === row.id);
            if (existing) {
              return prev.map((p) => (p.id === row.id ? { ...p, ...row } : p));
            }
            return [row, ...prev].slice(0, 5);
          });
        },
      )
      .subscribe();

    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [carouselId]);

  // Derive display info for the currently-selected project
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? activeProject ?? null;

  const activeAccount = (accounts ?? []).find((a) => a.status === 'active') ?? null;
  const latestPublication = publications[0] ?? null;
  const inFlight =
    latestPublication && (latestPublication.status === 'queued' || latestPublication.status === 'publishing');

  const handlePublish = useCallback(async () => {
    if (!activeAccount || publishing || inFlight) return;
    setPublishing(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/carousels/${carouselId}/publish-ig`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ igAccountId: activeAccount.id }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        publication?: IgPublication;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        const msg = body.message ?? humanizeError(body.error, res.status);
        setErrorMsg(msg);
        return;
      }
      if (body.publication) {
        setPublications((prev) => [body.publication!, ...prev].slice(0, 5));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setPublishing(false);
    }
  }, [activeAccount, carouselId, publishing, inFlight]);

  // ── Render branches ─────────────────────────────────────────────────

  if (loadingAccounts) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-5">
        <div className="flex items-center gap-2 text-sm text-white/40">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando cuentas de Instagram…
        </div>
      </div>
    );
  }

  // ── Shared project selector UI ─────────────────────────────────────────
  const projectSelector = projects.length > 1 ? (
    <div className="flex items-center gap-2 text-xs text-white/50">
      <span>Proyecto IG:</span>
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          disabled={projectsLoading}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:border-white/30 hover:text-white transition-colors disabled:opacity-40"
        >
          {projectsLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedProject?.themeColor ?? '#888' }}
              />
              {selectedProject?.name ?? '—'}
              <ChevronDown className="w-3 h-3 text-white/40" />
            </>
          )}
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-lg border border-white/[0.12] bg-[#1a1d24] shadow-xl overflow-hidden">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedProjectId(p.id);
                  switchProject(p.slug);
                  setDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  p.id === selectedProjectId
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: p.themeColor ?? '#888' }}
                />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null;

  if (!activeAccount) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-5 space-y-3">
        <div className="flex items-start gap-3">
          <Instagram className="w-5 h-5 text-white/40 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/80">Publicar en Instagram</p>
            <p className="text-xs text-white/50 mt-1">
              Conectá una cuenta de Instagram para{' '}
              <span className="text-[#C8FF57]">{selectedProject?.name ?? 'este proyecto'}</span>{' '}
              y vas a poder publicar de un click.
            </p>
          </div>
        </div>
        {projectSelector && <div className="pl-8">{projectSelector}</div>}
        <div className="pl-8">
          <Link
            href="/dashboard/settings/instagram"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white hover:border-white/30 transition-colors"
          >
            Conectar cuenta
          </Link>
        </div>
      </div>
    );
  }

  const cannotPublish = disabled || !hasReadyCaption;
  const rateLimitHit = activeAccount.post_count_24h >= activeAccount.daily_post_limit;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Instagram className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Publicar en Instagram</p>
            <p className="text-xs text-white/50 mt-0.5 truncate">
              @{activeAccount.ig_username}
              {activeAccount.display_name && (
                <span className="text-white/30"> · {activeAccount.display_name}</span>
              )}
            </p>
          </div>
        </div>
        <div className="text-[11px] text-white/40 shrink-0 tabular-nums">
          {activeAccount.post_count_24h} / {activeAccount.daily_post_limit} hoy
        </div>
      </div>

      {/* Project selector — only shown when user has more than one project */}
      {projectSelector}

      {/* Latest publication summary */}
      {latestPublication && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusPill status={latestPublication.status} />
            {latestPublication.attempts > 1 && (
              <span className="text-[11px] text-white/40">intento {latestPublication.attempts}</span>
            )}
            {latestPublication.status === 'failed' && latestPublication.error?.message && (
              <span className="text-[11px] text-red-300/80 truncate" title={latestPublication.error.message}>
                {latestPublication.error.message}
              </span>
            )}
          </div>
          {latestPublication.status === 'published' && latestPublication.ig_permalink && (
            <a
              href={latestPublication.ig_permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200 transition-colors shrink-0"
            >
              Ver post <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Inline error toast */}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={handlePublish}
        disabled={cannotPublish || publishing || !!inFlight || rateLimitHit}
        className={cn(
          'w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors',
          cannotPublish || rateLimitHit
            ? 'bg-white/5 text-white/30 cursor-not-allowed'
            : inFlight
              ? 'bg-blue-400/20 text-blue-200 cursor-not-allowed'
              : latestPublication?.status === 'published'
                ? 'bg-white/10 text-white/70 hover:bg-white/15'
                : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:opacity-90',
        )}
      >
        {publishing || inFlight ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {inFlight ? STATUS_LABEL[latestPublication!.status] : 'Encolando…'}
          </>
        ) : latestPublication?.status === 'published' ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Volver a publicar
          </>
        ) : (
          <>
            <Instagram className="w-4 h-4" />
            {rateLimitHit ? 'Límite diario alcanzado' : 'Publicar ahora'}
          </>
        )}
      </button>

      {!hasReadyCaption && (
        <p className="text-[11px] text-white/40 text-center">
          Generá las captions antes de publicar.
        </p>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function humanizeError(code: string | undefined, status: number): string {
  switch (code) {
    case 'no_active_ig_account':
      return 'No hay una cuenta de Instagram conectada para este proyecto.';
    case 'no_caption_available':
      return 'Necesitás generar las captions antes de publicar.';
    case 'carousel_not_ready':
      return 'El carrusel todavía no está listo.';
    case 'daily_post_limit_reached':
      return 'Llegaste al límite diario de publicaciones para esta cuenta.';
    case 'publish_already_in_flight':
      return 'Ya hay una publicación en curso para este carrusel.';
    case 'multiple_accounts_choose_one':
      return 'Hay más de una cuenta para este proyecto — elegí una en Settings.';
    case 'dispatch_failed':
      return 'No pudimos encolar la publicación. Probá de nuevo en un minuto.';
    default:
      return `Error al publicar (HTTP ${status}).`;
  }
}
