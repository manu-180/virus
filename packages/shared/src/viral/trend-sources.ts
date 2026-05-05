import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';

export interface TrendRawItem {
  source: 'rss' | 'github' | 'reddit';
  title: string;
  url: string;
  score: number;
  publishedAt: Date;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { data: TrendRawItem[]; cachedAt: number }>();

function getCached(key: string): TrendRawItem[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: TrendRawItem[]): void {
  cache.set(key, { data, cachedAt: Date.now() });
}

const RSS_FEEDS = [
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA',
  'https://thenewstack.io/feed/',
  'https://hnrss.org/frontpage?count=50',
  'https://dev.to/feed/tag/javascript',
  'https://dev.to/feed/tag/typescript',
  'https://dev.to/feed/tag/webdev',
];

const HN_KEYWORDS = [
  'javascript', 'typescript', 'react', 'nextjs', 'python', 'ai', 'ml',
  'rust', 'go', 'wasm', 'node', 'api', 'framework', 'tool', 'docker',
  'kubernetes', 'llm', 'openai', 'claude', 'open source',
];

const RELEVANT_KEYWORDS = [
  'ai', 'llm', 'react', 'next', 'vue', 'svelte', 'astro', 'rust', 'go',
  'typescript', 'python', 'framework', 'tool', 'agent', 'gpt', 'openai',
  'claude', 'ml', 'bun', 'deno', 'vite', 'tailwind', 'prisma', 'drizzle',
];

const SUBREDDITS = ['programming', 'webdev', 'reactjs', 'typescript', 'javascript'];

function isHnFeed(url: string): boolean {
  return url.includes('hnrss.org');
}

function parseDate(value: unknown): Date {
  if (typeof value === 'string' && value.length > 0) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null && '#text' in value) {
    const v = (value as Record<string, unknown>)['#text'];
    if (typeof v === 'string') return v.trim();
  }
  return '';
}

function extractLink(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        if ('@_rel' in obj && obj['@_rel'] !== 'alternate') continue;
        if ('@_href' in obj && typeof obj['@_href'] === 'string') {
          return obj['@_href'].trim();
        }
        if ('#text' in obj && typeof obj['#text'] === 'string') {
          return obj['#text'].trim();
        }
      }
    }
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('@_href' in obj && typeof obj['@_href'] === 'string') {
      return obj['@_href'].trim();
    }
    if ('#text' in obj && typeof obj['#text'] === 'string') {
      return obj['#text'].trim();
    }
  }
  return '';
}

