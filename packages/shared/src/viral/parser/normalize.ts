import type {
  ParsedHook,
  ParsedFormat,
  ParsedTopic,
  PacingRules,
  HashtagSet,
  HookType,
  HookEngagement,
  HookPlatform,
} from '../types.js';

// ----------- Defaults -----------

export const DEFAULT_PACING: PacingRules = {
  audioSpeedMultiplier: { min: 1.0, max: 1.3 },
  cutEverySec: { min: 2, max: 5 },
  ideaDensitySec: 3,
  musicBpm: { min: 120, max: 150 },
  voiceLufs: -14,
  musicLufs: -20,
  duckingDb: -12,
};

export const ALL_PLATFORMS: HookPlatform[] = ['reels', 'tiktok', 'shorts'];

// ----------- ID generation -----------

/** Slugify a string for use in IDs (no Web Crypto) */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

/** Generate a deterministic ID for an entity */
export function makeId(projectId: string, text: string): string {
  return `${projectId}-${slugify(text.slice(0, 30))}`;
}

// ----------- Hook type detection -----------

const HOOK_TYPE_KEYWORDS: Array<{ keywords: string[]; type: HookType }> = [
  { keywords: ['curiosity', 'mystery', 'secret', 'wonder', 'misterio', 'curioso'], type: 'curiosity_gap' },
  { keywords: ['shame', 'embarrass', 'verguenza', 'vergüenza', 'relief', 'alivio'], type: 'shame_relief' },
  { keywords: ['shock', 'contrarian', 'wrong', 'myth', 'false', 'shocker', 'impacto'], type: 'shock_contrarian' },
  { keywords: ['value', 'tip', 'how to', 'cómo', 'como', 'trick', 'hack', 'learn'], type: 'immediate_value' },
  { keywords: ['fomo', 'miss', 'limited', 'urgent', 'now', 'before', 'perderte'], type: 'fomo' },
  { keywords: ['insider', 'identity', 'only', 'exclusive', 'we', 'us', 'club', 'solo'], type: 'identity_insider' },
  { keywords: ['demo', 'build', 'create', 'show', 'watch', 'speed', 'tutorial'], type: 'speed_build_demo' },
  { keywords: ['story', 'historia', 'when', 'once', 'time', 'happened', 'pasó'], type: 'storytelling' },
];

function detectHookType(text: string): HookType {
  const lower = text.toLowerCase();
  for (const { keywords, type } of HOOK_TYPE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return type;
    }
  }
  return 'immediate_value';
}

const ENGAGEMENT_KEYWORDS: Array<{ keywords: string[]; level: HookEngagement }> = [
  { keywords: ['viral', 'explosive', 'masivo'], level: 'viral' },
  { keywords: ['high', 'alto', 'great', 'best', 'top'], level: 'high' },
  { keywords: ['low', 'bajo', 'minimal', 'slow'], level: 'low' },
];

function detectEngagement(text: string): HookEngagement {
  const lower = text.toLowerCase();
  for (const { keywords, level } of ENGAGEMENT_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return level;
    }
  }
  return 'medium';
}

// ----------- Duration detection -----------

function parseDurationHint(text: string): { min: number; max: number } | null {
  // Match patterns like "(30-60s)", "(30 to 60 seconds)", "(30-60 sec)"
  // Require parentheses + seconds suffix so unrelated ranges like "1-3 of these" don't match.
  const rangeMatch =
    /\((\d+)\s*(?:to|-)\s*(\d+)\s*s(?:ec(?:ond)?s?)?\)/i.exec(text);
  if (rangeMatch?.[1] && rangeMatch[2]) {
    return { min: parseInt(rangeMatch[1], 10), max: parseInt(rangeMatch[2], 10) };
  }
  // Single duration like "60s" or "60 seconds"
  const singleMatch = /(\d+)\s*(?:s(?:ec(?:ond)?s?)?)/i.exec(text);
  if (singleMatch?.[1]) {
    const val = parseInt(singleMatch[1], 10);
    return { min: Math.max(15, val - 15), max: val + 15 };
  }
  return null;
}

