/**
 * El Grabador multi-ruta — site-tour recorder (Vidriera-Video C2 / Tarea 2).
 *
 * Generalises the single-page recorder (recorder.ts) to a multi-route "tour":
 * given a site, it discovers (or is handed) a list of routes, records a
 * constant-speed scroll of EACH one (reusing recordDemoScroll), then stitches
 * the per-route clips together with short crossfades into ONE 1080×1920 clip in
 * the mandatory APEX format. The rest of the pipeline is unchanged: this clip is
 * the "video" that goes into editor_machine (trim + karaoke subs over the VO),
 * then the outro compose, then publish (libre_albedrio/tools/vidriera-video.md §7).
 *
 * Duration-anchor model (same as the single page): the WHOLE tour lasts
 * `totalDurationSec` (production passes VO + tail). With N routes stitched by
 * (N−1) crossfades of `transitionSec`, each route clip must be a bit longer so
 * the overlaps still land on the target total — see allocateTourDurations.
 *
 * Route order IS the narrative order. Discovery is a fallback; the production
 * path (assistify) hands a curated, ordered route list.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordDemoScroll, runFfmpeg, probeDurationSec } from './recorder.js';

const OUT_W = 1080;
const OUT_H = 1920;
const DEFAULT_FPS = 30;
const DEFAULT_TRANSITION_SEC = 0.5;
const DEFAULT_MAX_ROUTES = 6;

// x264 preset for the stitched tour. Like the recorder's intermediate clip, this
// output is re-encoded twice downstream (editor_machine, then outro compose), so
// its quality barely matters — set TOUR_X264_PRESET=veryfast on a loaded machine.
const X264_PRESET = process.env['TOUR_X264_PRESET'] ?? 'medium';

/** Strip a trailing slash (except for root) so "/x" and "/x/" dedupe to one. */
function normalisePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/**
 * Parse a sitemap.xml into the list of same-origin route PATHS, in document
 * order, deduped, with trailing slashes normalised. Cross-origin and unparseable
 * <loc>s are dropped. Pure (no I/O) so it is trivially unit-tested.
 */
