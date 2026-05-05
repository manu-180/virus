import type { HashtagSet, HookPlatform } from '../types.js';

/**
 * Build a caption string from a template with {hook}, {value}, {cta} placeholders.
 * @param template - Template string like "{hook}\n{value}\n{cta}"
 * @param data - Values for each placeholder
 * @param hashtags - Array of hashtag strings to append
 */
export function buildCaption(
  template: string,
  data: { hook: string; value: string; cta: string },
  hashtags: string[]
): string {
  const body = template
    .replace(/\{hook\}/g, () => data.hook)
    .replace(/\{value\}/g, () => data.value)
    .replace(/\{cta\}/g, () => data.cta);

  if (hashtags.length === 0) {
    return body;
  }

  return `${body}\n${hashtags.join(' ')}`;
}

/**
 * Select N hashtags from the platform-specific set.
 */
export function pickHashtags(
  set: HashtagSet,
  platform: HookPlatform,
  count: number
): string[] {
  const available = set[platform] ?? [];
  return available.slice(0, count);
}
