import type {
  SuggestInput,
  SuggestOutput,
  ParsedHook,
  ParsedTopic,
  ParsedFormat,
  VideoSegment,
} from '../types.js';
import { hashHook, hashTopic, hashAngle } from './hashing.js';
import { passesAntiRepeat } from './anti-repeat.js';

// ---------------------------------------------------------------------------
// Engagement weight map
// ---------------------------------------------------------------------------

const ENGAGEMENT_WEIGHT: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 4,
  viral: 8,
};

// ---------------------------------------------------------------------------
// buildStructure — generate VideoSegment[] from format + duration
// ---------------------------------------------------------------------------

function buildStructure(format: ParsedFormat): VideoSegment[] {
  // If format provides named structure segments, map them to generic time slots
  const totalSec = format.optimalDurationSec.min;
  const segments = format.structureSegments;

  if (segments.length > 0) {
    // Distribute segments evenly across total duration
    const segmentDuration = totalSec / segments.length;
    return segments.map((seg, i) => {
      const start = Math.round(i * segmentDuration);
      const end = Math.round((i + 1) * segmentDuration);
      const role = inferRole(seg, i, segments.length);
      return {
        startSec: start,
        endSec: end,
        role,
        description: seg,
      };
    });
  }

  // Generic structure based on duration
  return buildGenericStructure(totalSec);
}

function inferRole(
  segment: string,
  index: number,
  total: number
): VideoSegment['role'] {
  const lower = segment.toLowerCase();
  if (lower.includes('hook') || index === 0) return 'hook';
  if (lower.includes('setup') || lower.includes('intro')) return 'setup';
  if (lower.includes('cta') || lower.includes('call') || index === total - 1) return 'cta';
  if (lower.includes('reveal') || lower.includes('payoff')) return 'reveal';
  if (lower.includes('mini') || lower.includes('checkpoint')) return 'mini_payoff';
  return 'development';
}

function buildGenericStructure(totalSec: number): VideoSegment[] {
  const result: VideoSegment[] = [];

  // hook: 0-3s
  result.push({ startSec: 0, endSec: 3, role: 'hook', description: 'Hook' });

  // setup: 3-8s (guarded for very short videos)
  const setupEnd = Math.min(8, totalSec - 2);
  result.push({ startSec: 3, endSec: setupEnd, role: 'setup', description: 'Setup' });

  if (totalSec > 35) {
    // development: 8-25s
    result.push({ startSec: 8, endSec: 25, role: 'development', description: 'Development' });
    // mini_payoff: 25-35s
    result.push({ startSec: 25, endSec: 35, role: 'mini_payoff', description: 'Mini payoff' });
    // reveal: last 10s before CTA
    const revealStart = Math.max(35, totalSec - 15);
    const revealEnd = totalSec - 5;
    if (revealEnd > revealStart) {
      result.push({
        startSec: revealStart,
        endSec: revealEnd,
        role: 'reveal',
        description: 'Reveal / payoff',
      });
    }
  } else {
    // development: 8 to (totalSec - 5)
    const devEnd = Math.max(8, totalSec - 5);
    result.push({
      startSec: 8,
      endSec: devEnd,
      role: 'development',
      description: 'Development',
    });
  }

  // cta: last 5s
  result.push({
    startSec: Math.max(0, totalSec - 5),
    endSec: totalSec,
    role: 'cta',
    description: 'CTA',
  });

  return result;
}

// ---------------------------------------------------------------------------
// suggest
// ---------------------------------------------------------------------------

/**
 * Suggest the best hook + topic + format combination for the next video.
 * Returns SuggestOutput or throws { code: 'no_candidates', message: string } if all are filtered.
 */
