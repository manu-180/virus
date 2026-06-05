import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CACHE_DIR = path.join(os.tmpdir(), 'carousel-fonts');

interface FontEntry {
  name: string;
  url: string;
  weight: 400 | 700 | 900;
  style: 'normal' | 'italic';
}

// IMPORTANT: Satori supports static TTF — NOT woff2 and NOT variable fonts
// (a variable TTF crashes Satori's font parser). All URLs below point to
// STATIC TTF cuts: Inter/Archivo Black from Google's gstatic CDN, the display
// faces from the google/fonts GitHub repo (stable static instances).
//
// Every font drives one or more of the 13 carousel styles (see styles.ts):
//   - Inter           → body + most sans headlines
//   - Archivo Black   → 'bold' heavy display
//   - DM Serif Display→ serif styles (editorial, spotlight, frame, quote, masthead) + italic kicker
//   - Anton           → 'index' giant number
//   - Space Mono      → 'ticket' mono labels
//
// All are best-effort: if a fetch fails the font is skipped and Satori falls
// back to the nearest available family. Inter is the hard requirement.
const GH = 'https://raw.githubusercontent.com/google/fonts/main';
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
  // Archivo Black — single weight, registered as 900
  {
    name: 'Archivo Black',
    url: 'https://fonts.gstatic.com/s/archivoblack/v21/HTxqL289NzCGg4MzN6KJ7eW6OYuP_x7yx3A.ttf',
    weight: 900,
    style: 'normal',
  },
  // DM Serif Display — premium Didone serif (+ real italic)
  {
    name: 'DM Serif Display',
    url: `${GH}/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf`,
    weight: 400,
    style: 'normal',
  },
  {
    name: 'DM Serif Display',
    url: `${GH}/ofl/dmserifdisplay/DMSerifDisplay-Italic.ttf`,
    weight: 400,
    style: 'italic',
  },
  // Anton — condensed poster display (single weight)
  {
    name: 'Anton',
    url: `${GH}/ofl/anton/Anton-Regular.ttf`,
    weight: 400,
    style: 'normal',
  },
  // Space Mono — monospace labels
  {
    name: 'Space Mono',
    url: `${GH}/ofl/spacemono/SpaceMono-Regular.ttf`,
    weight: 400,
    style: 'normal',
  },
  {
    name: 'Space Mono',
    url: `${GH}/ofl/spacemono/SpaceMono-Bold.ttf`,
    weight: 700,
    style: 'normal',
  },
];

export interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700 | 900;
  style: 'normal' | 'italic';
}

/**
 * Load fonts for use with Satori.
 *
 * Inter (400/700) is always attempted first and is required.
 * Additional fonts (Archivo Black, Playfair Display) are best-effort.
 * All fonts are cached in {@link CACHE_DIR} after first fetch.
 */
export async function loadFonts(): Promise<LoadedFont[]> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }

  const results: LoadedFont[] = [];

  for (const entry of FONT_SOURCES) {
    const cacheFile = path.join(CACHE_DIR, `${entry.name.replace(/\s/g, '-')}-${entry.weight}.ttf`);
    let data: Buffer;

    if (existsSync(cacheFile)) {
      data = await readFile(cacheFile);
    } else {
      try {
        const res = await fetch(entry.url);
        if (!res.ok) {
          console.warn(`[carousel/fonts] Failed to fetch "${entry.name}" (${entry.weight}): HTTP ${res.status}`);
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
