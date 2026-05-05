import {
  fetchRssFeeds,
  fetchGithubTrending,
  fetchRedditPosts,
  type TrendRawItem,
} from './trend-sources.js';

export interface TrendSignal {
  source: 'rss' | 'github' | 'reddit';
  title: string;
  url: string;
  score: number;
  detectedAt: Date;
  keywords: string[];
  category: 'ai_tool' | 'framework' | 'language' | 'bug_story' | 'meta' | 'other';
}

const TECH_KEYWORDS = [
  'ai','llm','gpt','claude','openai','gemini','ml','neural','transformer',
  'react','nextjs','vue','svelte','angular','astro','remix',
  'typescript','javascript','python','rust','golang','bun','deno',
  'node','nodejs','docker','kubernetes','k8s','wasm','webassembly',
  'api','graphql','rest','grpc','websocket',
  'framework','library','tool','plugin','sdk','cli','open-source',
  'tailwind','prisma','drizzle','supabase','vercel','cloudflare',
  'agent','rag','vector','embedding','langchain',
];

const TECH_KEYWORD_SET = new Set(TECH_KEYWORDS);

function extractKeywords(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
  return words.filter(w => TECH_KEYWORD_SET.has(w));
}

function classifyCategory(title: string, keywords: string[]): TrendSignal['category'] {
  const kws = new Set(keywords);
  if (
    kws.has('ai') || kws.has('llm') || kws.has('gpt') || kws.has('claude') ||
    kws.has('openai') || kws.has('gemini') || kws.has('agent') || kws.has('rag')
  ) {
    return 'ai_tool';
  }
  if (
    kws.has('react') || kws.has('vue') || kws.has('svelte') || kws.has('angular') ||
    kws.has('nextjs') || kws.has('astro') || kws.has('framework') ||
    kws.has('remix')
  ) {
    return 'framework';
  }
  if (
    kws.has('typescript') || kws.has('javascript') || kws.has('python') ||
    kws.has('rust') || kws.has('golang') || kws.has('bun') || kws.has('deno')
  ) {
    return 'language';
  }
  const lower = title.toLowerCase();
  if (['bug','fixed','broken','issue','crash','vulnerability','cve'].some(w => lower.includes(w))) {
    return 'bug_story';
  }
  if (['why','how','what','opinion','thoughts','debate','discuss'].some(w => lower.includes(w))) {
    return 'meta';
  }
  return 'other';
}

function zNormalize(items: TrendRawItem[]): TrendRawItem[] {
  if (items.length === 0) return items;

  const scores = items.map(i => i.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);

  return items.map(item => ({
    ...item,
    score: stddev === 0 ? 0 : (item.score - mean) / stddev,
  }));
}

export async function aggregateTrends(opts?: {
  sinceDays?: number;
  topN?: number;
}): Promise<TrendSignal[]> {
  const [rss, github, reddit] = await Promise.all([
    fetchRssFeeds(opts?.sinceDays ?? 14),
    fetchGithubTrending(),
    fetchRedditPosts(),
  ]);
  const all = [...rss, ...github, ...reddit];

  const seen = new Set<string>();
  const deduped: TrendRawItem[] = [];
  for (const item of all) {
    const key = item.url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  const bySource = new Map<TrendRawItem['source'], TrendRawItem[]>();
  for (const item of deduped) {
    const group = bySource.get(item.source) ?? [];
    group.push(item);
    bySource.set(item.source, group);
  }

  const normalized: TrendRawItem[] = [];
  for (const group of bySource.values()) {
    normalized.push(...zNormalize(group));
  }

  normalized.sort((a, b) =>
    b.score - a.score || b.publishedAt.getTime() - a.publishedAt.getTime()
  );

  const topN = opts?.topN ?? 50;
  const top = normalized.slice(0, topN);

  return top.map(item => {
    const keywords = extractKeywords(item.title);
    const category = classifyCategory(item.title, keywords);
    return {
      source: item.source,
      title: item.title,
      url: item.url,
      score: item.score,
      detectedAt: item.publishedAt,
      keywords,
      category,
    };
  });
}