export function parseSitemapRoutes(xml: string, baseUrl: string): string[] {
  const baseOrigin = new URL(baseUrl).origin;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.origin !== baseOrigin) continue;
    const path = normalisePath(u.pathname);
    if (!seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/**
 * Parse the same-origin route PATHS out of a page's <a href> links, in document
 * order, deduped. Pure-fragment (#…), mailto:, tel: and javascript: hrefs and
 * cross-origin links are dropped; query/hash are discarded (pathname only).
 */
export function parseHomeLinks(html: string, baseUrl: string): string[] {
  const baseOrigin = new URL(baseUrl).origin;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = (m[1] ?? m[2] ?? '').trim();
    if (!href) continue;
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (u.origin !== baseOrigin) continue;
    const path = normalisePath(u.pathname);
    if (!seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/**
 * Split `totalSec` across `routeCount` route clips so that, after stitching with
 * (routeCount−1) crossfades of `transitionSec` (each overlap shortens the total
 * by `transitionSec`), the final clip lasts `totalSec`. Equal split:
 *   Σ clip = totalSec + (n−1)·T   →   each = that / n.
 * One route → [totalSec] (no transitions); zero → [].
 */
export function allocateTourDurations(
  totalSec: number,
  routeCount: number,
  transitionSec: number,
): number[] {
  if (routeCount <= 0) return [];
  if (routeCount === 1) return [totalSec];
  const each = (totalSec + (routeCount - 1) * transitionSec) / routeCount;
  return Array.from({ length: routeCount }, () => each);
}

// ── Pricing-route detection (generic across sites) ───────────────────────────

/**
 * Parse the same-origin <a> links of a page as {path, text} pairs (inner HTML
 * stripped to plain text). Like parseHomeLinks but keeps the link LABEL, which
 * is the strongest signal for finding the pricing page ("Precios", "Pricing").
 */
export function parseHomeAnchors(html: string, baseUrl: string): Array<{ path: string; text: string }> {
  const baseOrigin = new URL(baseUrl).origin;
  const out: Array<{ path: string; text: string }> = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = (m[1] ?? m[2] ?? '').trim();
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (u.origin !== baseOrigin) continue;
    const path = normalisePath(u.pathname);
    if (seen.has(path)) continue;
    const text = (m[3] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    seen.add(path);
    out.push({ path, text });
  }
  return out;
}

/** Lowercase + strip accents so "Precios"/"precios"/"preciós" compare equal. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Multilingual keyword tiers for "this is the pricing/plans page". STRONG are
// unambiguous; WEAK might be pricing (a "/servicios"·"/services" page often is),
// so they score lower and lean on the content check to confirm.
const PRICING_STRONG = [
  'precios', 'precio', 'planes', 'plan', 'pricing', 'plans', 'tarifas', 'tarifa',
  'suscrip', 'subscrip', 'membresia', 'membership', 'price',
];
const PRICING_WEAK = ['servicios', 'services', 'comprar', 'contratar', 'presupuesto', 'costos', 'cost'];

/**
 * Score how "pricing-like" a route is from its link text and URL slug (pure).
 * The nav label ("Precios") is the strongest signal, the slug next. 0 = no
 * pricing signal. Used to pick the pricing route generically across any site.
 */
export function scorePricingRoute(route: { path: string; text: string }): number {
  const path = norm(route.path);
  const text = norm(route.text);
  let score = 0;
  for (const kw of PRICING_STRONG) {
    if (text.includes(kw)) score += 3;
    if (path.includes(kw)) score += 2;
  }
  for (const kw of PRICING_WEAK) {
    if (text.includes(kw)) score += 1;
    if (path.includes(kw)) score += 1;
  }
  return score;
}

/**
 * Heuristic: does this page's HTML look like a pricing page? Looks for currency
 * amounts ($/USD/ARS/€ + digits) and per-period tokens (/mes, mensual). Confirms
 * a keyword guess and can rescue an oddly-named pricing page. Pure.
 */
export function looksLikePricingContent(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  const currencyHits =
    (text.match(/(?:\$|usd|ars|eur|€|us\$)\s?\d/g) || []).length +
    (text.match(/\d\s?(?:usd|ars|eur|€)/g) || []).length;
  const perPeriod = /\/\s?(?:mes|mo|month|ano|year|anual|mensual)|por mes|al mes/i.test(text);
  return currencyHits >= 2 || (currencyHits >= 1 && perPeriod);
}

/**
 * Pick the best pricing route from candidate links (pure). Ranks by keyword
 * score; when `contentByPath` is given, a candidate whose page looks like pricing
 * gets a strong boost (so a weak slug like "/servicios" wins if it shows prices).
 * Returns null if nothing scores above zero.
 */
export function pickBestPricingRoute(
  candidates: Array<{ path: string; text: string }>,
  contentByPath?: Record<string, string>,
): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    let s = scorePricingRoute(c);
    if (contentByPath?.[c.path] && looksLikePricingContent(contentByPath[c.path]!)) s += 5;
    if (s > bestScore) {
      bestScore = s;
      best = c.path;
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * Find a site's pricing/plans route generically: gather candidate links (home
 * <a> text + slug, plus sitemap slugs), shortlist by keyword, confirm the top
 * few by fetching their content (price signals), and pick the best. Returns the
 * route PATH (e.g. "/planes", "/pricing", "/servicios") or null if none found.
 */
export async function findPricingRoute(
  baseUrl: string,
  options: { timeoutMs?: number } = {},
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const get = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  };

  const [home, sitemap] = await Promise.all([get(baseUrl), get(new URL('/sitemap.xml', baseUrl).href)]);
  const byPath = new Map<string, { path: string; text: string }>();
  if (home) for (const a of parseHomeAnchors(home, baseUrl)) byPath.set(a.path, a);
  if (sitemap) {
    for (const p of parseSitemapRoutes(sitemap, baseUrl)) {
      if (!byPath.has(p)) byPath.set(p, { path: p, text: '' });
    }
  }
  const candidates = [...byPath.values()].filter((c) => c.path !== '/');
  if (candidates.length === 0) return null;

  // Shortlist by keyword (fall back to the first few if nothing matched), then
  // fetch each shortlisted page once to content-confirm.
  const ranked = candidates.map((c) => ({ c, s: scorePricingRoute(c) })).sort((a, b) => b.s - a.s);
  const pool = (ranked.some((r) => r.s > 0) ? ranked.filter((r) => r.s > 0) : ranked)
    .slice(0, 3)
    .map((r) => r.c);

  const contentByPath: Record<string, string> = {};
  await Promise.all(
    pool.map(async (c) => {
      const html = await get(new URL(c.path, baseUrl).href);
      if (html) contentByPath[c.path] = html;
    }),
  );
  return pickBestPricingRoute(pool, contentByPath);
}

export interface DiscoverRoutesOptions {
  /** Max routes to keep (default 6). */
  maxRoutes?: number;
  /** Fetch timeout per request in ms (default 15000). */
  timeoutMs?: number;
}

/**
 * Discover a site's routes: try `${baseUrl}/sitemap.xml` first (authoritative),
 * fall back to the home page's <a href> links. Returns same-origin PATHS capped
 * to `maxRoutes`. The production path usually passes an explicit curated list
 * instead of relying on this.
 */
export async function discoverRoutes(
  baseUrl: string,
  options: DiscoverRoutesOptions = {},
): Promise<string[]> {
  const maxRoutes = options.maxRoutes ?? DEFAULT_MAX_ROUTES;
  const timeoutMs = options.timeoutMs ?? 15_000;

  const get = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  };

  const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;
  const sitemap = await get(sitemapUrl);
  let routes = sitemap ? parseSitemapRoutes(sitemap, baseUrl) : [];

  if (routes.length === 0) {
    const home = await get(baseUrl);
    routes = home ? parseHomeLinks(home, baseUrl) : [];
  }
  return routes.slice(0, maxRoutes);
}

export interface RecordSiteTourInput {
  /** Site root, e.g. https://assistify.lat */
  baseUrl: string;
  /** Ordered routes (paths or absolute URLs). If omitted, routes are discovered. */
  routes?: string[];
  /** Absolute path for the final stitched .mp4. */
  outPath: string;
  /** Whole-tour duration (s); production passes voiceOverSeconds + tail. */
  totalDurationSec: number;
  /** Crossfade between routes (s). Default 0.5. */
  transitionSec?: number;
  /** Output frame rate. Default 30 (APEX standard). */
  fps?: number;
  /** Collapse big empty bands per route (recorder de-pad). Default true. */
  depad?: boolean;
  /** Cap for discovered routes (ignored when `routes` is given). Default 6. */
  maxRoutes?: number;
  /**
   * Cap the per-route pan speed (device px/s). Keeps the scroll calm by showing
   * the TOP portion of a tall page instead of racing the whole page into its
   * slice. ~195 = the registered "un toque ágil" feel (spec §0.7). Default: uncapped.
   */
  maxSpeedPxPerSec?: number;
}

export interface RecordSiteTourResult {
  outPath: string;
  /** Final stitched duration in seconds. */
  durationSec: number;
  /** The absolute route URLs actually toured, in order. */
  routes: string[];
  width: number;
  height: number;
  fps: number;
}

/**
 * Record a multi-route scroll tour of `baseUrl` into one 1080×1920 mp4. Each
 * route is captured by recordDemoScroll (constant-speed pan) for its allocated
 * slice, then the clips are stitched with crossfades. Video-only (no audio) —
 * exactly like the single-page recorder; the VO is added downstream by
 * editor_machine.
 */
export async function recordSiteTour(input: RecordSiteTourInput): Promise<RecordSiteTourResult> {
  const fps = input.fps ?? DEFAULT_FPS;
  const transition = input.transitionSec ?? DEFAULT_TRANSITION_SEC;

  const paths =
    input.routes && input.routes.length > 0
      ? input.routes
      : await discoverRoutes(input.baseUrl, { maxRoutes: input.maxRoutes ?? DEFAULT_MAX_ROUTES });
  const urls = paths.map((r) => new URL(r, input.baseUrl).href);
  if (urls.length === 0) {
    throw new Error(`recordSiteTour: no routes to record for ${input.baseUrl}`);
  }

  // One route → no stitching needed; this is just the single-page recorder.
  if (urls.length === 1) {
    const single = await recordDemoScroll({
      url: urls[0]!,
      outPath: input.outPath,
      durationSec: input.totalDurationSec,
      fps,
      // omit optional keys entirely when undefined (exactOptionalPropertyTypes).
      ...(input.depad !== undefined ? { depad: input.depad } : {}),
      ...(input.maxSpeedPxPerSec !== undefined ? { maxSpeedPxPerSec: input.maxSpeedPxPerSec } : {}),
    });
    return {
      outPath: input.outPath,
      durationSec: single.durationSec,
      routes: urls,
      width: single.width,
      height: single.height,
      fps,
    };
  }

  const durations = allocateTourDurations(input.totalDurationSec, urls.length, transition);
  const workDir = await mkdtemp(join(tmpdir(), 'site-tour-'));
  try {
    // Capture each route sequentially (Playwright + FFmpeg are heavy; the loaded-
    // machine gotcha says run one at a time — see vidriera-video §9 GOTCHA).
    const clips: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const clip = join(workDir, `clip-${i}.mp4`);
      await recordRouteResilient(urls[i]!, clip, durations[i]!, fps, input.depad, input.maxSpeedPxPerSec);
      clips.push(clip);
    }

    await stitchClipsXfade(clips, durations, input.outPath, transition, fps);

    const durationSec = await probeDurationSec(input.outPath);
    return { outPath: input.outPath, durationSec, routes: urls, width: OUT_W, height: OUT_H, fps };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Record one route, but if the page is too short to scroll (de-pad can over-
 * collapse a short page), retry once with de-pad disabled before giving up. A
 * genuinely too-short page still throws — loud is better than a silent gap.
 */
async function recordRouteResilient(
  url: string,
  outPath: string,
  durationSec: number,
  fps: number,
  depad: boolean | undefined,
  maxSpeedPxPerSec: number | undefined,
): Promise<void> {
  const base = {
    url,
    outPath,
    durationSec,
    fps,
    ...(maxSpeedPxPerSec !== undefined ? { maxSpeedPxPerSec } : {}),
  };
  try {
    await recordDemoScroll({ ...base, ...(depad !== undefined ? { depad } : {}) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (depad !== false && /too short to scroll/i.test(msg)) {
      await recordDemoScroll({ ...base, depad: false });
      return;
    }
    throw err;
  }
}

/**
 * Stitch N video-only clips into one with chained crossfades. Each input branch
 * is normalised to the exact format + timebase (xfade silently mis-times when
 * inputs disagree — formato-video-apex gotcha) and the offsets accumulate:
 *   offsetᵢ = (running stitched length so far) − T.
 */
async function stitchClipsXfade(
  clips: string[],
  durations: number[],
  outPath: string,
  transition: number,
  fps: number,
): Promise<void> {
  const n = clips.length;
  const tb = `settb=1/${fps}`;
  const parts: string[] = [];

  // Normalise each input to [v0]…[v{n-1}].
  for (let i = 0; i < n; i++) {
    parts.push(
      `[${i}:v]fps=${fps},scale=${OUT_W}:${OUT_H},setsar=1,format=yuv420p,${tb}[v${i}]`,
    );
  }

  // Chain xfades. `running` is the stitched length of everything fused so far.
  let prev = '[v0]';
  let running = durations[0]!;
  for (let i = 1; i < n; i++) {
    const offset = Math.max(0, running - transition);
    const label = i === n - 1 ? '[vout]' : `[x${i}]`;
    parts.push(
      `${prev}[v${i}]xfade=transition=fade:duration=${transition}:offset=${offset.toFixed(3)}${label}`,
    );
    running = running + durations[i]! - transition;
    prev = label;
  }

  await runFfmpeg([
    '-y',
    ...clips.flatMap((c) => ['-i', c]),
    '-filter_complex', parts.join(';'),
    '-map', '[vout]',
    '-an',
    '-c:v', 'libx264',
    '-preset', X264_PRESET,
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outPath,
  ]);
}
