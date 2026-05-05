import type { Tables } from '@virus/db';

export type Video = Tables<'videos'>;

export interface ScheduledVideo {
  id: string;
  userId: string;
  scheduledFor: string | null; // ISO string, null for unscheduled ready videos
  status: string;
  themeColor: string | null;
  hookText: string | null; // from joined video_ideas
  template: string | null;
  videoUrl: string | null;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  video: ScheduledVideo | null;
}
