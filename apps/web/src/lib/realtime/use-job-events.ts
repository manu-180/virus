'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/browser'
import type { JobEventRow } from './types'

export function useJobEvents(videoId: string): {
  events: JobEventRow[]
  loading: boolean
} {
  const [events, setEvents] = useState<JobEventRow[]>([])
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
        .channel(`job-events-${videoId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'job_events',
            filter: `video_id=eq.${videoId}`,
          },
          (payload) => {
            if (mounted) setEvents((prev) => [...prev, payload.new as JobEventRow])
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
        .from('job_events')
        .select('*')
        .eq('video_id', videoId)
        .order('created_at', { ascending: true })

      if (!mounted) return
      if (!error) setEvents(data ?? [])
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
  }, [videoId])

  return { events, loading }
}
