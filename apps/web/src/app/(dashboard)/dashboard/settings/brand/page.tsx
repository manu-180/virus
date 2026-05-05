import { getProfile } from '@/server/profile/actions';
import BrandVoiceClient from './_components/BrandVoiceClient';

export const metadata = {
  title: 'Brand voice | Configuración',
};

export default async function BrandVoicePage() {
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

  return <BrandVoiceClient profile={profileResult.data} />;
}
