'use client';

/**
 * Instagram settings — connect & manage IG accounts via Meta Graph API.
 *
 * Replaces the old CLI-only onboarding with a one-click OAuth flow:
 *   1. User clicks "Conectar Instagram"
 *   2. We redirect to /api/ig-accounts/connect/start?projectId=...
 *   3. That redirects to Facebook's OAuth dialog
 *   4. Facebook posts back to /api/ig-accounts/connect/callback
 *   5. The callback upserts the IG account row and redirects back here
 *
 * Banners surface success / no-pages / errors based on `?connect=` params.
 * A setup wizard appears when META_APP_ID is missing on the server.
 */

import type { ComponentType, SVGProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Trash2,
  ExternalLink,
  Info,
  ChevronDown,
} from 'lucide-react';
import { InstagramIcon as Instagram } from '@/components/icons/InstagramIcon';
import { useActiveProject } from '@/lib/active-project/hook';

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

interface IgAccount {
  id: string;
  project_id: string;
  ig_username: string;
  display_name: string | null;
  status: 'pending_session' | 'active' | 'challenge' | 'disabled';
  auth_type: 'instagrapi' | 'graph_api';
  session_updated_at: string | null;
  last_post_at: string | null;
  post_count_24h: number;
  daily_post_limit: number;
  last_error: string | null;
  graph_token_expires_at: string | null;
}

const STATUS_META: Record<
  IgAccount['status'],
  { label: string; tone: string; Icon: IconComponent }
