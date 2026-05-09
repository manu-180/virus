import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchProjectsList } from '@/server/projects/queries';
import { NewCarouselForm } from '@/components/carousels/NewCarouselForm';

export const metadata = {
  title: 'Nuevo carrusel',
};

export default async function NewCarouselPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const projects = await fetchProjectsList(user.id);

  if (projects.length === 0) {
    return (
      <div className="min-h-screen bg-[#111318] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">Necesitás un proyecto primero</h1>
          <p className="text-muted-foreground">
            Creá tu primer proyecto antes de generar carruseles.
          </p>
          <Link
            href="/dashboard/projects/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#C8FF57] text-[#111318] font-semibold text-sm px-4 py-2 hover:bg-[#d4ff6e] transition-colors"
          >
            Crear proyecto
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Nuevo carrusel</h1>
          <p className="text-muted-foreground mt-1">Completá el brief y arrancamos.</p>
        </div>
        <NewCarouselForm projects={projects} />
      </div>
    </div>
  );
}
