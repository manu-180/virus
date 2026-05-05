'use client'

import type { ReactNode } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { DimStat, HourStat } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatsChartsProps {
  pillarStats: DimStat[]
  formatStats: DimStat[]
  hookTypeStats: DimStat[]
  hourStats: HourStat[]
}

// ---------------------------------------------------------------------------
// Shared chart config
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE = {
  backgroundColor: '#1a1d24',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#fff',
  fontSize: 12,
}

const AXIS_STYLE = {
  fontSize: 11,
  fill: 'rgba(255,255,255,0.4)',
}

const ACCENT = '#C8FF57'
const GREEN = '#4ade80'

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

// ---------------------------------------------------------------------------
// EmptyChart placeholder
// ---------------------------------------------------------------------------

function NoData() {
  return (
    <div className="flex items-center justify-center h-40 text-white/30 text-sm">
      Sin datos suficientes
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chart wrappers
// ---------------------------------------------------------------------------

function PillarChart({ data }: { data: DimStat[] }) {
  if (data.length === 0) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="rgba(255,255,255,0.06)"
        />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          interval={0}
          width={60}
        />
        <YAxis
          tickFormatter={formatViews}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          formatter={(value, name) => {
            const v = typeof value === 'number' ? value : 0
            const n = String(name)
            return [
              n === 'avg_views' ? formatViews(v) : `${v.toFixed(1)}%`,
              n === 'avg_views' ? 'Views promedio' : 'Engagement promedio',
            ] as [string, string]
          }}
        />
        <Bar dataKey="avg_views" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((entry, i) => (
            <Cell key={entry.label} fill={ACCENT} fillOpacity={0.85 - i * 0.04} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function FormatChart({ data }: { data: DimStat[] }) {
  if (data.length === 0) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="rgba(255,255,255,0.06)"
        />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tickFormatter={formatViews}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          formatter={(value) => {
            const v = typeof value === 'number' ? value : 0
            return [formatViews(v), 'Views promedio'] as [string, string]
          }}
        />
        <Bar dataKey="avg_views" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function HookTypeChart({ data }: { data: DimStat[] }) {
  if (data.length === 0) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="rgba(255,255,255,0.06)"
        />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          formatter={(value) => {
            const v = typeof value === 'number' ? value : 0
            return [`${v.toFixed(1)}%`, 'Engagement promedio'] as [string, string]
          }}
        />
        <Bar
          dataKey="avg_engagement"
          fill={ACCENT}
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Hour heatmap (CSS-based, not recharts)
// ---------------------------------------------------------------------------

function HourHeatmap({ data }: { data: HourStat[] }) {
  if (data.length < 3) return <NoData />

  const maxViews = Math.max(...data.map((d) => d.avg_views), 1)
  const byHour: Record<number, number> = {}
  data.forEach((d) => { byHour[d.hour] = d.avg_views })

  const chartData = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour}h`,
    avg_views: byHour[hour] ?? 0,
    intensity: (byHour[hour] ?? 0) / maxViews,
  }))

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="hour"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          interval={3}
        />
        <YAxis
          tickFormatter={formatViews}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          formatter={(value) => {
            const v = typeof value === 'number' ? value : 0
            return [formatViews(v), 'Views promedio'] as [string, string]
          }}
        />
        <Bar dataKey="avg_views" radius={[3, 3, 0, 0]} maxBarSize={20}>
          {chartData.map((entry) => (
            <Cell
              key={entry.hour}
              fill={`rgba(200, 255, 87, ${0.15 + entry.intensity * 0.8})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Chart section card wrapper
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white/70 mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default function StatsCharts({
  pillarStats,
  formatStats,
  hookTypeStats,
  hourStats,
}: StatsChartsProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Análisis por dimensión</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ChartCard title="Views promedio por pilar">
          <PillarChart data={pillarStats} />
        </ChartCard>

        <ChartCard title="Views promedio por formato">
          <FormatChart data={formatStats} />
        </ChartCard>

        <ChartCard title="Engagement por tipo de hook">
          <HookTypeChart data={hookTypeStats} />
        </ChartCard>
      </div>

      <ChartCard title="Horario de publicación vs. views">
        <HourHeatmap data={hourStats} />
        <p className="text-[11px] text-white/30 mt-3">
          Cada celda representa un horario (0–23hs). Más claro = más views promedio.
        </p>
      </ChartCard>
    </section>
  )
}
