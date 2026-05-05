import { Lightbulb } from 'lucide-react'
import type { PerfRecord } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InsightCardsProps {
  records: PerfRecord[]
}

interface Insight {
  text: string
  basedOn: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupAvg<T>(
  items: T[],
  keyFn: (item: T) => string | null,
  valueFn: (item: T) => number,
): Array<{ label: string; avg: number; count: number }> {
  const map: Record<string, { sum: number; count: number }> = {}
  items.forEach((item) => {
    const key = keyFn(item)
    if (!key) return
    if (!map[key]) map[key] = { sum: 0, count: 0 }
    map[key].sum += valueFn(item)
    map[key].count += 1
  })
  return Object.entries(map)
    .map(([label, { sum, count }]) => ({ label, avg: sum / count, count }))
    .sort((a, b) => b.avg - a.avg)
}

// ---------------------------------------------------------------------------
// Insight computation
// ---------------------------------------------------------------------------

function computeInsights(records: PerfRecord[]): Insight[] {
  const insights: Insight[] = []

  const withViews = records.filter((r) => r.views > 0)

  // ---- Insight 1: Best pillar by engagement ----
  const pillarGroups = groupAvg(
    withViews,
    (r) => r.pillar_name,
    (r) => ((r.saves + r.shares) / r.views) * 100,
  )

  if (pillarGroups.length >= 2) {
    const best = pillarGroups[0]
    if (best) {
      const avgAll =
        pillarGroups.reduce((s, g) => s + g.avg, 0) / pillarGroups.length
      const ratio = avgAll > 0 ? best.avg / avgAll : 0
      if (ratio >= 1.3) {
        const totalVideos = pillarGroups.reduce((s, g) => s + g.count, 0)
        insights.push({
          text: `Tus "${best.label}" generan ${ratio.toFixed(1)}× más engagement que el promedio de pilares.`,
          basedOn: totalVideos,
        })
      }
    }
  }

  // ---- Insight 2: Best posting hour ----
  const hourGroups = groupAvg(
    withViews,
    (r) => String(new Date(r.measured_at).getHours()),
    (r) => r.views,
  ).filter((g) => g.count >= 2)

  if (hourGroups.length >= 2) {
    const best = hourGroups[0]
    if (best) {
      const avgAll =
        hourGroups.reduce((s, g) => s + g.avg, 0) / hourGroups.length
      const ratio = avgAll > 0 ? best.avg / avgAll : 0
      if (ratio >= 1.3) {
        const totalVideos = hourGroups.reduce((s, g) => s + g.count, 0)
        insights.push({
          text: `Publicar a las ${best.label}hs te genera ${ratio.toFixed(1)}× más views que el promedio.`,
          basedOn: totalVideos,
        })
      }
    }
  }

  // ---- Insight 3: Best format ----
  const formatGroups = groupAvg(
    withViews,
    (r) => r.format,
    (r) => r.views,
  ).filter((g) => g.count >= 2)

  if (formatGroups.length >= 2) {
    const best = formatGroups[0]
    const worst = formatGroups[formatGroups.length - 1]
    if (best && worst && best !== worst) {
      const ratio = worst.avg > 0 ? best.avg / worst.avg : 0
      if (ratio >= 1.3) {
        const totalVideos = formatGroups.reduce((s, g) => s + g.count, 0)
        insights.push({
          text: `Tus "${best.label}" tienen ${ratio.toFixed(1)}× más views que tus "${worst.label}".`,
          basedOn: totalVideos,
        })
      }
    }
  }

  return insights.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Server component (default export)
// ---------------------------------------------------------------------------

export default function InsightCards({ records }: InsightCardsProps) {
  if (records.length < 10) {
    return (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-8 text-center">
        <Lightbulb className="w-10 h-10 text-white/20 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-white mb-1">
          Insights automáticos
        </h3>
        <p className="text-white/40 text-sm mb-2">
          Cargá al menos 10 videos con métricas para ver insights.
        </p>
        <p className="text-white/30 text-xs">
          ({records.length}/10 videos con métricas cargadas)
        </p>
      </div>
    )
  }

  const insights = computeInsights(records)

  if (insights.length === 0) {
    return (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-8 text-center">
        <Lightbulb className="w-10 h-10 text-white/20 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-white mb-1">
          Insights automáticos
        </h3>
        <p className="text-white/40 text-sm">
          Aún no hay patrones claros. Seguí cargando métricas para detectar tendencias.
        </p>
      </div>
    )
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-4">
        Insights automáticos
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insights.map((insight) => (
          <div
            key={insight.text}
            className="bg-white/[0.04] border border-[#C8FF57]/20 rounded-xl p-5 flex flex-col gap-3"
          >
            <Lightbulb className="w-5 h-5 text-[#C8FF57]" />
            <p className="text-white text-sm leading-relaxed">{insight.text}</p>
            <p className="text-white/30 text-xs mt-auto">
              Basado en {insight.basedOn} videos
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
