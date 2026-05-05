import { createClient } from '@/lib/supabase/server';

export async function getOnboardingProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, handle, default_language, brand_voice, default_voice_clone_id, onboarding_completed_at, onboarding_voice_skipped')
    .eq('id', userId)
    .single();
  return data;
}

export type OnboardingProfile = NonNullable<
  Awaited<ReturnType<typeof getOnboardingProfile>>
>;
