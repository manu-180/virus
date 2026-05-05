export interface PerfRecord {
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
  video_id: string
  hook_text: string | null
  format: string | null
  pillar_name: string | null
  hook_type: string | null // from metadata?.hook_type
}

export interface DimStat {
  label: string
  avg_views: number
  avg_engagement: number // (saves+shares)/views * 100
  count: number
}

export interface HourStat {
  hour: number
  avg_views: number
  count: number
}
