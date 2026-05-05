'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { ProjectListItem } from '@/server/projects/types';
import ProjectCard from './project-card';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProjectsGridProps {
  projects: ProjectListItem[];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function ProjectsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-2 w-2 rounded-full mb-4" />
          <div className="border-t border-white/[0.06] mb-3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-0.5 w-8 mt-4 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectsGrid({ projects }: ProjectsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project, index) => (
        <ProjectCard key={project.id} project={project} index={index} />
      ))}
    </div>
  );
}
