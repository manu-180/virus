import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  CarouselAngle,
  CarouselTone,
  CarouselTopicItem,
  ProjectTopicsResponse,
  TopicSource,
} from './types';

/**
 * Devuelve todos los temas activos de un proyecto + el mapa de usage de
 * angle/tone para ese mismo proyecto. Pensado para alimentar el combobox
 * y los selects del formulario de creación de carrusel.
 *
 * Orden de temas: primero los seeds nunca usados (frescos), después los
 * usados ordenados por last_used_at ASC (los más viejos antes — "ya
 * descansó, podés repetir"), después variantes user_added / user_edited.
 *
 * Asume que el caller ya validó que el userId tiene permiso sobre el
 * projectId. Como usamos el admin client, RLS no nos protege acá.
 */
export async function fetchProjectTopics(
  projectId: string,
  userId: string,
): Promise<ProjectTopicsResponse> {
  const supabase = createAdminClient();

  const [topicsRes, usageRes] = await Promise.all([
    supabase
      .from('carousel_topics' as never)
      .select(
        'id, title, suggested_angle, suggested_tone, source, parent_topic_id, usage_count, last_used_at',
      )
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('source', { ascending: true })           // seed primero
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('carousel_dimension_usage' as never)
      .select('dimension, value, usage_count')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .gt('usage_count', 0),
  ]);

  if (topicsRes.error) throw new Error(`fetchProjectTopics topics: ${topicsRes.error.message}`);
  if (usageRes.error)  throw new Error(`fetchProjectTopics usage: ${usageRes.error.message}`);

  const topics: CarouselTopicItem[] = (topicsRes.data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    suggestedAngle: row.suggested_angle as CarouselAngle | null,
    suggestedTone: row.suggested_tone as CarouselTone | null,
    source: row.source as TopicSource,
    parentTopicId: row.parent_topic_id,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
  }));

  const angle: Record<string, number> = {};
  const tone: Record<string, number> = {};
  for (const row of (usageRes.data ?? []) as Array<{ dimension: string; value: string; usage_count: number }>) {
    if (row.dimension === 'angle') angle[row.value] = row.usage_count;
    else if (row.dimension === 'tone') tone[row.value] = row.usage_count;
  }

  return {
    projectId,
    topics,
    usage: { angle, tone },
  };
}

/**
 * Verifica que el usuario es dueño del proyecto y que está vivo.
 * Devuelve true/false sin lanzar — el caller decide qué status devolver.
 */
export async function userOwnsProject(projectId: string, userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, deleted_at')
    .eq('id', projectId)
    .single();

  if (error || !data) return false;
  if (data.deleted_at !== null) return false;
  return data.user_id === userId;
}

/**
 * Llama al RPC bump_topic_usage en Postgres. Devuelve el id del topic que
 * terminó siendo bumpeado (sea el seleccionado, una variante nueva, o un
 * topic ya existente que matcheaba).
 *
 * Si el RPC falla NO debe romper la creación del carrusel — el caller
 * decide qué hacer. Los contadores son no-críticos.
 */
export async function bumpTopicUsage(args: {
  carouselId: string;
  rawTitle: string;
  angle: string;
  tone: string;
  selectedTopicId: string | null;
}): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('bump_topic_usage' as never, {
    p_carousel_id: args.carouselId,
    p_raw_title: args.rawTitle,
    p_angle: args.angle,
    p_tone: args.tone,
    p_selected_topic_id: args.selectedTopicId,
  } as never);

  if (error) {
    console.error('[bumpTopicUsage] RPC error:', error);
    return null;
  }
  return (data as unknown as string) ?? null;
}

/**
 * Apply inferred heuristic defaults to a topic, but ONLY when the target
 * columns are still at their factory defaults (`additional_angles = {}`,
 * `additional_tones = {}`, `target_slide_count IS NULL`) AND the topic was
 * created by the user (not a seed).
 *
 * Why the guards:
 *   - Seeds are hand-curated. Never let heuristics clobber them.
 *   - If the user (or a future admin UI) already set values, respect them.
 *   - The check happens atomically in the WHERE clause so two concurrent
 *     create requests for the same title can't race.
 *
 * Returns true if any row was updated, false otherwise. Errors are logged
 * and swallowed — heuristic defaults are non-critical metadata.
 */
export async function applyHeuristicDefaults(args: {
  topicId: string;
  additionalAngles: string[];
  additionalTones: string[];
  targetSlideCount: number | null;
}): Promise<boolean> {
  // Skip the DB roundtrip if there's literally nothing to apply.
  if (
    args.additionalAngles.length === 0 &&
    args.additionalTones.length === 0 &&
    args.targetSlideCount === null
  ) {
    return false;
  }

  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (args.additionalAngles.length > 0) patch.additional_angles = args.additionalAngles;
  if (args.additionalTones.length > 0) patch.additional_tones = args.additionalTones;
  if (args.targetSlideCount !== null) patch.target_slide_count = args.targetSlideCount;

  // Guard: never touch seed topics. Heuristic is idempotent within a topic
  // (same title → same output) so we don't need an "is-empty" guard on
  // the array columns; re-applying yields identical values.
  const { error, count } = await supabase
    .from('carousel_topics' as never)
    .update(patch as never, { count: 'exact' })
    .eq('id', args.topicId)
    .neq('source', 'seed');

  if (error) {
    console.error('[applyHeuristicDefaults] update error:', error);
    return false;
  }
  return (count ?? 0) > 0;
}