export async function suggest(input: SuggestInput): Promise<SuggestOutput> {
  const { patterns, recentSignatures, preferredFormats, pillarHint } = input;

  // ------------------------------------------------------------------
  // 1. Filter hooks by anti-repeat (hookHash only check)
  // ------------------------------------------------------------------
  const hookSignatures = recentSignatures.map((s) => ({ ...s, topicHash: '', angleHash: '' }));
  const hookHashes = await Promise.all(patterns.hooks.map((hook) => hashHook(hook.text)));
  const filteredHooks: ParsedHook[] = patterns.hooks.filter((_hook, i) =>
    passesAntiRepeat(
      { hookHash: hookHashes[i]!, topicHash: '', angleHash: '' },
      hookSignatures
    )
  );

  // ------------------------------------------------------------------
  // 2. Filter topics by anti-repeat (topicHash only check)
  // ------------------------------------------------------------------
  const topicSignatures = recentSignatures.map((s) => ({ ...s, hookHash: '', angleHash: '' }));
  const topicHashes = await Promise.all(patterns.topics.map((topic) => hashTopic(topic.name)));
  const filteredTopics: ParsedTopic[] = patterns.topics.filter((_topic, i) =>
    passesAntiRepeat(
      { hookHash: '', topicHash: topicHashes[i]!, angleHash: '' },
      topicSignatures
    )
  );

  // ------------------------------------------------------------------
  // 3. Guard — no candidates
  // ------------------------------------------------------------------
  if (filteredHooks.length === 0 || filteredTopics.length === 0) {
    throw {
      code: 'no_candidates',
      message:
        'All hooks/topics filtered by anti-repeat. Try again tomorrow or expand windows.',
    };
  }

  // ------------------------------------------------------------------
  // 4. Score and pick best hook
  // ------------------------------------------------------------------
  const scoredHooks = filteredHooks.map((hook) => ({
    hook,
    score: ENGAGEMENT_WEIGHT[hook.estimatedEngagement] ?? 1,
  }));

  const maxHookScore = Math.max(...scoredHooks.map((h) => h.score));
  const topHooks = scoredHooks.filter((h) => h.score === maxHookScore);
  // Break ties randomly
  const chosenHookEntry = topHooks[Math.floor(Math.random() * topHooks.length)];
  // noUncheckedIndexedAccess: topHooks is guaranteed non-empty (filteredHooks.length > 0)
  const chosenHook = (chosenHookEntry ?? scoredHooks[0])!.hook;

  // ------------------------------------------------------------------
  // 5. Score and pick best topic
  // ------------------------------------------------------------------
  const scoredTopics = filteredTopics.map((topic) => {
    // Lower difficulty = higher score: 6 - difficulty gives 1..5 range
    let score = 6 - topic.productionDifficulty;
    // Prefer topics matching the pillar hint
    if (pillarHint && topic.category.toLowerCase().includes(pillarHint.toLowerCase())) {
      score *= 2;
    }
    return { topic, score };
  });

  const maxTopicScore = Math.max(...scoredTopics.map((t) => t.score));
  const topTopics = scoredTopics.filter((t) => t.score === maxTopicScore);
  const chosenTopicEntry = topTopics[Math.floor(Math.random() * topTopics.length)];
  const chosenTopic = (chosenTopicEntry ?? scoredTopics[0])!.topic;

  // ------------------------------------------------------------------
  // 6. Select format
  // ------------------------------------------------------------------
  let chosenFormat: ParsedFormat | undefined;

  if (preferredFormats !== undefined && preferredFormats.length > 0) {
    for (const preferred of preferredFormats) {
      const found = patterns.formats.find((f) => f.id === preferred || f.name === preferred);
      if (found) {
        chosenFormat = found;
        break;
      }
    }
  }

  if (!chosenFormat) {
    // Pick format whose bestPlatforms overlaps with chosen hook's bestPlatforms
    chosenFormat = patterns.formats.find((f) =>
      f.bestPlatforms.some((p) => chosenHook.bestPlatforms.includes(p))
    );
  }

  if (!chosenFormat) {
    // Fallback: first format available
    chosenFormat = patterns.formats[0];
  }

  if (!chosenFormat) {
    throw {
      code: 'no_candidates',
      message: 'No formats available in patterns.',
    };
  }

  // ------------------------------------------------------------------
  // 7. Build structure
  // ------------------------------------------------------------------
  const structure: VideoSegment[] = buildStructure(chosenFormat);

  // ------------------------------------------------------------------
  // 8. Compute signatures
  // ------------------------------------------------------------------
  const [hookHash, topicHash, angleHash] = await Promise.all([
    hashHook(chosenHook.text),
    hashTopic(chosenTopic.name),
    hashAngle(chosenHook.text, chosenTopic.name),
  ]);

  // ------------------------------------------------------------------
  // 9. Build rationale
  // ------------------------------------------------------------------
  const rationale =
    `Selected hook type '${chosenHook.type}' (${chosenHook.estimatedEngagement} engagement) ` +
    `+ topic '${chosenTopic.name}' (difficulty ${chosenTopic.productionDifficulty}, ` +
    `dominant emotion: ${chosenTopic.dominantEmotion}). ` +
    `Format: ${chosenFormat.name}.`;

  // ------------------------------------------------------------------
  // 10. Return SuggestOutput
  // ------------------------------------------------------------------
  return {
    hook: chosenHook,
    topic: chosenTopic,
    format: chosenFormat,
    structure,
    signature: { hookHash, topicHash, angleHash },
    rationale,
  };
}
