'use server';

import { z } from 'zod';
import type { Json } from '@virus/db';
import type { Project, ProjectFull, ProjectListItem } from './types';
import { CreateProjectSchema, UpdateProjectSchema } from '@/lib/zod/project-schemas';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchProjectsList, fetchProjectFull } from './queries';
import { SEED_APEX_DEV } from '@virus/shared/viral/seeds';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string } };
type Result<T> = Ok<T> | Err;

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

export async function createProject(
  input: z.infer<typeof CreateProjectSchema>,
): Promise<Result<Project>> {
  try {
    const user = await getUser();

    const parsed = CreateProjectSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('projects')
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description ?? null,
        niche: parsed.data.niche,
        language: parsed.data.language,
        voice_clone_id: parsed.data.voiceCloneId ?? null,
        theme_color: parsed.data.themeColor,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          ok: false,
          error: { code: 'SLUG_TAKEN', message: 'Slug already in use' },
        };
      }
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: data as Project };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// updateProject
// ---------------------------------------------------------------------------

export async function updateProject(
  id: string,
  input: z.infer<typeof UpdateProjectSchema>,
): Promise<Result<Project>> {
  try {
    const user = await getUser();

    const admin = createAdminClient();

    // Verify ownership
    const { data: existing, error: fetchError } = await admin
      .from('projects')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
    }
    if (existing.user_id !== user.id) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const parsed = UpdateProjectSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      };
    }

    const update: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.slug !== undefined) update.slug = parsed.data.slug;
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.niche !== undefined) update.niche = parsed.data.niche;
    if (parsed.data.language !== undefined) update.language = parsed.data.language;
    if (parsed.data.themeColor !== undefined) update.theme_color = parsed.data.themeColor;
    if (parsed.data.voiceCloneId !== undefined) update.voice_clone_id = parsed.data.voiceCloneId;

    if (Object.keys(update).length === 0) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } };
    }

    const { data, error } = await admin
      .from('projects')
      .update(update as never)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          ok: false,
          error: { code: 'SLUG_TAKEN', message: 'Slug already in use' },
        };
      }
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { ok: true, data: data as Project };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// archiveProject
// ---------------------------------------------------------------------------

