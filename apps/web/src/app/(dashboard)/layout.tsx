import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { OnboardingGate } from '@/components/onboarding-gate';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <OnboardingGate>
      <AppShell email={user.email ?? ''} avatarUrl={avatarUrl}>
        {children}
      </AppShell>
    </OnboardingGate>
  );
}