> = {
  active: { label: 'Activa', tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10', Icon: CheckCircle2 },
  pending_session: { label: 'Pendiente', tone: 'text-white/60 border-white/15 bg-white/5', Icon: Clock },
  challenge: { label: 'Reconectar', tone: 'text-yellow-300 border-yellow-400/30 bg-yellow-400/10', Icon: ShieldAlert },
  disabled: { label: 'Deshabilitada', tone: 'text-red-300 border-red-400/30 bg-red-400/10', Icon: AlertCircle },
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function expiresDays(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export default function InstagramAccountsClient() {
  const { activeProject, projects, switchProject, isLoading: projectsLoading } = useActiveProject();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

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

  // ── Reset accounts list when active project changes ───────────────────
  useEffect(() => {
    setAccounts(null);
    setReloadKey((k) => k + 1);
  }, [activeProject?.id]);

  // ── Read connect=ok/error/cancelled/no_pages from URL params ─────────
  const connectFlag = searchParams.get('connect');
  const connectMsg = searchParams.get('msg');
  const setupFlag = searchParams.get('setup');

  useEffect(() => {
    if (setupFlag === 'missing_app') {
      setShowWizard(true);
    }
  }, [setupFlag]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = activeProject
          ? `/api/ig-accounts?projectId=${encodeURIComponent(activeProject.id)}`
          : '/api/ig-accounts';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { accounts: IgAccount[] };
        if (!cancelled) setAccounts(body.accounts);
      } catch (err) {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'Error de red');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, activeProject?.id]);

  function handleConnect() {
    if (!activeProject) {
      setErrorMsg('Elegí un proyecto activo en la barra superior antes de conectar.');
      return;
    }
    window.location.href = `/api/ig-accounts/connect/start?projectId=${encodeURIComponent(activeProject.id)}`;
  }

  async function handleDisconnect(id: string) {
    if (!window.confirm('¿Desconectar esta cuenta? Vas a poder reconectarla cuando quieras.')) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/ig-accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setReloadKey((k) => k + 1);
    } finally {
      setDeletingId(null);
    }
  }

  function dismissBanner() {
    const url = new URL(window.location.href);
    url.searchParams.delete('connect');
    url.searchParams.delete('msg');
    url.searchParams.delete('setup');
    router.replace(url.pathname + (url.search ? `?${url.searchParams.toString()}` : ''));
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h2 className="text-text-primary font-semibold text-lg" style={{ fontFamily: 'Oxanium, sans-serif' }}>
          Cuentas de Instagram
        </h2>
        <p className="text-text-secondary text-sm">
          Conectá tus cuentas de Instagram via Meta Graph API. Una vez conectadas, vas a poder publicar
          carruseles directo desde el detalle de cada uno con un click.
        </p>
      </header>

      {/* Status banner from OAuth round-trip */}
      {connectFlag === 'ok' && (
        <Banner tone="ok" onDismiss={dismissBanner}>
          ✓ {connectMsg ?? 'Cuenta conectada con éxito'}
        </Banner>
      )}
      {connectFlag === 'cancelled' && (
        <Banner tone="warn" onDismiss={dismissBanner}>
          Conexión cancelada — no se guardó nada.
        </Banner>
      )}
      {connectFlag === 'no_pages' && (
        <Banner tone="warn" onDismiss={dismissBanner}>
          Tu cuenta de Facebook no tiene ninguna página con Instagram vinculado. Vinculá tu IG a una FB Page
          primero (ver paso 2 del wizard).
        </Banner>
      )}
      {connectFlag === 'error' && (
        <Banner tone="error" onDismiss={dismissBanner}>
          Error al conectar: <span className="font-mono text-[11px]">{connectMsg ?? 'unknown'}</span>
        </Banner>
      )}
      {setupFlag === 'missing_app' && (
        <Banner tone="warn" onDismiss={dismissBanner}>
          Hace falta configurar la Meta App primero (instrucciones abajo).
        </Banner>
      )}

      {/* Primary CTA */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Instagram className="w-6 h-6 text-pink-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                Conectar Instagram a <span className="text-[#C8FF57]">{activeProject?.name ?? '...'}</span>
              </p>
              <p className="text-xs text-white/50 mt-0.5">
                Una vez conectado, publicás carruseles con un click. Sin contraseñas, sin challenges.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={!activeProject}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Instagram className="w-4 h-4" />
            Conectar con Instagram
          </button>
        </div>

        {/* Project selector */}
        {projects.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span>Proyecto:</span>
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
                      style={{ backgroundColor: activeProject?.themeColor ?? '#888' }}
                    />
                    {activeProject?.name ?? '—'}
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
                        switchProject(p.slug);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                        p.id === activeProject?.id
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
        )}
      </div>

      {/* Accounts list */}
      <div className="space-y-3">
        {accounts === null && !errorMsg && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando…
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMsg}
          </div>
        )}
        {accounts && accounts.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-5 py-8 text-center text-sm text-white/50">
            Todavía no conectaste ninguna cuenta. Tocá <span className="text-[#C8FF57]">Conectar con Instagram</span> arriba.
          </div>
        )}
        {accounts && accounts.map((a) => {
          const meta = STATUS_META[a.status];
          const Icon = meta.Icon;
          const expDays = expiresDays(a.graph_token_expires_at);
          const isReconnectNeeded = a.status === 'challenge' || (expDays !== null && expDays < 7);
          return (
            <div
              key={a.id}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-5 py-4 flex flex-wrap items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                <Instagram className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    @{a.ig_username}
                    {a.display_name && <span className="text-white/40 font-normal"> · {a.display_name}</span>}
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-white/30 border border-white/10 rounded px-1.5 py-0.5">
                      {a.auth_type === 'graph_api' ? 'Graph API' : 'Legacy'}
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-white/40">
                    <span>Último post: {relativeTime(a.last_post_at)}</span>
                    <span className="tabular-nums">{a.post_count_24h} / {a.daily_post_limit} hoy</span>
                    {expDays !== null && (
                      <span className={expDays < 7 ? 'text-yellow-300' : ''}>
                        Token expira en {expDays}d
                      </span>
                    )}
                  </div>
                  {a.last_error && a.status !== 'active' && (
                    <p className="mt-1.5 text-[11px] font-mono text-red-300/70 break-all">{a.last_error}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${meta.tone}`}
                >
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
                {isReconnectNeeded && (
                  <button
                    type="button"
                    onClick={handleConnect}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/70 hover:text-white hover:border-white/30 transition-colors"
                  >
                    Reconectar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDisconnect(a.id)}
                  disabled={deletingId === a.id}
                  className="inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-transparent px-2 py-1 text-[11px] font-medium text-red-400/70 hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {deletingId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Setup wizard (collapsible) */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowWizard((v) => !v)}
          className="w-full px-5 py-4 text-left flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <Info className="w-4 h-4 text-[#C8FF57]" />
            {showWizard ? 'Ocultar' : 'Mostrar'} setup inicial (primera vez)
          </span>
          <span className="text-xs text-white/40">{showWizard ? '−' : '+'}</span>
        </button>
        {showWizard && <SetupWizard />}
      </div>
    </div>
  );
}

// ── Banner ────────────────────────────────────────────────────────────

function Banner({
  tone,
  onDismiss,
  children,
}: {
  tone: 'ok' | 'warn' | 'error';
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'ok'
      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
      : tone === 'warn'
        ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200'
        : 'border-red-500/30 bg-red-500/10 text-red-200';
  return (
    <div className={`rounded-md border px-4 py-3 text-sm flex items-start justify-between gap-3 ${toneClass}`}>
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs opacity-60 hover:opacity-100 shrink-0"
      >
        Cerrar
      </button>
    </div>
  );
}

// ── Setup wizard ──────────────────────────────────────────────────────

function SetupWizard() {
  return (
    <div className="border-t border-white/[0.06] px-5 pb-5 pt-4 space-y-5 text-sm text-text-secondary">
      <p className="text-white/70">
        Esto se hace <strong>una sola vez</strong>. Después podés conectar todas las cuentas IG que quieras
        con un click.
      </p>

      <WizardStep n={1} title="Convertir @apex.stack a cuenta profesional">
        <p>
          En la app de Instagram: <strong>Configuración → Tipo de cuenta y herramientas → Cambiar a cuenta
          profesional</strong>. Elegí <strong>Creator</strong> o <strong>Empresa</strong>, lo que sea. Sigue
          siendo gratis y se ve igual.
        </p>
      </WizardStep>

      <WizardStep n={2} title="Tener una Facebook Page y vincular Instagram">
        <p>
          Si no tenés una FB Page para APEX, creala gratis en{' '}
          <a
            href="https://www.facebook.com/pages/create"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#C8FF57] hover:underline"
          >
            facebook.com/pages/create <ExternalLink className="w-3 h-3" />
          </a>
          {' '}— 2 minutos.
        </p>
        <p className="mt-2">
          Después en la app de Instagram (en apex.stack): <strong>Configuración → Centro de cuentas → Cuentas
          → Agregar cuenta de Facebook</strong>. Linkeás la página de FB con la cuenta de IG.
        </p>
      </WizardStep>

      <WizardStep n={3} title="Crear la Meta App (developers.facebook.com)">
        <ol className="space-y-2 list-decimal pl-5 mt-2">
          <li>
            Entrá a{' '}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#C8FF57] hover:underline"
            >
              developers.facebook.com/apps <ExternalLink className="w-3 h-3" />
            </a>
            {' '}y tocá <strong>Crear app</strong>.
          </li>
          <li>
            Elegí caso de uso <strong>"Otro"</strong> → tipo <strong>"Negocios"</strong>.
          </li>
          <li>
            Nombre: <code className="bg-black/30 px-1.5 py-0.5 rounded text-[#C8FF57]">Virus IG Publisher</code>{' '}
            (o lo que quieras), email de contacto el tuyo, cuenta de Meta Business: la tuya.
          </li>
          <li>
            En el panel de la app, agregar producto <strong>"Instagram"</strong> → <strong>Configurar</strong>{' '}
            en "Publicación de contenido de la API de Instagram".
          </li>
          <li>
            En <strong>Configuración → Básica</strong>, copiá <strong>App ID</strong> y{' '}
            <strong>App Secret</strong>.
          </li>
          <li>
            En <strong>Facebook Login para empresas → Configuración</strong>, agregá en{' '}
            <strong>"URI de redireccionamiento OAuth válidos"</strong> esta URL exacta:
            <pre className="mt-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] font-mono text-white/80 overflow-x-auto">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/api/ig-accounts/connect/callback`
                : 'https://TU-DOMINIO/api/ig-accounts/connect/callback'}
            </pre>
          </li>
        </ol>
      </WizardStep>

      <WizardStep n={4} title="Pegar APP_ID y APP_SECRET en Vercel">
        <p>
          En tu proyecto de Vercel → <strong>Settings → Environment Variables</strong>, agregás 3 vars:
        </p>
        <pre className="mt-2 bg-black/40 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white/80 overflow-x-auto">
{`META_APP_ID=<el app id que copiaste>
META_APP_SECRET=<el app secret>
META_OAUTH_REDIRECT_BASE_URL=https://TU-DOMINIO`}
        </pre>
        <p className="mt-2 text-[11px] text-white/40">
          <code>META_OAUTH_REDIRECT_BASE_URL</code> es la URL pública de tu app (sin barra al final).
          Si solo tenés <code>NEXT_PUBLIC_APP_URL</code> ya configurada, podés saltearte esta.
        </p>
        <p className="mt-2">
          Después de guardar, hacé un <strong>Redeploy</strong> (Vercel → Deployments → último → Redeploy).
        </p>
      </WizardStep>

      <WizardStep n={5} title="Conectar la cuenta">
        <p>
          Tocá el botón <strong>Conectar con Instagram</strong> arriba. Te lleva a Facebook, autorizás el
          acceso, y volvés acá con la cuenta activa. ✨
        </p>
      </WizardStep>

      <div className="mt-4 rounded-md border border-white/[0.08] bg-black/30 px-4 py-3 text-[11px] text-white/50">
        <p className="font-semibold text-white/70 mb-1">Modo desarrollo de la Meta App</p>
        <p>
          Apenas creás la app, está en modo <em>Development</em>. Eso significa que <strong>solo cuentas que
          agregues como "Testers"</strong> pueden autorizarla. Para uso solo personal con apex.stack, andá a{' '}
          <strong>App Roles → Testers</strong> y agregá tu propia cuenta de Facebook. Más adelante si querés
          ofrecerlo a otros, podés pedir <em>App Review</em> a Meta (gratis pero lleva días).
        </p>
      </div>
    </div>
  );
}

function WizardStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#C8FF57] text-[#111318] text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">{title}</p>
        <div className="mt-1.5 text-white/60 text-[13px] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
