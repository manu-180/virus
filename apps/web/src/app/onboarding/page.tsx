import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOnboardingProfile } from '@/server/onboarding/queries';
import { OnboardingWizard } from './onboarding-wizard';

function resolveInitialStep(
  profile: Awaited<ReturnType<typeof getOnboardingProfile>>
): number {
  if (!profile) return 0;

  const brandVoice = (profile.brand_voice ?? {}) as Record<string, unknown>;
  const hasBrand =
    profile.handle &&
    Object.keys(brandVoice).length > 0 &&
    brandVoice.audience;

  const hasVoice = profile.default_voice_clone_id || profile.onboarding_voice_skipped;

  if (hasBrand && hasVoice) return 3;
  if (hasBrand) return 2;
  return 0;
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const profile = await getOnboardingProfile(user.id);

  if (profile?.onboarding_completed_at) {
    redirect('/dashboard');
  }

  const initialStep = resolveInitialStep(profile);

  return (
    <Suspense fallback={null}>
      <OnboardingWizard initialStep={initialStep} profile={profile} />
    </Suspense>
  );
}
