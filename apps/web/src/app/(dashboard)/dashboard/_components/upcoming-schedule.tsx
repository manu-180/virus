import { Calendar } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoIdea {
  hook_text: string
}

interface ScheduledVideo {
  id: string
  scheduled_for: string | null
  idea_id: string | null
  video_ideas: VideoIdea | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns "YYYY-MM-DD" for a given Date (local time). */
function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Spanish day abbreviations. getDay() → 0=Sun, 1=Mon, …, 6=Sat */
const DAY_ABBR = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const

function getDayAbbr(date: Date): string {
  return DAY_ABBR[date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6]
}

/** Formats a ISO date string as a short Spanish label, e.g. "Mié 7" */
const SHORT_DAY_NAMES = [
  'Dom',
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
] as const

function formatShortDate(iso: string): string {
  const date = new Date(iso)
  return `${SHORT_DAY_NAMES[date.getDay()]} ${date.getDate()}`
}

// ---------------------------------------------------------------------------
// Skeleton export
// ---------------------------------------------------------------------------

export function UpcomingScheduleSkeleton() {
  return (
    <section className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-36 bg-white/[0.08]" />
      </div>

      {/* 7-day grid skeleton */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center py-2 px-1 gap-1">
            <Skeleton className="h-3 w-4 bg-white/[0.06]" />
            <Skeleton className="h-4 w-5 bg-white/[0.06]" />
            <Skeleton className="h-1.5 w-1.5 rounded-full bg-white/[0.06]" />
          </div>
        ))}
      </div>

      {/* List skeleton */}
      <div className="space-y-3 mt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-14 bg-white/[0.06]" />
            <Skeleton className="h-3 flex-1 bg-white/[0.06]" />
          </div>
        ))}
      </div>

      <Skeleton className="h-3 w-36 bg-white/[0.06] mt-4" />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Server component (default export)
// ---------------------------------------------------------------------------

export default async function UpcomingSchedule() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Build today (midnight) and 7 days later
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sevenDaysLater = new Date(today)
  sevenDaysLater.setDate(today.getDate() + 7)

  const { data: scheduled } = await supabase
    .from('videos')
    .select('id, scheduled_for, idea_id, video_ideas(hook_text:hook)')
    .eq('user_id', user.id)
    .gte('scheduled_for', today.toISOString())
    .lt('scheduled_for', sevenDaysLater.toISOString())
    .is('deleted_at', null)
    .order('scheduled_for', { ascending: true })

  const scheduledList = (scheduled ?? []) as ScheduledVideo[]

  // Group by "YYYY-MM-DD"
  const byDate = new Map<string, ScheduledVideo[]>()
  for (const video of scheduledList) {
    if (!video.scheduled_for) continue
    const key = formatDateKey(new Date(video.scheduled_for))
    const existing = byDate.get(key) ?? []
    existing.push(video)
    byDate.set(key, existing)
  }

  // Build the 7-day array starting from today
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })

  const todayKey = formatDateKey(today)

  return (
    <section className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Próximos 7 días</h2>
      </div>

      {/* 7-day mini calendar */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {days.map((day) => {
          const dateKey = formatDateKey(day)
          const hasVideo = byDate.has(dateKey)
          const isToday = dateKey === todayKey

          return (
            <div
              key={dateKey}
              className={`flex flex-col items-center py-2 px-1 rounded-lg ${
                isToday ? 'bg-white/[0.06]' : ''
              }`}
            >
              <span className="text-[10px] text-white/40 mb-1">
                {getDayAbbr(day)}
              </span>
              <span
                className={`text-sm font-medium ${
                  isToday ? 'text-white' : 'text-white/60'
                }`}
              >
                {day.getDate()}
              </span>
              <div
                className="mt-1.5 w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: hasVideo ? '#C8FF57' : 'transparent',
                  border: hasVideo ? 'none' : '1px solid rgba(255,255,255,0.2)',
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Scheduled list */}
      {scheduledList.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-white/30">
          <Calendar className="w-8 h-8 mb-2" />
          <p className="text-sm">No hay videos programados esta semana</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scheduledList.slice(0, 5).map((video) => (
            <div key={video.id} className="flex items-center gap-3 text-sm">
              <span className="text-white/40 w-14 shrink-0 text-xs">
                {formatShortDate(video.scheduled_for!)}
              </span>
              <span className="text-white/80 truncate">
                {video.video_ideas?.hook_text ?? 'Sin título'}
              </span>
            </div>
          ))}
        </div>
      )}

      <a
        href="/calendar"
        className="mt-4 inline-flex items-center text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        Ver calendario completo →
      </a>
    </section>
  )
}
