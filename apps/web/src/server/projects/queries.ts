import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { ProjectBrand, ProjectFull, ProjectListItem, ProjectPatterns } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchProjectsList(userId: string): Promise<ProjectListItem[]> {
  const supabase = createAdminClient();

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, slug, name, theme_color, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!projects || projects.length === 0) return [];

  const items = await Promise.all(
    projects.map(async (project) => {
      const [inQueueResult, lastPublishedResult] = await Promise.all([
        (supabase.from('video_ideas') as any)
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.id)
          .in('status', ['draft', 'approved']),
        (supabase.from('videos') as any)
          .select('published_at')
          .eq('project_id', project.id)
          .not('published_at', 'is', null)
          .order('published_at', { ascending: false })
          .limit(1),
      ]);

      const inQueue: number = inQueueResult.count ?? 0;
      const lastPublished: string | null =
        lastPublishedResult.data?.[0]?.published_at ?? null;

      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        themeColor: project.theme_color,
        inQueue,
        lastPublished,
      } satisfies ProjectListItem;
    }),
  );

  return items;
}

export async function fetchProjectFull(idOrSlug: string, userId: string): Promise<ProjectFull> {
  const supabase = createAdminClient();

  const isUUID = UUID_RE.test(idOrSlug);

  const query = isUUID
    ? supabase.from('projects').select('*').eq('id', idOrSlug).is('deleted_at', null).single()
    : supabase.from('projects').select('*').eq('slug', idOrSlug).is('deleted_at', null).single();

  const { data: project, error: projectError } = await query;

  if (projectError || !project) throw new Error('Project not found');
  if (project.user_id !== userId) throw new Error('Project not found');

  const [filesResult, patternsResult, brandResult, videosResult] = await Promise.all([
    supabase
      .from('project_files')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_patterns')
      .select('*')
      .eq('project_id', project.id)
      .eq('is_current', true)
      .maybeSingle(),
    supabase
      .from('project_brand')
      .select('*')
      .eq('project_id', project.id)
      .eq('is_current', true)
      .maybeSingle(),
    (supabase.from('videos') as any)
      .select('status')
      .eq('project_id', project.id),
  ]);

  const files = filesResult.data ?? [];

  const patternsRow = patternsResult.data ?? null;
  const patterns: ProjectPatterns | null = patternsRow
    ? ({
        projectId: project.id,
        hooks: (patternsRow.hooks as unknown as ProjectPatterns['hooks']) ?? [],
        formats: (patternsRow.formats as unknown as ProjectPatterns['formats']) ?? [],
        topics: [],
        pacing: (patternsRow.pacing as unknown as ProjectPatterns['pacing']) ?? ({} as ProjectPatterns['pacing']),
        visualElements: (patternsRow.visual_elements as unknown as ProjectPatterns['visualElements']) ?? [],
        ctaTemplates: (patternsRow.cta_templates as unknown as ProjectPatterns['ctaTemplates']) ?? [],
        hashtags: (patternsRow.hashtags as unknown as ProjectPatterns['hashtags']) ?? ({} as ProjectPatterns['hashtags']),
        captionTemplates: {} as ProjectPatterns['captionTemplates'],
        language: project.language,
        parsedAt: patternsRow.parsed_at,
      } as unknown as ProjectPatterns)
    : null;

  const brandRow = brandResult.data ?? null;
  const brand: ProjectBrand | null = brandRow
    ? ({
        projectId: project.id,
        brandName: brandRow.brand_name ?? '',
        oneLiner: brandRow.one_liner ?? '',
        audience: (brandRow.audience as unknown as ProjectBrand['audience']) ?? { who: '', where: '', pains: [] },
        valueProps: (brandRow.value_props as unknown as ProjectBrand['valueProps']) ?? [],
        features: (brandRow.features as unknown as ProjectBrand['features']) ?? [],
        caseStudies: (brandRow.case_studies as unknown as ProjectBrand['caseStudies']) ?? [],
        voiceTone: brandRow.voice_tone ?? '',
        ctas: (brandRow.ctas as unknown as ProjectBrand['ctas']) ?? [],
        doNotSay: (brandRow.do_not_say as unknown as ProjectBrand['doNotSay']) ?? [],
        parsedAt: brandRow.parsed_at,
      } as unknown as ProjectBrand)
    : null;

  const videoRows: Array<{ status: string }> = videosResult.data ?? [];
  const pipelineCount: Record<string, number> = {};
  for (const row of videoRows) {
    pipelineCount[row.status] = (pipelineCount[row.status] ?? 0) + 1;
  }

  return {
    ...project,
    patterns,
    brand,
    files,
    pipelineCount,
  };
}
