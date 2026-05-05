'use client';

import { useActiveProject } from '@/lib/active-project/hook';
import { ProjectCombobox } from './combobox';

export function ProjectSwitcher() {
  const { activeProject, projects, switchProject, isLoading } = useActiveProject();

  if (isLoading) {
    return (
      <div className="h-8 w-36 animate-pulse rounded-lg bg-white/[0.06]" />
    );
  }

  return (
    <ProjectCombobox
      current={activeProject}
      projects={projects}
      onChange={switchProject}
    />
  );
}

export { ProjectSwitcher as TopbarProjectSwitcher };
