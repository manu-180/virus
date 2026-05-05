'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/browser'
import type { VideoRow } from './types'

export function usePipelineStatus(userId: string): {
  videos: VideoRow[]
  loading: boolean
} {
  const [videos, setVideos] = useState<VideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const subscribe = () => {
      if (!mounted) return
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }

      channelRef.current = supabase
        .channel(`pipeline-status-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'videos',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!mounted) return
            const { eventType, new: newRecord, old: oldRecord } = payload

            if (eventType === 'INSERT') {
              setVideos((prev) => [newRecord as VideoRow, ...prev])
            } else if (eventType === 'UPDATE') {
              const updated = newRecord as VideoRow
              setVideos((prev) =>
                prev.map((v) => (v.id === updated.id ? updated : v))
              )
            } else if (eventType === 'DELETE') {
              const removed = oldRecord as VideoRow
              setVideos((prev) => prev.filter((v) => v.id !== removed.id))
            }
          }
        )
        .subscribe((status) => {
          if (!mounted) return
          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            retryTimer = setTimeout(subscribe, 3000)
          }
        })
    }

    const init = async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (!mounted) return
      if (!error) setVideos(data ?? [])
      setLoading(false)
    }

    init()
    subscribe()

    return () => {
      mounted = false
      if (retryTimer) clearTimeout(retryTimer)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [userId])

  return { videos, loading }
}
