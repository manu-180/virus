import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import patternsJson from './apex-dev/patterns.json';
import brandJson from './apex-dev/brand.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePatternsMd = readFileSync(join(__dirname, 'apex-dev/sample-patterns.md'), 'utf-8');
const sampleBrandMd = readFileSync(join(__dirname, 'apex-dev/sample-brand.md'), 'utf-8');
import type { ProjectPatterns, ProjectBrand } from '../types.js';

export interface SeedProject {
  slug: string;
  name: string;
  niche: string;
  language: string;
  themeColor: string;
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  samplePatternsMarkdown: string;
  sampleBrandMarkdown: string;
}

export const SEED_APEX_DEV: SeedProject = {
  slug: 'apex-dev',
  name: 'APEX — Servicios de software',
  niche: 'dev/software',
  language: 'es-AR',
  themeColor: '#3ECF8E',
  patterns: patternsJson as ProjectPatterns,
  brand: brandJson as ProjectBrand,
  samplePatternsMarkdown: samplePatternsMd,
  sampleBrandMarkdown: sampleBrandMd,
};

export const ALL_SEEDS: SeedProject[] = [SEED_APEX_DEV];

export function getSeedBySlug(slug: string): SeedProject | undefined {
  return ALL_SEEDS.find((s) => s.slug === slug);
}

// Per-brand image-generation profiles — see ./image-profiles.ts for the
// curated templates for APEX, BotLode, OficiosApp, Assistify.
export {
  APEX_IMAGE_PROFILE,
  BOTLODE_IMAGE_PROFILE,
  OFICIOS_IMAGE_PROFILE,
  ASSISTIFY_IMAGE_PROFILE,
  IMAGE_PROFILES,
  getImageProfileForBrand,
} from './image-profiles.js';
