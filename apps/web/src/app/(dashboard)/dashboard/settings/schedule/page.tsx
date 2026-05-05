import { getProfile } from '@/server/profile/actions';
import ScheduleClient from './_components/ScheduleClient';

export const metadata = {
  title: 'Calendario | Configuración',
};

export default async function SchedulePage() {
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

  return <ScheduleClient profile={profileResult.data} />;
}
