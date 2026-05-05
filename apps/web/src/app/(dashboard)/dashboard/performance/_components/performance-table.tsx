'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PerfRecord } from './types'
import { PLATFORM_LABELS, PLATFORM_BADGE } from './constants'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function hookLabel(record: PerfRecord): string {
  if (record.hook_type) return record.hook_type
  const words = (record.hook_text ?? '').trim().split(/\s+/).slice(0, 2)
  return words.length > 0 ? words.join(' ') + '…' : '—'
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

function csvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  const escaped = str.replace(/"/g, '""')
  return `"${escaped}"`
}

function exportCSV(records: PerfRecord[]) {
  const headers = [
    'Video', 'Hook Type', 'Pilar', 'Formato', 'Plataforma',
    'Views', 'ER%', 'Saves/Views%', 'Hook ret%', 'Fecha',
  ]
  const rows = records.map((r) => [
    csvCell(r.hook_text),
    csvCell(r.hook_type),
    csvCell(r.pillar_name),
    csvCell(r.format),
    csvCell(r.platform),
    csvCell(r.views),
    csvCell(r.views > 0 ? (((r.likes + r.comments + r.saves + r.shares) / r.views) * 100).toFixed(2) : ''),
    csvCell(r.views > 0 ? ((r.saves / r.views) * 100).toFixed(2) : ''),
    csvCell(r.hook_retention),
    csvCell(new Date(r.measured_at).toLocaleDateString('es-AR')),
  ])
  const csv = [headers.map(csvCell), ...rows].map((row) => row.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `performance-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PerformanceTableProps {
  records: PerfRecord[]
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default function PerformanceTable({ records }: PerformanceTableProps) {
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(1)

  if (records.length === 0) {
    return (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <BarChart3 className="w-10 h-10 text-white/20" />
          <p className="text-white/30 text-sm max-w-sm">
            Cargá tu primer video y sus métricas para ver el análisis.
          </p>
        </div>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageRecords = records.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
      {/* Table header bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <h2 className="text-base font-semibold text-white">
          Detalle de métricas
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => exportCSV(records)}
          className="text-white/50 hover:text-white gap-1.5"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {[
                'Video',
                'Hook Type',
                'Pilar',
                'Formato',
                'Plataforma',
                'Views',
                'ER',
                'Saves/Views',
                'Hook ret.',
                'Fecha',
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[11px] font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((record) => {
              const er =
                record.views > 0
                  ? ((record.likes +
                      record.comments +
                      record.saves +
                      record.shares) /
                      record.views) *
                    100
                  : 0
              const savesRatio =
                record.views > 0 ? (record.saves / record.views) * 100 : 0
              const platformLabel =
                PLATFORM_LABELS[record.platform] ?? record.platform
              const platformBadge =
                PLATFORM_BADGE[record.platform] ??
                'bg-white/10 text-white/70 border-white/20'

              return (
                <tr
                  key={record.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => router.push(`/videos/${record.video_id}`)}
                >
                  {/* Video */}
                  <td className="px-4 py-3 max-w-[200px]">
                    <span
                      className="text-white/80 hover:text-white line-clamp-1 block"
                      title={record.hook_text ?? undefined}
                    >
                      {(record.hook_text ?? '—').slice(0, 40)}
                      {(record.hook_text ?? '').length > 40 ? '…' : ''}
                    </span>
                  </td>

                  {/* Hook Type */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-white/50 text-xs">{hookLabel(record)}</span>
                  </td>

                  {/* Pilar */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {record.pillar_name ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/60 font-medium">
                        {record.pillar_name}
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>

                  {/* Formato */}
                  <td className="px-4 py-3 whitespace-nowrap text-white/50 text-xs">
                    {record.format ?? '—'}
                  </td>

                  {/* Plataforma */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${platformBadge}`}
                    >
                      {platformLabel}
                    </span>
                  </td>

                  {/* Views */}
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-white/80 font-medium">
                    {formatViews(record.views)}
                  </td>

                  {/* ER */}
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-white/70">
                    {formatPct(er)}
                  </td>

                  {/* Saves/Views */}
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-white/70">
                    {formatPct(savesRatio)}
                  </td>

                  {/* Hook retention */}
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-white/70">
                    {record.hook_retention != null
                      ? formatPct(record.hook_retention)
                      : '—'}
                  </td>

                  {/* Fecha */}
                  <td className="px-4 py-3 whitespace-nowrap text-white/40 text-xs">
                    {formatDate(record.measured_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.06]">
          <span className="text-sm text-white/40">
            Página {safePage} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="text-white/50 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={safePage === totalPages}
              className="text-white/50 hover:text-white disabled:opacity-30"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
