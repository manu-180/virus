export interface RawSections {
  hooks: string[];
  formats: string[];
  topics: string[];
  pacingRaw: string;
  visualElements: string[];
  ctaTemplates: string[];
  hashtagsRaw: string;
  captionsRaw: string;
  language?: string;
}

// Section keyword matchers (case-insensitive substring match)
const SECTION_MATCHERS: Record<keyof Omit<RawSections, 'language'>, string[]> = {
  hooks: ['hook'],
  formats: ['format'],
  topics: ['topic', 'temas', 'pillar'],
  pacingRaw: ['pacing', 'ritmo', 'timing'],
  visualElements: ['visual'],
  ctaTemplates: ['cta', 'call to action', 'llamada'],
  hashtagsRaw: ['hashtag', 'tag'],
  captionsRaw: ['caption', 'subtitulo', 'subtítulo'],
};

/** True if heading text matches any keyword for the section */
function matchesSection(heading: string, keywords: string[]): boolean {
  const lower = heading.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/** Identify which section a heading belongs to, or null */
function identifySection(heading: string): keyof Omit<RawSections, 'language'> | null {
  for (const [section, keywords] of Object.entries(SECTION_MATCHERS)) {
    if (matchesSection(heading, keywords)) {
      return section as keyof Omit<RawSections, 'language'>;
    }
  }
  return null;
}

/** Extract list items from a block of text */
function extractListItems(text: string): string[] {
  const lines = text.split('\n');
  const items: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Match: "- item", "* item", "1. item", "2) item", "+ item"
    const listMatch = /^(?:[-*+]|\d+[.)]) (.+)/.exec(trimmed);
    if (listMatch?.[1]) {
      items.push(listMatch[1].trim());
    } else if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      // Include non-heading non-empty lines as items too
      items.push(trimmed);
    }
  }
  return items;
}

/** Detect language from metadata comment or content heuristics */
function detectLanguage(markdown: string): string | undefined {
  // Look for explicit language metadata: `language: es` or `lang: en`
  const metaMatch = /^(?:language|lang)\s*:\s*(\w+)/im.exec(markdown);
  if (metaMatch?.[1]) return metaMatch[1].toLowerCase();

  // Look for frontmatter
  const frontmatterMatch = /^---\s*\n(?:.*\n)*?(?:language|lang)\s*:\s*(\w+)/i.exec(markdown);
  if (frontmatterMatch?.[1]) return frontmatterMatch[1].toLowerCase();

  return undefined;
}

/**
 * Parse a markdown string into raw extracted sections (before normalization).
 * Handles heading variations using keyword substring matching (case-insensitive).
 */
export function extractSectionsFromMarkdown(markdown: string): RawSections {
  const detectedLanguage = detectLanguage(markdown);
  const result: RawSections = {
    hooks: [],
    formats: [],
    topics: [],
    pacingRaw: '',
    visualElements: [],
    ctaTemplates: [],
    hashtagsRaw: '',
    captionsRaw: '',
    ...(detectedLanguage !== undefined ? { language: detectedLanguage } : {}),
  };

  // Split into sections by ## or ### headings
  // A section starts at a heading and ends at the next heading of equal or higher level
  const headingRegex = /^(#{1,4})\s+(.+)$/gm;
  const sections: Array<{ level: number; title: string; start: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(markdown)) !== null) {
    sections.push({
      level: match[1]?.length ?? 1,
      title: match[2]?.trim() ?? '',
      start: match.index,
    });
  }

  // Extract content between consecutive sections
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;

    const nextSection = sections[i + 1];
    const sectionEnd = nextSection ? nextSection.start : markdown.length;
    // Content starts after the heading line
    const headingEnd = markdown.indexOf('\n', section.start);
    const contentStart = headingEnd === -1 ? sectionEnd : headingEnd + 1;
    const rawContent = markdown.slice(contentStart, sectionEnd);

    const sectionKey = identifySection(section.title);
    if (!sectionKey) continue;

    switch (sectionKey) {
      case 'hooks':
        result.hooks = extractListItems(rawContent);
        break;
      case 'formats':
        result.formats = extractListItems(rawContent);
        break;
      case 'topics':
        result.topics = extractListItems(rawContent);
        break;
      case 'pacingRaw':
        result.pacingRaw = rawContent.trim();
        break;
      case 'visualElements':
        result.visualElements = extractListItems(rawContent);
        break;
      case 'ctaTemplates':
        result.ctaTemplates = extractListItems(rawContent);
        break;
      case 'hashtagsRaw':
        result.hashtagsRaw = rawContent.trim();
        break;
      case 'captionsRaw':
        result.captionsRaw = rawContent.trim();
        break;
    }
  }

  return result;
}
