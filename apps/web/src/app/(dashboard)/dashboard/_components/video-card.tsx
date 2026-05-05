'use client';

import { motion } from 'framer-motion';
import { Eye, Heart, Play } from 'lucide-react';

interface VideoPerformanceEntry {
  views: number;
  likes: number;
  platform: string;
}

interface VideoIdea {
  hook_text: string;
}

export interface VideoRow {
  id: string;
  published_at: string | null;
  video_url: string | null;
  theme_color: string | null;
  idea_id: string | null;
  video_ideas: VideoIdea | null;
  video_performance: VideoPerformanceEntry[];
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

interface VideoCardProps {
  video: VideoRow;
  index: number;
}

export function VideoCard({ video, index }: VideoCardProps) {
  const title = video.video_ideas?.hook_text ?? 'Video sin título';
  const platform = video.video_performance?.[0]?.platform ?? 'Unknown';
  const views = video.video_performance?.[0]?.views ?? 0;
  const likes = video.video_performance?.[0]?.likes ?? 0;

  return (
    <motion.div
      className="flex-none w-52 rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.2] transition-all cursor-pointer group"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <div className="relative h-32 bg-white/[0.06] overflow-hidden">
        {video.video_url ? (
          <video
            src={video.video_url}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            muted
            preload="none"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              backgroundColor: video.theme_color ? `${video.theme_color}22` : '#ffffff08',
            }}
          >
            <Play className="w-8 h-8 text-white/20" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white/70 uppercase tracking-wide">
            {platform}
          </span>
        </div>
      </div>

      <div className="p-3">
        <p className="text-xs font-medium text-white line-clamp-2 mb-2">{title}</p>
        <div className="flex items-center gap-3 text-[11px] text-white/40">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {formatNumber(views)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3" />
            {formatNumber(likes)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
