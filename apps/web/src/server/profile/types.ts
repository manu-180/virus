import type { BrandVoice, ScheduleConfig } from '@/lib/zod/profile-schemas';

export type { BrandVoice, ScheduleConfig };

export interface Profile {
  id: string;
  handle: string | null;
  default_voice_clone_id: string | null;
  default_language: string;
  avatar_url: string | null;
  brand_voice: BrandVoice | Record<string, never>;
  schedule_config: ScheduleConfig | Record<string, never>;
  created_at: string;
  updated_at: string;
}
