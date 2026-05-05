import Anthropic from '@anthropic-ai/sdk';
import type { RecentSignature } from './anti-repeat-query.js';

interface SimilarityMatch {
  recent: RecentSignature;
  similarity: number;
  reason: string;
}

interface ClaudeResponseItem {
  index: number;
  similarity: number;
  reason: string;
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

/** Test-only override. Pass `null` to restore the real client. */
export function __setAnthropicClientForSimilarityTests(client: Anthropic | null): void {
  _client = client;
}

export async function findSemanticDuplicates(input: {
  candidate: { hook: string; topic: string };
  recent: RecentSignature[];
  threshold?: number;
}): Promise<{ isDuplicate: boolean; matches: SimilarityMatch[] }> {
  const threshold = input.threshold ?? 0.85;

  if (input.recent.length === 0) {
    return { isDuplicate: false, matches: [] };
  }

  const recentWithText = input.recent.filter((r) => r.hookText !== '');
  if (recentWithText.length === 0) {
    return { isDuplicate: false, matches: [] };
  }

  const recentListText = recentWithText
    .map((r, i) => `[${i}] "${r.hookText}"`)
    .join('\n');

  const systemText =
    `You compare a candidate video hook against a list of recently used hooks to detect semantic duplicates.\n\n` +
    `Recent hooks:\n${recentListText}\n\n` +
    `For each recent hook, output a JSON array where each element has:\n` +
    `- index: the [N] number from the list above\n` +
    `- similarity: a float 0.0–1.0 (1.0 = identical meaning)\n` +
    `- reason: a short phrase explaining the score\n\n` +
    `Output ONLY the JSON array. No commentary, no markdown fences.`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: systemText,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Candidate hook: "${input.candidate.hook}"`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;

    if (!textBlock?.text) {
      return { isDuplicate: false, matches: [] };
    }

    let raw = textBlock.text.trim();
    const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw);
    if (fenceMatch?.[1]) {
      raw = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(raw) as ClaudeResponseItem[];

    const matches: SimilarityMatch[] = parsed
      .filter((item) => item.index >= 0 && item.index < recentWithText.length)
      .map((item) => ({
        recent: recentWithText[item.index]!,
        similarity: item.similarity,
        reason: item.reason,
      }));

    const isDuplicate = matches.some((m) => m.similarity >= threshold);

    return { isDuplicate, matches };
  } catch {
    console.warn('[anti-repeat-similarity] Claude call failed — skipping semantic check');
    return { isDuplicate: false, matches: [] };
  }
}
