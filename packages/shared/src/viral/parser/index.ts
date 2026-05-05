import type { ProjectPatterns, ProjectBrand } from '../types.js';
import { extractSectionsFromMarkdown } from './markdown.js';
import {
  parseHooksFromLines,
  parseFormatsFromLines,
  parseTopicsFromLines,
  parsePacingFromText,
  parseHashtagsFromText,
  parseCaptionsFromText,
} from './normalize.js';
import { parseJsonPatterns, parseJsonBrand } from './json.js';

// ----------- Types -----------

type PatternsResult =
  | { ok: true; data: ProjectPatterns }
  | { ok: false; error: string; partial?: Partial<ProjectPatterns> };

type BrandResult =
  | { ok: true; data: ProjectBrand }
  | { ok: false; error: string; partial?: Partial<ProjectBrand> };

// ----------- Markdown brand helpers -----------

/** Extract first level-1 heading or a ## Brand section heading */
function extractBrandName(markdown: string): string | null {
  // Check for ## Brand section
  const brandSectionMatch = /^##\s+brand[^\n]*\n+(.+)/im.exec(markdown);
  if (brandSectionMatch?.[1]) {
    const line = brandSectionMatch[1].replace(/^[*#-]\s*/, '').trim();
    if (line) return line;
  }
  // First # heading
  const h1Match = /^#\s+(.+)$/m.exec(markdown);
  if (h1Match?.[1]) return h1Match[1].trim();

  return null;
}

/** Extract one-liner from ## One-liner section or first non-heading paragraph */
function extractOneLiner(markdown: string): string | null {
  // Explicit one-liner section
  const oneLinerMatch = /^##\s+(?:one.?liner|tagline|eslogan)[^\n]*\n+([\s\S]+?)(?=\n##|\n#|$)/im.exec(markdown);
  if (oneLinerMatch?.[1]) {
    const content = oneLinerMatch[1]
      .split('\n')
      .map((l) => l.replace(/^[-*+]\s*/, '').trim())
      .filter((l) => l.length > 0)[0];
    if (content) return content;
  }

  // First paragraph that isn't a heading
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('---')) continue;
    if (trimmed.startsWith('```')) continue;
    return trimmed.replace(/^[-*+]\s*/, '').trim();
  }
  return null;
}

/** Extract list items from a markdown section by keyword */
function extractSection(markdown: string, keywords: string[]): string[] {
  const pattern = new RegExp(
    `^##\\s+(?:${keywords.join('|')})[^\\n]*\\n+([\\s\\S]+?)(?=\\n##|\\n#|$)`,
    'im'
  );
  const match = pattern.exec(markdown);
  if (!match?.[1]) return [];
  return match[1]
    .split('\n')
    .map((l) => l.replace(/^[-*+\d.)]\s*/, '').trim())
    .filter((l) => l.length > 0);
}

/** Extract audience section */
function extractAudience(markdown: string): { who: string; where: string; pains: string[] } {
  const defaultAudience = { who: '', where: '', pains: [] };
  const sectionMatch = /^##\s+(?:audience|audiencia|público)[^\n]*\n+([\s\S]+?)(?=\n##|\n#|$)/im.exec(markdown);
  if (!sectionMatch?.[1]) return defaultAudience;

  const content = sectionMatch[1];
  const whoMatch = /(?:who|quién|quien)\s*:?\s*(.+)/i.exec(content);
  const whereMatch = /(?:where|donde|dónde)\s*:?\s*(.+)/i.exec(content);
  const painsMatch = /(?:pains?|dolores?|problems?)[^\n]*\n+([\s\S]+?)(?=\n\n|\n##|\n#|$)/i.exec(content);

  return {
    who: whoMatch?.[1]?.trim() ?? '',
    where: whereMatch?.[1]?.trim() ?? '',
    pains: painsMatch?.[1]
      ? painsMatch[1]
          .split('\n')
          .map((l) => l.replace(/^[-*+]\s*/, '').trim())
          .filter((l) => l.length > 0)
      : [],
  };
}

/** Extract CTA pairs from markdown */
function extractCtas(markdown: string): { kind: string; value: string }[] {
  const sectionMatch = /^##\s+(?:cta|call to action|llamada)[^\n]*\n+([\s\S]+?)(?=\n##|\n#|$)/im.exec(markdown);
  if (!sectionMatch?.[1]) return [];

  return sectionMatch[1]
    .split('\n')
    .map((l) => l.replace(/^[-*+]\s*/, '').trim())
    .filter((l) => l.length > 0)
    .map((l, i) => {
      const colonIdx = l.indexOf(':');
      if (colonIdx > 0) {
        return { kind: l.slice(0, colonIdx).trim(), value: l.slice(colonIdx + 1).trim() };
      }
      return { kind: `cta_${i + 1}`, value: l };
    });
}

/** Extract case studies from markdown */
function extractCaseStudies(markdown: string): { title: string; metric: string }[] {
  const sectionMatch = /^##\s+(?:case stud|casos? de estudio)[^\n]*\n+([\s\S]+?)(?=\n##|\n#|$)/im.exec(markdown);
  if (!sectionMatch?.[1]) return [];

  return sectionMatch[1]
    .split('\n')
    .map((l) => l.replace(/^[-*+]\s*/, '').trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      const dashIdx = l.indexOf(' - ');
      if (dashIdx > 0) {
        return { title: l.slice(0, dashIdx).trim(), metric: l.slice(dashIdx + 3).trim() };
      }
      return { title: l, metric: '' };
    });
}

