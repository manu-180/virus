'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/browser'
import type { VideoRow } from './types'

export function useVideoStatus(videoId: string): {
  video: VideoRow | null
  loading: boolean
  error: Error | null
} {
  const [video, setVideo] = useState<VideoRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
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
        .channel(`video-status-${videoId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'videos',
            filter: `id=eq.${videoId}`,
          },
          (payload) => {
            if (mounted) setVideo(payload.new as VideoRow)
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
      const { data, error: fetchError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single()

      if (!mounted) return
      if (fetchError) {
        setError(new Error(fetchError.message))
      } else {
        setVideo(data)
      }
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

  return { video, loading, error }
}