async function parseSingleFeed(feedUrl: string, sinceDays: number): Promise<TrendRawItem[]> {
  const response = await fetch(feedUrl, {
    headers: { 'User-Agent': 'virus-trend-detector/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];

  const xml = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed: unknown = parser.parse(xml);

  if (typeof parsed !== 'object' || parsed === null) return [];

  const root = parsed as Record<string, unknown>;
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const hn = isHnFeed(feedUrl);
  const items: TrendRawItem[] = [];

  const rssRoot = root['rss'];
  const feedRoot = root['feed'];

  if (typeof rssRoot === 'object' && rssRoot !== null) {
    const channel = (rssRoot as Record<string, unknown>)['channel'];
    if (typeof channel !== 'object' || channel === null) return [];
    const rawItems = (channel as Record<string, unknown>)['item'];
    const itemArray: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems != null ? [rawItems] : [];

    for (const item of itemArray) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;
      const title = extractText(obj['title']);
      const link = extractLink(obj['link']);
      const pubDate = parseDate(obj['pubDate'] ?? obj['dc:date'] ?? obj['published']);

      if (!title || !link) continue;
      if (pubDate.getTime() < cutoff) continue;

      if (hn) {
        const lower = title.toLowerCase();
        if (!HN_KEYWORDS.some(kw => lower.includes(kw))) continue;
      }

      items.push({ source: 'rss', title, url: link, score: 50, publishedAt: pubDate });
    }
    return items;
  }

  if (typeof feedRoot === 'object' && feedRoot !== null) {
    const rawEntries = (feedRoot as Record<string, unknown>)['entry'];
    const entryArray: unknown[] = Array.isArray(rawEntries) ? rawEntries : rawEntries != null ? [rawEntries] : [];

    for (const entry of entryArray) {
      if (typeof entry !== 'object' || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const title = extractText(obj['title']);
      const link = extractLink(obj['link']);
      const pubDate = parseDate(obj['published'] ?? obj['updated']);

      if (!title || !link) continue;
      if (pubDate.getTime() < cutoff) continue;

      items.push({ source: 'rss', title, url: link, score: 50, publishedAt: pubDate });
    }
    return items;
  }

  return [];
}

export async function fetchRssFeeds(sinceDays = 14): Promise<TrendRawItem[]> {
  const cached = getCached('rss');
  if (cached) return cached;

  const results = await Promise.allSettled(
    RSS_FEEDS.map(url => parseSingleFeed(url, sinceDays)),
  );

  const items: TrendRawItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.error('[trend-sources] RSS feed error:', result.reason);
    }
  }

  if (items.length > 0) setCached('rss', items);
  return items;
}

export async function fetchGithubTrending(): Promise<TrendRawItem[]> {
  const cached = getCached('github');
  if (cached) return cached;

  try {
    const response = await fetch('https://github.com/trending?since=daily&spoken_language_code=', {
      headers: {
        'User-Agent': 'virus-trend-detector/1.0',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const items: TrendRawItem[] = [];

    $('article.Box-row').each((_i, el) => {
      const anchor = $(el).find('.h3 a').first();
      const href = anchor.attr('href') ?? '';
      const rawName = anchor.text().replace(/\s+/g, ' ').trim();

      const description = $(el).find('p.col-9').text().trim();
      const starsText = $(el).find('.Link--muted').first().text().trim().replace(/,/g, '');
      const stars = parseInt(starsText, 10);

      if (!href || !rawName) return;

      const combined = (rawName + ' ' + description).toLowerCase();
      if (!RELEVANT_KEYWORDS.some(kw => combined.includes(kw))) return;

      const score = isNaN(stars) ? 0 : stars;
      const url = 'https://github.com' + href;

      items.push({
        source: 'github',
        title: rawName,
        url,
        score,
        publishedAt: new Date(),
      });
    });

    if (items.length > 0) setCached('github', items);
    return items;
  } catch (err) {
    console.error('[trend-sources] GitHub trending error:', err);
    return [];
  }
}

interface RedditPost {
  title: string;
  url: string;
  permalink: string;
  score: number;
  created_utc: number;
}

interface RedditChild {
  data: RedditPost;
}

interface RedditResponse {
  data: {
    children: RedditChild[];
  };
}

async function fetchSubreddit(sub: string): Promise<TrendRawItem[]> {
  const url = `https://www.reddit.com/r/${sub}/top.json?limit=25&t=week`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'virus-trend-detector/1.0' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return [];

  const raw: unknown = await response.json();
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('data' in raw) ||
    typeof (raw as { data?: unknown }).data !== 'object' ||
    !(raw as { data?: unknown }).data ||
    !Array.isArray(((raw as { data: { children?: unknown } }).data).children)
  ) {
    return [];
  }
  const children = ((raw as RedditResponse).data.children);
  const items: TrendRawItem[] = [];

  for (const child of children) {
    const post = child.data;
    if (post.score < 100) continue;

    items.push({
      source: 'reddit',
      title: post.title,
      url: 'https://reddit.com' + post.permalink,
      score: post.score,
      publishedAt: new Date(post.created_utc * 1000),
    });
  }

  return items;
}

export async function fetchRedditPosts(): Promise<TrendRawItem[]> {
  const cached = getCached('reddit');
  if (cached) return cached;

  const results = await Promise.allSettled(SUBREDDITS.map(sub => fetchSubreddit(sub)));

  const items: TrendRawItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.error('[trend-sources] Reddit error:', result.reason);
    }
  }

  if (items.length > 0) setCached('reddit', items);
  return items;
}
