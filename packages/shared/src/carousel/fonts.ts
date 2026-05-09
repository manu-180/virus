import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CACHE_DIR = path.join(os.tmpdir(), 'carousel-fonts');

interface FontEntry {
  name: string;
  url: string;
  weight: 400 | 700;
  style: 'normal';
}

// IMPORTANT: Satori supports woff and TTF — NOT woff2.
// These are TTF (v20) URLs from Google Fonts CDN.
const FONT_SOURCES: FontEntry[] = [
  {
    name: 'Inter',
    url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
    weight: 400,
    style: 'normal',
  },
  {
    name: 'Inter',
    url: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
    weight: 700,
    style: 'normal',
  },
];

export interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: 'normal';
}

/**
 * Load Inter fonts (regular + bold) for use with Satori.
 *
 * Fonts are cached in {@link CACHE_DIR} after first fetch.
 * If a font fetch fails, it is skipped (best-effort — never throws).
 */
export async function loadFonts(): Promise<LoadedFont[]> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }

  const results: LoadedFont[] = [];

  for (const entry of FONT_SOURCES) {
    const cacheFile = path.join(CACHE_DIR, `${entry.name}-${entry.weight}.ttf`);
    let data: Buffer;

    if (existsSync(cacheFile)) {
      data = await readFile(cacheFile);
    } else {
      try {
        const res = await fetch(entry.url);
        if (!res.ok) {
          console.warn(`[carousel/fonts] Failed to fetch font "${entry.name}" (${entry.weight}): HTTP ${res.status}`);
          continue;
        }
        data = Buffer.from(await res.arrayBuffer());
        await writeFile(cacheFile, data);
      } catch (err) {
        console.warn(`[carousel/fonts] Network error fetching "${entry.name}" (${entry.weight}):`, err);
        continue;
      }
    }

    if (data.length > 0) {
      results.push({
        name: entry.name,
        data: new Uint8Array(data).buffer,
        weight: entry.weight,
        style: entry.style,
      });
    }
  }

  if (results.length === 0) {
    throw new Error('carousel/fonts: all font fetches failed — cannot compose slides');
  }

  return results;
}
