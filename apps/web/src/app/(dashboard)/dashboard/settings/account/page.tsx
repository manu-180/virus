import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/server/profile/actions';
import AccountSettingsClient from './_components/AccountSettingsClient';

export const metadata = {
  title: 'Mi cuenta | Configuración',
};

export default async function AccountSettingsPage() {
  // Run both fetches in parallel
  const [supabase, profileResult] = await Promise.all([
    createClient(),
    getProfile(),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Profile error state
  if (!profileResult.ok) {
    return (
      <div className="bg-bg-surface rounded-lg border border-border p-6">
        <p className="text-danger text-sm">
          No se pudo cargar el perfil:{' '}
          <span className="font-mono">{profileResult.error.message}</span>
        </p>
      </div>
    );
  }

  return (
    <AccountSettingsClient
      profile={profileResult.data}
      email={user?.email}
    />
  );
}
