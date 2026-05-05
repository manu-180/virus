import { Video } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { VideoCard, type VideoRow } from './video-card'

// ---------------------------------------------------------------------------
// Skeleton export
// ---------------------------------------------------------------------------

export function RecentVideosSkeleton() {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-36 bg-white/[0.08]" />
        <Skeleton className="h-4 w-16 bg-white/[0.06]" />
      </div>

      <div className="flex gap-4 pb-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-none w-52 rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08]"
          >
            <Skeleton className="h-32 w-full bg-white/[0.06] rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-3 w-full bg-white/[0.06]" />
              <Skeleton className="h-3 w-3/4 bg-white/[0.06]" />
              <div className="flex gap-3 pt-1">
                <Skeleton className="h-3 w-10 bg-white/[0.06]" />
                <Skeleton className="h-3 w-10 bg-white/[0.06]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Server component (default export)
// ---------------------------------------------------------------------------

export default async function RecentVideos() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: videos } = await supabase
    .from('videos')
    .select(
      'id, published_at, video_url, theme_color, idea_id, video_ideas(hook_text:hook), video_performance(views, likes, platform)'
    )
    .eq('user_id', user.id)
    .not('published_at', 'is', null)
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(5)

  const videoList = (videos ?? []) as VideoRow[]

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Videos recientes</h2>
        <a
          href="/videos"
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          Ver todos →
        </a>
      </div>

      {videoList.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-white/30">
          <Video className="w-10 h-10 mb-3" />
          <p className="text-sm">Aún no publicaste ningún video</p>
        </div>
      ) : (
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4">
            {videoList.map((video, i) => (
              <VideoCard key={video.id} video={video} index={i} />
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  )
}
