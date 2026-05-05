import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function OnboardingGate({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout already redirects to /login when no user — just pass through
  if (!user) return <>{children}</>;

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed_at) {
    redirect('/onboarding');
  }

  return <>{children}</>;
}
