import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import VisualStyleSettingsClient from './_components/VisualStyleSettingsClient';

export const metadata = { title: 'Estilo visual | Configuración' };

export default async function VisualStyleSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <VisualStyleSettingsClient />;
}
