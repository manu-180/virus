export interface AntiRepeatPolicy {
  hashWindowDays: { hook: number; topic: number; angle: number };
  similarityWindowDays: number;
  similarityThreshold: number;
  maxAttempts: number;
  fallback: 'force' | 'fail';
}

export const DEFAULT_POLICY: AntiRepeatPolicy = {
  hashWindowDays: { hook: 14, topic: 7, angle: 21 },
  similarityWindowDays: 30,
  similarityThreshold: 0.85,
  maxAttempts: 3,
  fallback: 'force',
};

interface ProjectWithMetadata {
  metadata?: Record<string, unknown> | null;
}

export function getProjectPolicy(project: ProjectWithMetadata): AntiRepeatPolicy {
  const override = (project.metadata?.anti_repeat_policy ?? {}) as Partial<AntiRepeatPolicy>;
  return { ...DEFAULT_POLICY, ...override };
}
