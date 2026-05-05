import { createClient } from '@/lib/supabase/server'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarDays, Eye, ListVideo, TrendingUp } from 'lucide-react'
import { KpiCard, type KpiCardProps } from './kpi-card'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatEngagement(rate: number | null): string {
  if (rate === null) return '—'
  return `${rate.toFixed(1)}%`
}

/** Returns the start of the current ISO week (Monday 00:00:00 UTC). */
function startOfCurrentWeekUTC(): Date {
  const now = new Date()
  const day = now.getUTCDay() // 0 = Sunday
  const diff = (day === 0 ? -6 : 1 - day) // adjust so Monday = 0
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff))
  return monday
}

type TrendInfo = {
  direction: 'up' | 'down'
  pct: number
} | null

function calcTrend(current: number, previous: number): TrendInfo {
  if (previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return null
  return { direction: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function StatsGridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <Skeleton className="h-8 w-24 mt-2" />
          <Skeleton className="h-3 w-16 mt-2" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Server component
// ---------------------------------------------------------------------------

export default async function StatsGrid() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // page.tsx handles redirect; render empty state here
    return <StatsGridSkeleton />
  }

  const now = new Date()
  const currentWeekStart = startOfCurrentWeekUTC()
  const previousWeekStart = new Date(currentWeekStart)
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7)

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14)

  // Run all queries in parallel
  const [
    queueResult,
    thisWeekResult,
    prevWeekResult,
    viewsResult,
    engCurrentResult,
    engPrevResult,
  ] = await Promise.all([
    // KPI 1 — queue (pipeline statuses, not deleted)
    supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['scripting', 'audio', 'rendering', 'ready'])
      .is('deleted_at', null),

    // KPI 2 — created this week
    supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', currentWeekStart.toISOString())
      .is('deleted_at', null),

    // KPI 2 trend — created previous week
    supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', previousWeekStart.toISOString())
      .lt('created_at', currentWeekStart.toISOString())
      .is('deleted_at', null),

    // KPI 3 — total views (join via select on video_performance)
    supabase
      .from('video_performance')
      .select('views, videos!inner(user_id)')
      .eq('videos.user_id', user.id),

    // KPI 4 — engagement last 7 days
    supabase
      .from('video_performance')
      .select('views, likes, shares, comments, videos!inner(user_id)')
      .eq('videos.user_id', user.id)
      .gte('measured_at', sevenDaysAgo.toISOString()),

    // KPI 4 trend — engagement previous 7 days
    supabase
      .from('video_performance')
      .select('views, likes, shares, comments, videos!inner(user_id)')
      .eq('videos.user_id', user.id)
      .gte('measured_at', fourteenDaysAgo.toISOString())
      .lt('measured_at', sevenDaysAgo.toISOString()),
  ])

  // ---- KPI 1: Queue count ----
  const queueCount = queueResult.count ?? 0

  // ---- KPI 2: This week + trend vs previous week ----
  const thisWeekCount = thisWeekResult.count ?? 0
  const prevWeekCount = prevWeekResult.count ?? 0
  const weekTrend = calcTrend(thisWeekCount, prevWeekCount)

  // ---- KPI 3: Total views ----
  type PerfRow = { views: number }
  const perfRows = (viewsResult.data ?? []) as PerfRow[]
  const totalViews = perfRows.reduce((sum, row) => sum + (row.views ?? 0), 0)

  // ---- KPI 4: Engagement rate ----
  type EngRow = { views: number; likes: number; shares: number; comments: number }

  function computeEngagement(rows: EngRow[]): number | null {
    const totalViewsLocal = rows.reduce((s, r) => s + (r.views ?? 0), 0)
    const totalInteractions = rows.reduce(
      (s, r) => s + (r.likes ?? 0) + (r.shares ?? 0) + (r.comments ?? 0),
      0,
    )
    if (totalViewsLocal === 0) return null
    return (totalInteractions / totalViewsLocal) * 100
  }

  const engCurrentRows = (engCurrentResult.data ?? []) as EngRow[]
  const engPrevRows = (engPrevResult.data ?? []) as EngRow[]

  const engCurrent = computeEngagement(engCurrentRows)
  const engPrev = computeEngagement(engPrevRows)

  let engTrend: TrendInfo = null
  if (engCurrent !== null && engPrev !== null) {
    engTrend = calcTrend(Math.round(engCurrent * 10), Math.round(engPrev * 10))
  }

  // ---- Queue trend: compare current week vs previous week queue additions ----
  // Re-use weekTrend directionally for the queue card (same week window)
  const queueTrend: TrendInfo = null // queue is point-in-time, no meaningful week-over-week

  // ---- Build card definitions ----
  const cards: KpiCardProps[] = [
    {
      label: 'En cola',
      value: String(queueCount),
      icon: <ListVideo className="w-4 h-4 text-white/30" />,
      trend: queueTrend,
      index: 0,
    },
    {
      label: 'Esta semana',
      value: String(thisWeekCount),
      icon: <CalendarDays className="w-4 h-4 text-white/30" />,
      trend: weekTrend,
      index: 1,
    },
    {
      label: 'Vistas totales',
      value: formatViews(totalViews),
      icon: <Eye className="w-4 h-4 text-white/30" />,
      trend: null,
      index: 2,
    },
    {
      label: 'Engagement',
      value: formatEngagement(engCurrent),
      icon: <TrendingUp className="w-4 h-4 text-white/30" />,
      trend: engTrend,
      index: 3,
    },
  ]

  return (
    <div data-tour="stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  )
}