// ----------- Emotion detection -----------

const EMOTION_KEYWORDS: Array<{ keywords: string[]; emotion: string }> = [
  { keywords: ['fear', 'miedo', 'scared', 'anxiety', 'ansiedad'], emotion: 'fear' },
  { keywords: ['hope', 'esperanza', 'aspiration', 'dream', 'sueño'], emotion: 'hope' },
  { keywords: ['anger', 'enojo', 'frustrated', 'mad', 'rage'], emotion: 'anger' },
  { keywords: ['joy', 'happy', 'alegre', 'fun', 'laugh', 'risa'], emotion: 'joy' },
  { keywords: ['surprise', 'sorpresa', 'wow', 'unexpected'], emotion: 'surprise' },
  { keywords: ['trust', 'confianza', 'reliable', 'credibility'], emotion: 'trust' },
  { keywords: ['disgust', 'asco', 'gross', 'awful'], emotion: 'disgust' },
  { keywords: ['curiosity', 'curiosidad', 'wonder', 'intrigued'], emotion: 'curiosity' },
];

function detectEmotion(text: string): string {
  const lower = text.toLowerCase();
  for (const { keywords, emotion } of EMOTION_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return emotion;
    }
  }
  return 'curiosity';
}

// ----------- Number parsing helper -----------

function parseNumber(text: string): number | null {
  const match = /(-?\d+(?:\.\d+)?)/.exec(text);
  if (match?.[1]) return parseFloat(match[1]);
  return null;
}

// ----------- Public normalize functions -----------

/**
 * Parse hooks from raw text lines.
 * Each line represents one hook. Extract type from keywords if present,
 * default to 'immediate_value' if not detectable.
 */
export function parseHooksFromLines(
  lines: string[],
  language: string,
  projectId: string
): ParsedHook[] {
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const text = line.trim();
      return {
        id: makeId(projectId, text),
        text,
        type: detectHookType(text),
        estimatedEngagement: detectEngagement(text),
        bestPlatforms: ALL_PLATFORMS,
        exampleTopics: [],
        language,
      } satisfies ParsedHook;
    });
}

/**
 * Parse formats from raw text lines.
 * Detect duration hints like "(30-60s)" or "30 to 60 seconds".
 * Default optimalDurationSec: { min: 30, max: 60 } if not detected.
 */
export function parseFormatsFromLines(lines: string[], projectId: string): ParsedFormat[] {
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const text = line.trim();
      const duration = parseDurationHint(text) ?? { min: 30, max: 60 };
      // Strip duration hint from the name for cleanliness
      const nameRaw = text.replace(/\(.*?\)/, '').trim();
      const name = nameRaw || text;
      return {
        id: makeId(projectId, name),
        name,
        description: text,
        optimalDurationSec: duration,
        bestPlatforms: ALL_PLATFORMS,
        structureSegments: [],
      } satisfies ParsedFormat;
    });
}

/**
 * Parse topics from raw text lines.
 * Detect emotion keywords, default productionDifficulty: 3.
 */
export function parseTopicsFromLines(lines: string[], projectId: string): ParsedTopic[] {
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const text = line.trim();
      // Detect difficulty hint: "difficulty: 2" or "(2)" at end
      let difficulty: 1 | 2 | 3 | 4 | 5 = 3;
      const diffMatch = /(?:difficulty|dificultad)\s*:?\s*([1-5])/i.exec(text);
      const shortDiffMatch = /\(([1-5])\)/.exec(text);
      const rawDiff = diffMatch?.[1] ?? shortDiffMatch?.[1];
      if (rawDiff) {
        const parsed = parseInt(rawDiff, 10) as 1 | 2 | 3 | 4 | 5;
        if (parsed >= 1 && parsed <= 5) {
          difficulty = parsed;
        }
      }
      // Strip metadata from name
      const name = text
        .replace(/\(difficulty:?\s*\d\)/i, '')
        .replace(/difficulty:?\s*\d/i, '')
        .replace(/\(\d\)/, '')
        .trim();

      return {
        id: makeId(projectId, name),
        name,
        category: 'general',
        dominantEmotion: detectEmotion(text),
        productionDifficulty: difficulty,
        relatedHookIds: [],
      } satisfies ParsedTopic;
    });
}