// ----------- parsePatterns -----------

export function parsePatterns(input: {
  source: string;
  mimeType: string;
  projectId: string;
}): PatternsResult {
  const { source, mimeType, projectId } = input;

  if (mimeType === 'application/json') {
    return parseJsonPatterns(source, projectId);
  }

  if (mimeType === 'text/markdown' || mimeType === 'text/plain') {
    return parsePatternsFromMarkdown(source, projectId);
  }

  return { ok: false, error: `unsupported_mime_type: ${mimeType}` };
}

function parsePatternsFromMarkdown(source: string, projectId: string): PatternsResult {
  const sections = extractSectionsFromMarkdown(source);
  const language = sections.language ?? 'es';

  const data: ProjectPatterns = {
    projectId,
    hooks: parseHooksFromLines(sections.hooks, language, projectId),
    formats: parseFormatsFromLines(sections.formats, projectId),
    topics: parseTopicsFromLines(sections.topics, projectId),
    pacing: parsePacingFromText(sections.pacingRaw),
    visualElements: sections.visualElements.map((line) => ({ name: line.trim(), retentionLift: 0.1 })),
    ctaTemplates: sections.ctaTemplates,
    hashtags: parseHashtagsFromText(sections.hashtagsRaw),
    captionTemplates: parseCaptionsFromText(sections.captionsRaw),
    language,
    parsedAt: new Date().toISOString(),
    rawSource: source,
  };

  if (data.hooks.length === 0) {
    return { ok: false, error: 'missing_required: hooks', partial: data };
  }
  if (data.formats.length === 0) {
    return { ok: false, error: 'missing_required: formats', partial: data };
  }

  return { ok: true, data };
}

// ----------- parseBrand -----------

export function parseBrand(input: {
  source: string;
  mimeType: string;
  projectId: string;
}): BrandResult {
  const { source, mimeType, projectId } = input;

  if (mimeType === 'application/json') {
    return parseJsonBrand(source, projectId);
  }

  if (mimeType === 'text/markdown' || mimeType === 'text/plain') {
    return parseBrandFromMarkdown(source, projectId);
  }

  return { ok: false, error: `unsupported_mime_type: ${mimeType}` };
}

function parseBrandFromMarkdown(source: string, projectId: string): BrandResult {
  const brandName = extractBrandName(source);
  const oneLiner = extractOneLiner(source);

  const data: ProjectBrand = {
    projectId,
    brandName: brandName ?? '',
    oneLiner: oneLiner ?? '',
    audience: extractAudience(source),
    valueProps: extractSection(source, ['value prop', 'valores', 'propuesta']),
    features: extractSection(source, ['feature', 'funcionalidad', 'característica', 'caracteristica']),
    caseStudies: extractCaseStudies(source),
    voiceTone:
      extractSection(source, ['voice', 'tone', 'voz', 'tono']).join(', ') || '',
    ctas: extractCtas(source),
    doNotSay: extractSection(source, ['do not say', 'no decir', 'avoid', 'evitar']),
    parsedAt: new Date().toISOString(),
  };

  if (!brandName) {
    return { ok: false, error: 'missing_required: brandName', partial: data };
  }

  if (!oneLiner) {
    return { ok: false, error: 'missing_required: oneLiner', partial: data };
  }

  return { ok: true, data };
}

// ----------- Re-exports -----------

export * from './zod-schemas.js';
export * from './markdown.js';
export * from './normalize.js';
export { parseJsonPatterns, parseJsonBrand } from './json.js';
