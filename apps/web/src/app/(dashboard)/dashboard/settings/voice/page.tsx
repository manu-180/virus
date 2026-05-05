import { getProfile } from '@/server/profile/actions';
import VoiceSettingsClient from './_components/VoiceSettingsClient';

export const metadata = {
  title: 'Voz clonada | Configuración',
};

export default async function VoiceSettingsPage() {
  const profileResult = await getProfile();

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

  return <VoiceSettingsClient profile={profileResult.data} />;
}
