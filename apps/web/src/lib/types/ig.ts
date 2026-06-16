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

export type ScheduleAngle =
  | 'educational'
  | 'contrarian'
  | 'story-arc'
  | 'before-after'
  | 'listicle';

export type ScheduleTone = 'direct' | 'authoritative' | 'casual' | 'contrarian';

export type ScheduleStylePreset = 'minimal' | 'bold' | 'editorial';

export type ScheduleLanguage = 'es' | 'en';

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
  /** Minimum hours between posts on the same account (cooldown). 1..72. Values >24 express sub-daily cadences (44 ≈ every other day). */
  min_hours_between_posts: number;
  /** Auth-error counter; auto-disable at 3. */
  consecutive_failures: number;
  last_dispatched_at: string | null;
  last_carousel_id: string | null;
  /** Set when the worker auto-disables (e.g. 'token_expired'). */
  disabled_reason: string | null;
  /** Default angle used when generating an auto-scheduled carousel. */
  default_angle: ScheduleAngle;
  /** Default tone used when generating an auto-scheduled carousel. */
  default_tone: ScheduleTone;
  /** Slide count (3..10) for auto-generated carousels. */
  default_slide_count: number;
  /** Visual preset for auto-generated carousels. */
  default_style_preset: ScheduleStylePreset;
  /** Output language for auto-generated carousels. */
  default_language: ScheduleLanguage;
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
  // Calm cadence by default: one post every ~48h at a single evening window.
  // posts_per_day=1 + 44h cooldown reliably skips a day; UTC 23 ≈ 20:00 AR.
  posts_per_day: 1,
  target_hours_utc: [23],
  jitter_minutes: 30,
  min_hours_between_posts: 44,
  default_angle: 'educational',
  default_tone: 'direct',
  default_slide_count: 5,
  default_style_preset: 'bold',
  default_language: 'es',
};

/** Body accepted by PUT /api/ig-accounts/[id]/schedule. */
export interface UpdateSchedulePayload {
  enabled: boolean;
  posts_per_day: number;
  target_hours_utc: number[];
  jitter_minutes: number;
  min_hours_between_posts: number;
  default_angle: ScheduleAngle;
  default_tone: ScheduleTone;
  default_slide_count: number;
  default_style_preset: ScheduleStylePreset;
  default_language: ScheduleLanguage;
}

export const SCHEDULE_ANGLES: readonly ScheduleAngle[] = [
  'educational',
  'contrarian',
  'story-arc',
  'before-after',
  'listicle',
] as const;

export const SCHEDULE_TONES: readonly ScheduleTone[] = [
  'direct',
  'authoritative',
  'casual',
  'contrarian',
] as const;

export const SCHEDULE_STYLE_PRESETS: readonly ScheduleStylePreset[] = [
  'minimal',
  'bold',
  'editorial',
] as const;

export const SCHEDULE_LANGUAGES: readonly ScheduleLanguage[] = ['es', 'en'] as const;

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
