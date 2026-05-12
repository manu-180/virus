'use client';

/**
 * Instagram settings — read-only list of connected accounts.
 *
 * Onboarding is intentionally done via the CLI (`apps/ig-publisher/scripts/
 * onboard_account.py`) because IG's challenge flow requires the user's phone
 * in real-time. This page documents how to run the CLI and shows the current
 * state of each connected account.
 */

import { useEffect, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { Loader2, AlertCircle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { InstagramIcon as Instagram } from '@/components/icons/InstagramIcon';

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

interface IgAccount {
  id: string;
  project_id: string;
  ig_username: string;
  display_name: string | null;
  status: 'pending_session' | 'active' | 'challenge' | 'disabled';
  session_updated_at: string | null;
  last_post_at: string | null;
  post_count_24h: number;
  daily_post_limit: number;
  last_error: string | null;
}

const STATUS_META: Record<
  IgAccount['status'],
  { label: string; tone: string; Icon: IconComponent }
> = {
  active: { label: 'Activa', tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10', Icon: CheckCircle2 },
  pending_session: { label: 'Pendiente', tone: 'text-white/60 border-white/15 bg-white/5', Icon: Clock },
  challenge: { label: 'Challenge requerido', tone: 'text-yellow-300 border-yellow-400/30 bg-yellow-400/10', Icon: ShieldAlert },
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

export default function InstagramAccountsClient() {
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ig-accounts');
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
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h2 className="text-text-primary font-semibold text-lg" style={{ fontFamily: 'Oxanium, sans-serif' }}>
          Cuentas de Instagram
        </h2>
        <p className="text-text-secondary text-sm">
          Cuentas conectadas para publicar carruseles. El onboarding se hace por CLI porque Instagram puede
          pedir confirmación en tu teléfono al primer login.
        </p>
      </header>

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
            Todavía no conectaste ninguna cuenta. Mirá los pasos abajo.
          </div>
        )}
        {accounts && accounts.map((a) => {
          const meta = STATUS_META[a.status];
          const Icon = meta.Icon;
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
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-white/40">
                    <span>Sesión: {relativeTime(a.session_updated_at)}</span>
                    <span>Último post: {relativeTime(a.last_post_at)}</span>
                    <span className="tabular-nums">
                      {a.post_count_24h} / {a.daily_post_limit} hoy
                    </span>
                  </div>
                  {a.last_error && a.status !== 'active' && (
                    <p className="mt-1.5 text-[11px] font-mono text-red-300/70 break-all">{a.last_error}</p>
                  )}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${meta.tone}`}
              >
                <Icon className="w-3 h-3" />
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Onboarding instructions */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-5 space-y-4">
        <h3 className="text-sm font-semibold text-white" style={{ fontFamily: 'Oxanium, sans-serif' }}>
          Conectar una cuenta nueva
        </h3>
        <ol className="space-y-3 text-sm text-text-secondary list-decimal pl-5">
          <li>
            Asegurate de tener Python 3.11+ y el repo clonado en tu compu.
          </li>
          <li>
            Andá al servicio del publisher:
            <pre className="mt-1.5 rounded-md bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-white/80 overflow-x-auto">
{`cd apps/ig-publisher
python -m venv .venv
.venv\\Scripts\\activate            # Windows
pip install -r requirements.txt
cp .env.example .env                 # copiar de Vercel/Railway`}
            </pre>
          </li>
          <li>
            Ejecutá el CLI de onboarding (te pide password y, si tenés 2FA, el seed TOTP):
            <pre className="mt-1.5 rounded-md bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-white/80 overflow-x-auto">
{`# 1. Dry-run para validar el login sin escribir en DB
python -m scripts.onboard_account \\
  --project-slug apex --ig-username apex.stack --dry-run

# 2. Si dice "✓ Login succeeded", corré sin --dry-run
python -m scripts.onboard_account \\
  --project-slug apex --ig-username apex.stack --display-name "APEX"`}
            </pre>
          </li>
          <li>
            Si Instagram pide challenge, abrí la app en tu teléfono, aceptá el "¿Fuiste vos?" y volvé a correr el comando.
          </li>
          <li>
            Una vez activa la cuenta aparece en esta lista, ya podés publicar carruseles desde el detalle de cada uno.
          </li>
        </ol>
      </div>
    </div>
  );
}
