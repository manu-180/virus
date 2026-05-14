'use client';

/**
 * AutoPublishPanel — Inline expanding configuration card for the
 * auto-publish scheduler. Renders inside InstagramAccountsClient under
 * each connected account.
 *
 * Reads/writes:
 *   GET  /api/ig-accounts/[id]/schedule
 *   PUT  /api/ig-accounts/[id]/schedule
 *   GET  /api/ig-accounts/[id]/schedule/preview
 *
 * Hours are stored in UTC server-side; this component renders them in
 * local Argentina time (UTC-3, no DST). We hardcode the offset because
 * Argentina hasn't observed DST since 2009 and the product is
 * AR-targeted; revisit if/when this changes.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, Save, Calendar, AlertTriangle } from 'lucide-react';
import type {
  IgPublicationSchedule,
  ScheduleWindowPreview,
  UpdateSchedulePayload,
} from '@/lib/types/ig';

// Argentina: UTC-3, no DST (Telecomm Law 26.350, in effect since 2009).
const AR_UTC_OFFSET_HOURS = -3;

function utcHourToLocal(h: number): number {
  return ((h + AR_UTC_OFFSET_HOURS) % 24 + 24) % 24;
}
function localHourToUtc(h: number): number {
  return ((h - AR_UTC_OFFSET_HOURS) % 24 + 24) % 24;
}
function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}
function fmtLocal(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  };
  return d.toLocaleString('es-AR', opts);
}

interface Props {
  igAccountId: string;
  igUsername: string;
}

interface ScheduleResponse {
  exists: boolean;
  schedule: Partial<IgPublicationSchedule> & {
    ig_account_id: string;
    enabled: boolean;
    posts_per_day: number;
    target_hours_utc: number[];
    jitter_minutes: number;
    min_hours_between_posts: number;
  };
}

const HOUR_CHIPS_LOCAL = Array.from({ length: 24 }, (_, i) => i);

export default function AutoPublishPanel({ igAccountId, igUsername }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [postsPerDay, setPostsPerDay] = useState(2);
  const [targetHoursUtc, setTargetHoursUtc] = useState<number[]>([13, 19]);
  const [jitterMinutes, setJitterMinutes] = useState(25);
  const [minHoursBetween, setMinHoursBetween] = useState(4);

  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [lastDispatched, setLastDispatched] = useState<string | null>(null);

  const [previewWindows, setPreviewWindows] = useState<ScheduleWindowPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── Load initial config ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/ig-accounts/${igAccountId}/schedule`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ScheduleResponse;
        if (cancelled) return;
        const s = body.schedule;
        setEnabled(s.enabled);
        setPostsPerDay(s.posts_per_day);
        setTargetHoursUtc(s.target_hours_utc);
        setJitterMinutes(s.jitter_minutes);
        setMinHoursBetween(s.min_hours_between_posts);
        setDisabledReason(s.disabled_reason ?? null);
        setConsecutiveFailures(s.consecutive_failures ?? 0);
        setLastDispatched(s.last_dispatched_at ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando configuración');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [igAccountId]);

  // ── Preview (depends on local config, debounced via useEffect deps) ──
  const fetchPreview = useCallback(async (hoursUtc: number[], jitter: number) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/ig-accounts/${igAccountId}/schedule/preview?windows=3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      // Server-side preview reflects PERSISTED config, not the in-flight
      // edits. We additionally compute a client-side projection so the
      // user sees the impact of unsaved changes immediately.
      void hoursUtc;
      void jitter;
      setPreviewWindows(body.windows ?? []);
    } catch {
      // Soft-fail: preview is informational.
      setPreviewWindows([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [igAccountId]);

  useEffect(() => {
    fetchPreview(targetHoursUtc, jitterMinutes);
  }, [fetchPreview, targetHoursUtc, jitterMinutes]);

  // Client-side projection — instant feedback for unsaved edits.
  const liveProjection = useMemo(() => {
    if (targetHoursUtc.length === 0) return [];
    const now = new Date();
    const dayStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0,
    ));
    const sorted = [...targetHoursUtc].sort((a, b) => a - b);
    const out: ScheduleWindowPreview[] = [];
    for (let offset = 0; offset < 5 && out.length < 3; offset++) {
      for (const h of sorted) {
        const t = new Date(dayStart.getTime() + offset * 86_400_000 + h * 3_600_000);
        if (t.getTime() + jitterMinutes * 60_000 <= now.getTime()) continue;
        out.push({
          targetTime: t.toISOString(),
          jitterMin: new Date(t.getTime() - jitterMinutes * 60_000).toISOString(),
          jitterMax: new Date(t.getTime() + jitterMinutes * 60_000).toISOString(),
        });
        if (out.length >= 3) break;
      }
    }
    return out;
  }, [targetHoursUtc, jitterMinutes]);

  const previewToShow = liveProjection.length > 0 ? liveProjection : previewWindows;

  // ── Hour chip toggle ─────────────────────────────────────────────────
  const localHours = useMemo(
    () => new Set(targetHoursUtc.map(utcHourToLocal)),
    [targetHoursUtc],
  );

  function toggleHour(localH: number): void {
    const utcH = localHourToUtc(localH);
    setTargetHoursUtc((curr) => {
      if (curr.includes(utcH)) return curr.filter((h) => h !== utcH);
      return [...curr, utcH].sort((a, b) => a - b);
    });
  }

  // ── Save ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (targetHoursUtc.length === 0) {
      setError('Elegí al menos una hora objetivo.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: UpdateSchedulePayload = {
        enabled,
        posts_per_day: postsPerDay,
        target_hours_utc: targetHoursUtc,
        jitter_minutes: jitterMinutes,
        min_hours_between_posts: minHoursBetween,
      };
      const res = await fetch(`/api/ig-accounts/${igAccountId}/schedule`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Re-fetch the server-side preview so it reflects the saved state.
      fetchPreview(targetHoursUtc, jitterMinutes);
      // Clear stale auto-disable hints if the user just re-enabled.
      if (enabled) {
        setDisabledReason(null);
        setConsecutiveFailures(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-5 py-4 flex items-center gap-2 text-sm text-white/60">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando configuración…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/30 px-5 py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#C8FF57]" />
          Auto-publicar @{igUsername}
        </p>
        <SwitchToggle
          checked={enabled}
          onChange={setEnabled}
          label={enabled ? 'Activado' : 'Desactivado'}
        />
      </div>

      {disabledReason && !enabled && (
        <div className="rounded-md border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Desactivado automáticamente
            {disabledReason === 'token_expired' ? ' (token expirado).' : `: ${disabledReason}.`}{' '}
            Reconectá la cuenta y volvé a activar.
          </div>
        </div>
      )}
      {consecutiveFailures > 0 && consecutiveFailures < 3 && (
        <div className="text-[11px] text-yellow-300/80">
          {consecutiveFailures} fallo(s) de auth consecutivos. A los 3 se desactiva solo.
        </div>
      )}

      {/* posts_per_day */}
      <FieldRow label="Posts por día">
        <input
          type="number"
          min={1}
          max={5}
          value={postsPerDay}
          onChange={(e) => setPostsPerDay(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
          className="w-20 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm text-white tabular-nums focus:outline-none focus:border-white/30"
        />
        <span className="text-xs text-white/40">máx 5</span>
      </FieldRow>

      {/* target_hours */}
      <FieldRow label="Horarios objetivo (hora AR)">
        <div className="flex flex-wrap gap-1.5">
          {HOUR_CHIPS_LOCAL.map((h) => {
            const active = localHours.has(h);
            return (
              <button
                key={h}
                type="button"
                onClick={() => toggleHour(h)}
                className={`rounded-md border px-2 py-1 text-[11px] font-mono transition-colors ${
                  active
                    ? 'border-[#C8FF57]/60 bg-[#C8FF57]/15 text-[#C8FF57]'
                    : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/25 hover:text-white/80'
                }`}
              >
                {fmtHour(h)}
              </button>
            );
          })}
        </div>
      </FieldRow>

      {/* jitter */}
      <FieldRow label={`Jitter aleatorio: ±${jitterMinutes} min`}>
        <input
          type="range"
          min={0}
          max={60}
          step={1}
          value={jitterMinutes}
          onChange={(e) => setJitterMinutes(Number(e.target.value))}
          className="w-full accent-[#C8FF57]"
        />
      </FieldRow>

      {/* min_hours_between */}
      <FieldRow label={`Mínimo entre posts: ${minHoursBetween}h`}>
        <input
          type="range"
          min={1}
          max={12}
          step={1}
          value={minHoursBetween}
          onChange={(e) => setMinHoursBetween(Number(e.target.value))}
          className="w-full accent-[#C8FF57]"
        />
      </FieldRow>

      {/* Preview */}
      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
          Próximas publicaciones {previewLoading && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
        </p>
        {previewToShow.length === 0 ? (
          <p className="text-xs text-white/40 italic">Elegí al menos una hora.</p>
        ) : (
          <ul className="space-y-1">
            {previewToShow.map((w, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-white/70 tabular-nums">
                <span className="text-[#C8FF57]">●</span>
                {fmtLocal(w.targetTime)}
                <span className="text-white/30 text-[10px]">
                  (±{Math.round((new Date(w.jitterMax).getTime() - new Date(w.targetTime).getTime()) / 60_000)} min)
                </span>
              </li>
            ))}
          </ul>
        )}
        {lastDispatched && (
          <p className="mt-2 text-[10px] text-white/30">
            Último dispatch: {fmtLocal(lastDispatched)}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#C8FF57] text-[#111318] px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar
        </button>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-white/60">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function SwitchToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className="text-xs text-white/60">{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-[#C8FF57]' : 'bg-white/15'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
    </label>
  );
}
