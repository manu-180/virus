import type { ContentSignature, RecentSignature } from '../types.js';

interface AntiRepeatConfig {
  hookWindowDays?: number;   // default 14
  topicWindowDays?: number;  // default 7
  angleWindowDays?: number;  // default 21
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns true if the candidate signature passes the anti-repeat filter
 * (i.e., none of the hashes have been used within their respective time windows).
 */
export function passesAntiRepeat(
  candidate: ContentSignature,
  recentSignatures: RecentSignature[],
  config?: AntiRepeatConfig
): boolean {
  const hookWindowDays = config?.hookWindowDays ?? 14;
  const topicWindowDays = config?.topicWindowDays ?? 7;
  const angleWindowDays = config?.angleWindowDays ?? 21;

  const now = Date.now();

  for (const sig of recentSignatures) {
    const usedAtMs = new Date(sig.usedAt).getTime();
    if (Number.isNaN(usedAtMs)) continue;

    // Check hook window
    if (
      sig.hookHash === candidate.hookHash &&
      now - usedAtMs < hookWindowDays * MS_PER_DAY
    ) {
      return false;
    }

    // Check topic window
    if (
      sig.topicHash === candidate.topicHash &&
      now - usedAtMs < topicWindowDays * MS_PER_DAY
    ) {
      return false;
    }

    // Check angle window
    if (
      sig.angleHash === candidate.angleHash &&
      now - usedAtMs < angleWindowDays * MS_PER_DAY
    ) {
      return false;
    }
  }

  return true;
}
