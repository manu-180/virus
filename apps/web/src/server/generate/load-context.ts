import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@virus/db';
import type { ProjectPatterns, ProjectBrand } from '@virus/shared/viral';

export interface RecentSignature {
  hookHash: string;
  topicHash: string;
  angleHash: string;
  hookText: string;
  topicName: string;
  format: string;
  usedAt: string;
}

export interface GenerationContext {
  project: Tables<'projects'>;
  patterns: ProjectPatterns | null;
  brand: ProjectBrand | null;
  recentSignatures: RecentSignature[];
  voiceCloneId: string | null;
  themeColor: string | null;
}

export async function loadGenerationContext(projectId: string): Promise<GenerationContext> {
  const supabase = createAdminClient();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .is('deleted_at', null)
    .single();

  if (projectError || !project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const [patternsResult, brandResult, signaturesResult, profileResult] = await Promise.all([
    supabase
      .from('project_patterns')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .maybeSingle(),
    supabase
      .from('project_brand')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .maybeSingle(),
    supabase
      .from('project_used_signatures')
      .select('*')
      .eq('project_id', projectId)
      .gt('used_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('used_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('default_voice_clone_id')
      .eq('id', project.user_id)
      .maybeSingle(),
  ]);

  const patternsRow = patternsResult.data ?? null;
  const patterns: ProjectPatterns | null = patternsRow
    ? ({
        projectId: project.id,
        hooks: (patternsRow.hooks as unknown as ProjectPatterns['hooks']) ?? [],
        formats: (patternsRow.formats as unknown as ProjectPatterns['formats']) ?? [],
        topics: [],
        pacing:
          (patternsRow.pacing as unknown as ProjectPatterns['pacing']) ??
          ({} as ProjectPatterns['pacing']),
        visualElements:
          (patternsRow.visual_elements as unknown as ProjectPatterns['visualElements']) ?? [],
        ctaTemplates: (patternsRow.cta_templates as string[]) ?? [],
        hashtags:
          (patternsRow.hashtags as unknown as ProjectPatterns['hashtags']) ??
          ({} as ProjectPatterns['hashtags']),
        captionTemplates: {} as ProjectPatterns['captionTemplates'],
        language: project.language ?? 'es',
        parsedAt: patternsRow.parsed_at ?? new Date().toISOString(),
      } as unknown as ProjectPatterns)
    : null;

  const brandRow = brandResult.data ?? null;
  const brand: ProjectBrand | null = brandRow
    ? ({
        projectId: project.id,
        brandName: brandRow.brand_name ?? '',
        oneLiner: brandRow.one_liner ?? '',
        audience:
          (brandRow.audience as unknown as ProjectBrand['audience']) ?? {
            who: '',
            where: '',
            pains: [],
          },
        valueProps: (brandRow.value_props as unknown as ProjectBrand['valueProps']) ?? [],
        features: (brandRow.features as unknown as ProjectBrand['features']) ?? [],
        caseStudies: (brandRow.case_studies as unknown as ProjectBrand['caseStudies']) ?? [],
        voiceTone: brandRow.voice_tone ?? '',
        ctas: (brandRow.ctas as unknown as ProjectBrand['ctas']) ?? [],
        doNotSay: (brandRow.do_not_say as string[]) ?? [],
        parsedAt: brandRow.parsed_at ?? new Date().toISOString(),
      } as unknown as ProjectBrand)
    : null;

  const signatureRows = signaturesResult.data ?? [];
  const recentSignatures: RecentSignature[] = signatureRows.map((row) => ({
    hookHash: row.hook_hash as string,
    topicHash: row.topic_hash as string,
    angleHash: row.angle_hash as string,
    hookText: row.hook_text as string,
    topicName: row.topic_name as string,
    format: row.format as string,
    usedAt: row.used_at as string,
  }));

  const profileRow = profileResult.data ?? null;
  const voiceCloneId: string | null =
    (profileRow?.default_voice_clone_id as string | null) ?? null;

  return {
    project: project as Tables<'projects'>,
    patterns,
    brand,
    recentSignatures,
    voiceCloneId,
    themeColor: (project.theme_color as string | null) ?? null,
  };
}
