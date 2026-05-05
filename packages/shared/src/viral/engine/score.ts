export interface VideoPerformance {
  hookId: string;
  topicId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimePercent: number;
  platform: 'reels' | 'tiktok' | 'shorts';
  recordedAt: string;
}

export interface ScoreDelta {
  hookScoreDelta: number;   // positive = performed better than average
  topicScoreDelta: number;
}

/**
 * Derive score deltas from video performance data.
 * Full implementation in T6-P03 — this is a placeholder.
 */
export function scorePerformance(_perf: VideoPerformance): ScoreDelta {
  // Placeholder: return neutral deltas until feedback loop is implemented
  return { hookScoreDelta: 0, topicScoreDelta: 0 };
}
