import type { Tables } from '@virus/db';
import type { ProjectPatterns, ProjectBrand } from '@virus/shared/viral';

export type Project = Tables<'projects'>;
export type ProjectFile = Tables<'project_files'>;

export type { ProjectPatterns, ProjectBrand };

export interface ProjectListItem {
  id: string;
  slug: string;
  name: string;
  themeColor: string;
  inQueue: number;
  lastPublished: string | null;
}

export interface ProjectFull extends Project {
  patterns: ProjectPatterns | null;
  brand: ProjectBrand | null;
  files: ProjectFile[];
  pipelineCount: Record<string, number>;
}