/**
 * Parse pacing rules from raw section text.
 * Default all values if not parseable.
 */
export function parsePacingFromText(text: string): PacingRules {
  if (!text.trim()) return { ...DEFAULT_PACING };

  const result: PacingRules = { ...DEFAULT_PACING };

  // audioSpeedMultiplier
  const speedMatch = /(?:audio\s*speed|speed\s*multiplier|velocidad)[^:]*:\s*([\d.]+)\s*(?:to|-|–)\s*([\d.]+)/i.exec(text);
  if (speedMatch?.[1] && speedMatch[2]) {
    result.audioSpeedMultiplier = {
      min: parseFloat(speedMatch[1]),
      max: parseFloat(speedMatch[2]),
    };
  }

  // cutEverySec
  const cutMatch = /(?:cut\s*every|corte\s*cada)[^:]*:\s*([\d.]+)\s*(?:to|-|–)\s*([\d.]+)/i.exec(text);
  if (cutMatch?.[1] && cutMatch[2]) {
    result.cutEverySec = {
      min: parseFloat(cutMatch[1]),
      max: parseFloat(cutMatch[2]),
    };
  }

  // ideaDensitySec
  const ideaMatch = /(?:idea\s*density|densidad)[^:]*:\s*([\d.]+)/i.exec(text);
  if (ideaMatch?.[1]) {
    result.ideaDensitySec = parseFloat(ideaMatch[1]);
  }

  // musicBpm
  const bpmMatch = /(?:bpm|tempo)[^:]*:\s*([\d.]+)\s*(?:to|-|–)\s*([\d.]+)/i.exec(text);
  if (bpmMatch?.[1] && bpmMatch[2]) {
    result.musicBpm = {
      min: parseFloat(bpmMatch[1]),
      max: parseFloat(bpmMatch[2]),
    };
  }

  // voiceLufs
  const voiceMatch = /(?:voice\s*lufs|voz\s*lufs)[^:]*:\s*(-?[\d.]+)/i.exec(text);
  if (voiceMatch?.[1]) {
    result.voiceLufs = parseFloat(voiceMatch[1]);
  }

  // musicLufs
  const musicMatch = /(?:music\s*lufs|musica\s*lufs|música\s*lufs)[^:]*:\s*(-?[\d.]+)/i.exec(text);
  if (musicMatch?.[1]) {
    result.musicLufs = parseFloat(musicMatch[1]);
  }

  // duckingDb
  const duckMatch = /(?:ducking)[^:]*:\s*(-?[\d.]+)/i.exec(text);
  if (duckMatch?.[1]) {
    result.duckingDb = parseFloat(duckMatch[1]);
  }

  return result;
}

/**
 * Parse hashtags section. Detect reels/tiktok/shorts subsections.
 * If undifferentiated, use same hashtags for all platforms.
 */
