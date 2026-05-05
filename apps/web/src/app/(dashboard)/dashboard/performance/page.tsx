import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MetricsModal from './_components/metrics-modal'
import OverviewSection from './_components/overview-section'
import StatsCharts from './_components/stats-charts'
import PerformanceTable from './_components/performance-table'
import InsightCards from './_components/insight-cards'
import type { PerfRecord, DimStat, HourStat } from './_components/types'

// ---------------------------------------------------------------------------
// Supabase join shape
// ---------------------------------------------------------------------------

type RawPerfRow = {
  id: string
  platform: string
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
  avg_watch_time: number | null
  hook_retention: number | null
  measured_at: string
  videos: {
    id: string
    video_ideas: {
      hook: string | null
      format: string | null
      metadata: Record<string, string> | null
      content_pillars: { name: string } | null
    } | null
  }
}

// ---------------------------------------------------------------------------
// Derived data helpers
// ---------------------------------------------------------------------------

function groupDimStats(
  records: PerfRecord[],
  keyFn: (r: PerfRecord) => string | null,
): DimStat[] {
  const map: Record<
    string,
    { views: number; engagement: number; count: number }
  > = {}

  records.forEach((r) => {
    const key = keyFn(r)
    if (!key) return
    if (!map[key]) map[key] = { views: 0, engagement: 0, count: 0 }
    map[key].views += r.views
    if (r.views > 0) {
      map[key].engagement += ((r.saves + r.shares) / r.views) * 100
    }
    map[key].count += 1
  })

  return Object.entries(map)
    .map(([label, { views, engagement, count }]) => ({
      label,
      avg_views: count > 0 ? views / count : 0,
      avg_engagement: count > 0 ? engagement / count : 0,
      count,
    }))
    .sort((a, b) => b.avg_views - a.avg_views)
}

function computeHourStats(records: PerfRecord[]): HourStat[] {
  const map: Record<number, { views: number; count: number }> = {}

  records.forEach((r) => {
    const hour = new Date(r.measured_at).getHours()
    if (!map[hour]) map[hour] = { views: 0, count: 0 }
    map[hour].views += r.views
    map[hour].count += 1
  })

  return Object.entries(map)
    .map(([hour, { views, count }]) => ({
      hour: Number(hour),
      avg_views: count > 0 ? views / count : 0,
      count,
    }))
    .sort((a, b) => a.hour - b.hour)
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function PerformancePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // ---- Parallel data fetching ----
  const [{ data: rawPerf }, { data: publishedVideos }] = await Promise.all([
    supabase
      .from('video_performance')
      .select(
        `
        id, platform, views, likes, comments, saves, shares, avg_watch_time, hook_retention, measured_at,
        videos!inner(
          id,
          video_ideas(hook, format, metadata,
            content_pillars(name)
          )
        )
      `,
      )
      .eq('videos.user_id', user.id)
      .order('measured_at', { ascending: false }),

    supabase
      .from('videos')
      .select('id, video_ideas(hook)')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false }),
  ])

  // ---- Flatten join ----
  const records: PerfRecord[] = ((rawPerf ?? []) as unknown as RawPerfRow[]).map(
    (row) => {
      const idea = row.videos?.video_ideas
      return {
        id: row.id,
        video_id: row.videos?.id ?? '',
        platform: row.platform,
        views: row.views ?? 0,
        likes: row.likes ?? 0,
        comments: row.comments ?? 0,
        saves: row.saves ?? 0,
        shares: row.shares ?? 0,
        avg_watch_time: row.avg_watch_time ?? null,
        hook_retention: row.hook_retention ?? null,
        measured_at: row.measured_at,
        hook_text: idea?.hook ?? null,
        format: idea?.format ?? null,
        pillar_name: idea?.content_pillars?.name ?? null,
        hook_type: (idea?.metadata as Record<string, string> | null)?.hook_type ?? null,
      }
    },
  )

  // ---- Top 10 by engagement ratio ----
  const top10 = [...records]
    .filter((r) => r.views > 0)
    .sort(
      (a, b) =>
        (b.saves + b.shares) / b.views - (a.saves + a.shares) / a.views,
    )
    .slice(0, 10)

  // ---- Dimension stats ----
  const pillarStats = groupDimStats(records, (r) => r.pillar_name)
  const formatStats = groupDimStats(records, (r) => r.format)
  const hookTypeStats = groupDimStats(
    records,
    (r) =>
      r.hook_type ??
      (r.hook_text
        ? r.hook_text.trim().split(/\s+/).slice(0, 3).join(' ')
        : null),
  )

  // ---- Hour heatmap ----
  const hourStats: HourStat[] = computeHourStats(records)

  // ---- Published videos for modal ----
  type PublishedRow = { id: string; video_ideas: { hook: string } | null }
  const videoOptions = ((publishedVideos ?? []) as unknown as PublishedRow[]).map(
    (v) => ({ id: v.id, video_ideas: v.video_ideas }),
  )

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Performance</h1>
            <p className="text-white/50 mt-1">
              Analizá qué videos funcionan mejor.
            </p>
          </div>
          <MetricsModal videos={videoOptions} />
        </div>

        {/* Top 10 overview */}
        <OverviewSection top10={top10} />

        {/* Dimension charts */}
        <StatsCharts
          pillarStats={pillarStats}
          formatStats={formatStats}
          hookTypeStats={hookTypeStats}
          hourStats={hourStats}
        />

        {/* Detail table */}
        <PerformanceTable records={records} />

        {/* Insight cards */}
        <InsightCards records={records} />
      </div>
    </div>
  )
}
