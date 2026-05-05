'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  Film,
  ListVideo,
  Mic,
  PenLine,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'

// ─── Types ────────────────────────────────────────────────────────────────────

type PipelineStatus = 'scripting' | 'audio' | 'rendering' | 'ready'

interface PipelineVideo {
  id: string
  status: PipelineStatus
  idea_id: string | null
  created_at: string
  video_ideas: { hook_text: string }[] | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STATUSES: PipelineStatus[] = ['scripting', 'audio', 'rendering', 'ready']

const STATUS_PROGRESS: Record<PipelineStatus, number> = {
  scripting: 25,
  audio: 50,
  rendering: 75,
  ready: 100,
}

const STATUS_LABELS: Record<PipelineStatus, string> = {
  scripting: 'Escribiendo',
  audio: 'Audio',
  rendering: 'Renderizando',
  ready: 'Listo',
}

const STATUS_COLORS: Record<PipelineStatus, string> = {
  scripting: 'text-blue-400',
  audio: 'text-purple-400',
  rendering: 'text-amber-400',
  ready: 'text-emerald-400',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: PipelineStatus }) {
  const baseClass = 'w-5 h-5 shrink-0'

  switch (status) {
    case 'scripting':
      return <PenLine className={`${baseClass} text-blue-400 animate-pulse`} />
    case 'audio':
      return <Mic className={`${baseClass} text-purple-400 animate-pulse`} />
    case 'rendering':
      return (
        <Film
          className={`${baseClass} text-amber-400 animate-spin`}
          style={{ animationDuration: '3s' }}
        />
      )
    case 'ready':
      return <CheckCircle2 className={`${baseClass} text-emerald-400`} />
  }
}

function StatusBadge({ status }: { status: PipelineStatus }) {
  return (
    <span className={`text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Skeleton Export ──────────────────────────────────────────────────────────

export function ActivePipelineSkeleton() {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
      <Skeleton className="h-6 w-40 mb-4" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 mb-2">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-1.5 w-32" />
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActivePipeline() {
  const [videos, setVideos] = useState<PipelineVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let channelRef: ReturnType<typeof supabase.channel> | null = null

    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setError('No autenticado')
          setLoading(false)
          return
        }

        const { data, error: fetchError } = await supabase
          .from('videos')
          .select('id, status, idea_id, created_at, video_ideas(hook_text:hook)')
          .eq('user_id', user.id)
          .in('status', PIPELINE_STATUSES)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        if (fetchError) throw fetchError
        setVideos((data as PipelineVideo[]) ?? [])

        channelRef = supabase
          .channel('active-pipeline')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'videos',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              const { eventType, new: newRecord, old: oldRecord } = payload

              if (eventType === 'INSERT') {
                const incoming = newRecord as PipelineVideo
                if (PIPELINE_STATUSES.includes(incoming.status)) {
                  setVideos((prev) => [incoming, ...prev].slice(0, 10))
                }
              } else if (eventType === 'UPDATE') {
                const updated = newRecord as PipelineVideo
                if (PIPELINE_STATUSES.includes(updated.status)) {
                  setVideos((prev) =>
                    prev.map((v) => (v.id === updated.id ? updated : v))
                  )
                } else {
                  setVideos((prev) => prev.filter((v) => v.id !== updated.id))
                }
              } else if (eventType === 'DELETE') {
                const removed = oldRecord as { id: string }
                setVideos((prev) => prev.filter((v) => v.id !== removed.id))
              }
            }
          )
          .subscribe()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar el pipeline')
      } finally {
        setLoading(false)
      }
    }

    init()

    return () => {
      if (channelRef) supabase.removeChannel(channelRef)
    }
  }, [])

  // ─── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return <ActivePipelineSkeleton />
  }

  if (error) {
    return (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Pipeline activo</h2>
        </div>
        <p className="text-sm text-red-400/80">{error}</p>
      </div>
    )
  }

  // ─── Main render ────────────────────────────────────────────────────────────

  return (
    <div data-tour="pipeline" className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Pipeline activo</h2>
        <span className="text-sm text-white/50">{videos.length} en proceso</span>
      </div>

      {/* Empty state */}
      {videos.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-white/30">
          <ListVideo className="w-10 h-10 mb-3" />
          <p className="text-sm">No hay videos en proceso</p>
          <p className="text-xs mt-1">Los videos activos aparecerán aquí en tiempo real</p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {videos.map((video) => {
              const rawTitle = video.video_ideas?.[0]?.hook_text ?? null
              const title = rawTitle
                ? rawTitle.length > 60
                  ? rawTitle.slice(0, 60) + '…'
                  : rawTitle
                : 'Video sin título'

              return (
                <motion.li
                  key={video.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <StatusIcon status={video.status} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{title}</p>
                      <StatusBadge status={video.status} />
                    </div>

                    <div className="w-32 shrink-0">
                      <Progress
                        value={STATUS_PROGRESS[video.status]}
                        className="h-1.5"
                      />
                    </div>

                    <a
                      href={`/videos/${video.id}`}
                      className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0"
                    >
                      Ver →
                    </a>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
