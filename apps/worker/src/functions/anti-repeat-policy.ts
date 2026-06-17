import type { AntiRepeatPolicy } from '@virus/shared/viral';
export type { AntiRepeatPolicy };
export { DEFAULT_POLICY, getProjectPolicy } from '@virus/shared/viral';

import type { SuggestOutput, ProjectPatterns, ProjectBrand } from '@virus/shared/viral';
import { suggest } from '@virus/shared/viral';
import { getRecentSignatures, type RecentSignature } from './anti-repeat-query.js';
import { findSemanticDuplicates } from './anti-repeat-similarity.js';

export interface SuggestWithAntiRepeatInput {
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  projectId: string;
  policy: AntiRepeatPolicy;
}

export async function suggestWithAntiRepeat(
  input: SuggestWithAntiRepeatInput,
): Promise<SuggestOutput | { ok: false; error: 'no_candidates' }> {
  const { patterns, brand, projectId, policy } = input;

  let recent: RecentSignature[];
  try {
    recent = await getRecentSignatures({
      projectId,
      windowDays: policy.similarityWindowDays,
    });
  } catch {
    recent = [];
  }

  const recentForSuggest = recent.map((r) => ({
    hookHash: r.hookHash,
    topicHash: r.topicHash,
    angleHash: r.angleHash,
    usedAt: r.usedAt,
  }));

  let lastCandidate: SuggestOutput | null = null;

  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    let candidate: SuggestOutput;
    try {
      candidate = await suggest({ patterns, brand, recentSignatures: recentForSuggest });
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === 'no_candidates') {
        break;
      }
      throw err;
    }

    lastCandidate = candidate;

    const { isDuplicate } = await findSemanticDuplicates({
      candidate: { hook: candidate.hook.text, topic: candidate.topic.name },
      recent,
      threshold: policy.similarityThreshold,
    });

    if (!isDuplicate) {
      return candidate;
    }
  }

  if (policy.fallback === 'force') {
    if (lastCandidate) {
      return lastCandidate;
    }
    try {
      return await suggest({ patterns, brand, recentSignatures: [] });
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === 'no_candidates') {
        return { ok: false, error: 'no_candidates' };
      }
      throw err;
    }
  }

  return { ok: false, error: 'no_candidates' };
}