export function parseHashtagsFromText(text: string): HashtagSet {
  const defaultSet: HashtagSet = { reels: [], tiktok: [], shorts: [] };
  if (!text.trim()) return defaultSet;

  // Try to find platform-specific subsections
  const reelsMatch = /(?:reels?)[^#\n]*((?:\n\s*[#@]?\w+)+)/i.exec(text);
  const tiktokMatch = /(?:tiktok)[^#\n]*((?:\n\s*[#@]?\w+)+)/i.exec(text);
  const shortsMatch = /(?:shorts?)[^#\n]*((?:\n\s*[#@]?\w+)+)/i.exec(text);

  if (reelsMatch?.[1] || tiktokMatch?.[1] || shortsMatch?.[1]) {
    return {
      reels: extractHashtagList(reelsMatch?.[1] ?? ''),
      tiktok: extractHashtagList(tiktokMatch?.[1] ?? ''),
      shorts: extractHashtagList(shortsMatch?.[1] ?? ''),
    };
  }

  // No subsections — extract all hashtags and use for all platforms
  const allTags = extractHashtagList(text);
  return {
    reels: allTags,
    tiktok: allTags,
    shorts: allTags,
  };
}

/** Extract hashtags from text — handles #tag, tag, or list items */
function extractHashtagList(text: string): string[] {
  const tags: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Match #hashtag tokens
    const hashMatches = [...trimmed.matchAll(/#(\w+)/g)];
    if (hashMatches.length > 0) {
      for (const m of hashMatches) {
        if (m[1]) tags.push(`#${m[1]}`);
      }
    } else {
      // Treat list items or plain words as hashtags — but only if it's a single
      // alphanumeric word. Multi-word lines without a leading "#" are skipped.
      const listMatch = /^[-*+\d.)]\s*(.+)/.exec(trimmed);
      const candidate = (listMatch?.[1]?.trim() ?? trimmed).trim();
      if (!candidate) continue;
      if (candidate.startsWith('#')) {
        tags.push(candidate);
      } else if (/^\w+$/.test(candidate)) {
        tags.push(`#${candidate}`);
      }
      // else: skip multi-word lines without #
    }
  }
  return [...new Set(tags)]; // deduplicate
}

/**
 * Parse captions section into template strings with {hook}, {value}, {cta} placeholders.
 */
export function parseCaptionsFromText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text.trim()) return result;

  const lines = text.split('\n');
  let currentKey: string | null = null;
  const buffer: string[] = [];

  const flushBuffer = () => {
    if (currentKey && buffer.length > 0) {
      result[currentKey] = ensurePlaceholders(buffer.join('\n').trim());
      buffer.length = 0;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect a key like "### single_tip" or "**hot_take**:" or "- single_tip:"
    const headingMatch = /^#{1,4}\s+(.+)/.exec(trimmed);
    const boldLabelMatch = /^\*\*(.+?)\*\*:?(.*)/.exec(trimmed);
    const listLabelMatch = /^[-*+]\s+\*?\*?(\w[\w\s_-]*?)\*?\*?:(.+)?/.exec(trimmed);

    if (headingMatch?.[1]) {
      flushBuffer();
      currentKey = slugifyKey(headingMatch[1]);
    } else if (boldLabelMatch?.[1]) {
      flushBuffer();
      currentKey = slugifyKey(boldLabelMatch[1]);
      if (boldLabelMatch[2]?.trim()) buffer.push(boldLabelMatch[2].trim());
    } else if (listLabelMatch?.[1] && listLabelMatch[2]) {
      // "- key: template text"
      const keyPart = listLabelMatch[1].trim();
      const valuePart = listLabelMatch[2].trim();
      if (valuePart) {
        result[slugifyKey(keyPart)] = ensurePlaceholders(valuePart);
      } else {
        flushBuffer();
        currentKey = slugifyKey(keyPart);
      }
    } else if (currentKey) {
      buffer.push(trimmed);
    } else {
      // No key yet — treat as a numbered/generic caption
      const listMatch = /^(?:[-*+]|\d+[.)]) (.+)/.exec(trimmed);
      if (listMatch?.[1]) {
        const idx = Object.keys(result).length + 1;
        result[`template_${idx}`] = ensurePlaceholders(listMatch[1].trim());
      }
    }
  }
  flushBuffer();

  return result;
}

function slugifyKey(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\s-]/g, '')
    .replace(/\s+/g, '_');
}

/** Ensure a template has at least the placeholder structure */
function ensurePlaceholders(text: string): string {
  // If it already has placeholders, return as-is
  if (text.includes('{hook}') || text.includes('{value}') || text.includes('{cta}')) {
    return text;
  }
  // Otherwise return as-is (valid template without placeholders is fine)
  return text;
}

// Re-export parseNumber for potential internal use (kept non-exported by default)
export { parseNumber };
