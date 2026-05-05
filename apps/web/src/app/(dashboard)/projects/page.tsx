import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProjectsList } from '@/server/projects/queries';
import ProjectsGrid from './_components/projects-grid';
import EmptyState from './_components/empty-state';

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function ProjectsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const projects = await fetchProjectsList(user.id);

  return (
    <div className="min-h-screen bg-[#111318] px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-white">Tus proyectos</h1>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#C8FF57] text-[#111318] font-semibold text-sm px-4 py-2 hover:bg-[#d4ff6e] transition-colors"
          >
            <span aria-hidden="true">+</span>
            Nuevo proyecto
          </Link>
        </div>

        {/* Content */}
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <ProjectsGrid projects={projects} />
        )}
      </div>
    </div>
  );
}
