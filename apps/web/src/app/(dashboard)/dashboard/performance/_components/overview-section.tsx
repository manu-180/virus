import { BarChart3 } from 'lucide-react'
import type { PerfRecord } from './types'
import { PLATFORM_LABELS, PLATFORM_BADGE as PLATFORM_COLORS } from './constants'

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OverviewSectionProps {
  top10: PerfRecord[]
}

// ---------------------------------------------------------------------------
// VideoCard
// ---------------------------------------------------------------------------

interface VideoCardProps {
  record: PerfRecord
  rank: number
}

function VideoCard({ record, rank }: VideoCardProps) {
  const er =
    record.views > 0
      ? ((record.likes + record.comments + record.saves + record.shares) /
          record.views) *
        100
      : 0

  const savesRatio =
    record.views > 0 ? (record.saves / record.views) * 100 : 0

  const platformLabel = PLATFORM_LABELS[record.platform] ?? record.platform
  const platformColor =
    PLATFORM_COLORS[record.platform] ?? 'bg-white/10 text-white/70 border-white/20'

  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 flex flex-col gap-3 hover:border-white/[0.14] transition-colors">
      {/* Rank + Platform */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl font-bold text-[#C8FF57] tabular-nums leading-none">
          #{rank}
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${platformColor}`}
        >
          {platformLabel}
        </span>
      </div>

      {/* Hook text */}
      <p className="text-sm text-white font-medium line-clamp-2 leading-snug min-h-[2.5rem]">
        {record.hook_text ?? 'Sin hook'}
      </p>

      {/* Pillar + Format badges */}
      <div className="flex flex-wrap gap-1.5">
        {record.pillar_name && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/60 font-medium">
            {record.pillar_name}
          </span>
        )}
        {record.format && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/50">
            {record.format}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.06]">
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
            Views
          </p>
          <p className="text-sm font-semibold text-white tabular-nums">
            {formatViews(record.views)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
            ER
          </p>
          <p className="text-sm font-semibold text-white tabular-nums">
            {formatPct(er)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
            Saves/Views
          </p>
          <p className="text-sm font-semibold text-white tabular-nums">
            {formatPct(savesRatio)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
            Hook ret.
          </p>
          <p className="text-sm font-semibold text-white tabular-nums">
            {record.hook_retention != null
              ? formatPct(record.hook_retention)
              : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Server component (default export)
// ---------------------------------------------------------------------------

export default function OverviewSection({ top10 }: OverviewSectionProps) {
  if (top10.length === 0) {
    return (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-10 flex flex-col items-center gap-3 text-center">
        <BarChart3 className="w-10 h-10 text-white/20" />
        <p className="text-white/40 text-sm max-w-sm">
          Cargá tu primer video y sus métricas para ver el ranking.
        </p>
      </div>
    )
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-4">
        Top 10 videos por engagement
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {top10.map((record, i) => (
          <VideoCard key={record.id} record={record} rank={i + 1} />
        ))}
      </div>
    </section>
  )
}
