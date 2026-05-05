import type { ProjectPatterns, ProjectBrand } from '../types.js';
import {
  ProjectPatternsSchema,
  ProjectPatternsPartialSchema,
  ProjectBrandSchema,
  ProjectBrandPartialSchema,
} from './zod-schemas.js';

type PatternsOk = { ok: true; data: ProjectPatterns };
type PatternsErr = { ok: false; error: string; partial?: Partial<ProjectPatterns> };

type BrandOk = { ok: true; data: ProjectBrand };
type BrandErr = { ok: false; error: string; partial?: Partial<ProjectBrand> };

/** Parse a JSON string as ProjectPatterns */
export function parseJsonPatterns(
  source: string,
  projectId: string
): PatternsOk | PatternsErr {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (e) {
    return { ok: false, error: `json_parse_error: ${String(e)}` };
  }

  // Inject projectId if missing
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (!obj['projectId']) obj['projectId'] = projectId;
  }

  const result = ProjectPatternsSchema.safeParse(raw);
  if (result.success) {
    // Cast through unknown to satisfy exactOptionalPropertyTypes — Zod output is structurally
    // correct but types optional fields as `T | undefined` rather than just optional.
    return { ok: true, data: result.data as unknown as ProjectPatterns };
  }

  // Attempt partial parse
  const partialResult = ProjectPatternsPartialSchema.safeParse(raw);
  const partial: Partial<ProjectPatterns> | undefined = partialResult.success
    ? (partialResult.data as unknown as Partial<ProjectPatterns>)
    : undefined;

  if (partial !== undefined) {
    return {
      ok: false,
      error: `validation_error: ${result.error.message}`,
      partial,
    };
  }
  return {
    ok: false,
    error: `validation_error: ${result.error.message}`,
  };
}

/** Parse a JSON string as ProjectBrand */
export function parseJsonBrand(
  source: string,
  projectId: string
): BrandOk | BrandErr {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (e) {
    return { ok: false, error: `json_parse_error: ${String(e)}` };
  }

  // Inject projectId if missing
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (!obj['projectId']) obj['projectId'] = projectId;
  }

  const result = ProjectBrandSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data as unknown as ProjectBrand };
  }

  // Attempt partial parse
  const partialResult = ProjectBrandPartialSchema.safeParse(raw);
  const partial: Partial<ProjectBrand> | undefined = partialResult.success
    ? (partialResult.data as unknown as Partial<ProjectBrand>)
    : undefined;

  if (partial !== undefined) {
    return {
      ok: false,
      error: `validation_error: ${result.error.message}`,
      partial,
    };
  }
  return {
    ok: false,
    error: `validation_error: ${result.error.message}`,
  };
}
