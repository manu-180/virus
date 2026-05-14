/**
 * Instagram-related shared types for the web app.
 *
 * Mirrors the `ig_publication_schedules` table (migration 0034) plus the
 * preview shape returned by `/api/ig-accounts/[id]/schedule/preview`.
 *
 * Keep these in sync with:
 *   - packages/db/migrations/0034_ig_publication_schedules.sql
 *   - apps/worker/src/functions/auto-publish-scheduler.ts
 */

export interface IgPublicationSchedule {
  id: string;
  ig_account_id: string;
  user_id: string;
  enabled: boolean;
  /** 1..5 posts per 24h window (hard cap matches ig_accounts.daily_post_limit ceiling). */
  posts_per_day: number;
  /** Target publish hours in UTC (0..23). UI converts to local time on render. */
  target_hours_utc: number[];
  /** Random jitter (minutes) applied around each target hour. 0..60. */
  jitter_minutes: number;
  /** Minimum hours between posts on the same account. 1..24. */
  min_hours_between_posts: number;
  /** Auth-error counter; auto-disable at 3. */
  consecutive_failures: number;
  last_dispatched_at: string | null;
  last_carousel_id: string | null;
  /** Set when the worker auto-disables (e.g. 'token_expired'). */
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Defaults used when an account has no schedule row yet. */
export const DEFAULT_SCHEDULE: Omit<
  IgPublicationSchedule,
  'id' | 'ig_account_id' | 'user_id' | 'created_at' | 'updated_at' |
  'consecutive_failures' | 'last_dispatched_at' | 'last_carousel_id' |
  'disabled_reason'
> = {
  enabled: false,
  posts_per_day: 2,
  target_hours_utc: [13, 19],
  jitter_minutes: 25,
  min_hours_between_posts: 4,
};

/** Body accepted by PUT /api/ig-accounts/[id]/schedule. */
export interface UpdateSchedulePayload {
  enabled: boolean;
  posts_per_day: number;
  target_hours_utc: number[];
  jitter_minutes: number;
  min_hours_between_posts: number;
}

/** Item in the response of GET /api/ig-accounts/[id]/schedule/preview. */
export interface ScheduleWindowPreview {
  /** ISO-8601 target instant (center of the jitter window). */
  targetTime: string;
  /** ISO-8601 earliest acceptable dispatch time (target - jitter). */
  jitterMin: string;
  /** ISO-8601 latest acceptable dispatch time (target + jitter). */
  jitterMax: string;
}

export interface SchedulePreviewResponse {
  windows: ScheduleWindowPreview[];
}