export async function archiveProject(id: string): Promise<Result<undefined>> {
  try {
    const user = await getUser();

    const admin = createAdminClient();

    // Verify ownership
    const { data: existing, error: fetchError } = await admin
      .from('projects')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
    }
    if (existing.user_id !== user.id) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const { error, count } = await admin
      .from('projects')
      .update({ status: 'archived' }, { count: 'exact' })
      .eq('id', id)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error.message } };
    }
    if (!count) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found or already archived' } };
    }

    return { ok: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// listProjects
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<Result<ProjectListItem[]>> {
  try {
    const user = await getUser();
    const items = await fetchProjectsList(user.id);
    return { ok: true, data: items };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// getProject
// ---------------------------------------------------------------------------

export async function getProject(id: string): Promise<Result<ProjectFull>> {
  try {
    const user = await getUser();
    const full = await fetchProjectFull(id, user.id);
    return { ok: true, data: full };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// getProjectBySlug
// ---------------------------------------------------------------------------

export async function getProjectBySlug(slug: string): Promise<Result<ProjectFull>> {
  try {
    const user = await getUser();
    const full = await fetchProjectFull(slug, user.id);
    return { ok: true, data: full };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}

// ---------------------------------------------------------------------------
// ensureDefaultProject
// ---------------------------------------------------------------------------

export async function ensureDefaultProject(): Promise<Result<Project>> {
  try {
    const user = await getUser();
    const admin = createAdminClient();

    // 1. Check for existing apex-dev project
    const { data: apexDev } = await admin
      .from('projects')
      .select()
      .eq('user_id', user.id)
      .eq('slug', 'apex-dev')
      .maybeSingle();

    if (apexDev) {
      return { ok: true, data: apexDev as Project };
    }

    // 2. Check if user has ANY active project
    const { data: anyProject } = await admin
      .from('projects')
      .select()
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (anyProject) {
      return { ok: true, data: anyProject as Project };
    }

    // 3. No projects at all — seed from SEED_APEX_DEV
    const { data: newProject, error: projectError } = await admin
      .from('projects')
      .insert({
        user_id: user.id,
        slug: SEED_APEX_DEV.slug,
        name: SEED_APEX_DEV.name,
        niche: SEED_APEX_DEV.niche,
        language: SEED_APEX_DEV.language,
        theme_color: SEED_APEX_DEV.themeColor,
        status: 'active',
        metadata: {},
      })
      .select()
      .single();

    if (projectError || !newProject) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: projectError?.message ?? 'Failed to create default project',
        },
      };
    }

    // 4. Insert viral_patterns file
    const { data: patternsFile, error: patternsFileError } = await admin
      .from('project_files')
      .insert({
        project_id: newProject.id,
        kind: 'viral_patterns',
        version: 1,
        storage_path: 'seed:apex-dev/patterns.json',
        mime_type: 'application/json',
        parse_status: 'ok',
      })
      .select()
      .single();

    if (patternsFileError || !patternsFile) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: patternsFileError?.message ?? 'Failed to insert patterns file',
        },
      };
    }

    // 5. Insert project_info file
    const { data: brandFile, error: brandFileError } = await admin
      .from('project_files')
      .insert({
        project_id: newProject.id,
        kind: 'project_info',
        version: 1,
        storage_path: 'seed:apex-dev/brand.json',
        mime_type: 'application/json',
        parse_status: 'ok',
      })
      .select()
      .single();

    if (brandFileError || !brandFile) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: brandFileError?.message ?? 'Failed to insert brand file',
        },
      };
    }

    // 6. Insert project_patterns
    // Cast typed structs through `unknown` because Postgres jsonb columns are
    // typed as `Json` (a recursive union) which isn't structurally compatible
    // with our app-level interfaces.
    const { error: patternsError } = await admin.from('project_patterns').insert({
      project_id: newProject.id,
      source_file_id: patternsFile.id,
      hooks: SEED_APEX_DEV.patterns.hooks as unknown as Json,
      formats: SEED_APEX_DEV.patterns.formats as unknown as Json,
      pacing: SEED_APEX_DEV.patterns.pacing as unknown as Json,
      visual_elements: SEED_APEX_DEV.patterns.visualElements as unknown as Json,
      cta_templates: SEED_APEX_DEV.patterns.ctaTemplates as unknown as Json,
      hashtags: SEED_APEX_DEV.patterns.hashtags as unknown as Json,
      raw: SEED_APEX_DEV.patterns as unknown as Json,
      is_current: true,
    });

    if (patternsError) {
      return { ok: false, error: { code: 'DB_ERROR', message: patternsError.message } };
    }

    // 7. Insert project_brand
    const { error: brandError } = await admin.from('project_brand').insert({
      project_id: newProject.id,
      source_file_id: brandFile.id,
      brand_name: SEED_APEX_DEV.brand.brandName,
      one_liner: SEED_APEX_DEV.brand.oneLiner,
      audience: SEED_APEX_DEV.brand.audience as unknown as Json,
      value_props: SEED_APEX_DEV.brand.valueProps as unknown as Json,
      features: SEED_APEX_DEV.brand.features as unknown as Json,
      case_studies: SEED_APEX_DEV.brand.caseStudies as unknown as Json,
      voice_tone: SEED_APEX_DEV.brand.voiceTone,
      ctas: SEED_APEX_DEV.brand.ctas as unknown as Json,
      do_not_say: SEED_APEX_DEV.brand.doNotSay as unknown as Json,
      raw: SEED_APEX_DEV.brand as unknown as Json,
      is_current: true,
    });

    if (brandError) {
      return { ok: false, error: { code: 'DB_ERROR', message: brandError.message } };
    }

    return { ok: true, data: newProject as Project };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: { code: 'UNKNOWN', message } };
  }
}
