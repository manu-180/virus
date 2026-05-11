// Tipos para el banco de temas de carruseles + contadores de uso por proyecto.
// Lo que devuelve el endpoint GET /api/projects/[id]/topics.

export type CarouselAngle =
  | 'educational'
  | 'contrarian'
  | 'story-arc'
  | 'before-after'
  | 'listicle';

export type CarouselTone =
  | 'direct'
  | 'authoritative'
  | 'casual'
  | 'contrarian';

export type TopicSource = 'seed' | 'user_added' | 'user_edited';

export interface CarouselTopicItem {
  id: string;
  title: string;
  suggestedAngle: CarouselAngle | null;
  suggestedTone: CarouselTone | null;
  source: TopicSource;
  parentTopicId: string | null;
  usageCount: number;
  lastUsedAt: string | null;
}

export interface DimensionUsageMap {
  // value → usageCount (0 omitido del payload, asumir undefined === 0)
  angle: Record<string, number>;
  tone: Record<string, number>;
}

export interface ProjectTopicsResponse {
  projectId: string;
  topics: CarouselTopicItem[];
  usage: DimensionUsageMap;
}
