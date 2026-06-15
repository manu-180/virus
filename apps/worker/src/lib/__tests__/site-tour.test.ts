import { describe, it, expect } from 'vitest';
import {
  parseSitemapRoutes,
  parseHomeLinks,
  allocateTourDurations,
} from '../site-tour.js';

describe('parseSitemapRoutes', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://assistify.lat/</loc></url>
      <url><loc>https://assistify.lat/funciones</loc></url>
      <url><loc>  https://assistify.lat/planes/  </loc></url>
      <url><loc>https://assistify.lat/soluciones/yoga</loc></url>
      <url><loc>https://other-site.com/externa</loc></url>
      <url><loc>https://assistify.lat/funciones</loc></url>
    </urlset>`;

  it('returns same-origin pathnames in order, deduped, trailing slash normalised', () => {
    expect(parseSitemapRoutes(xml, 'https://assistify.lat')).toEqual([
      '/',
      '/funciones',
      '/planes',
      '/soluciones/yoga',
    ]);
  });

  it('drops cross-origin locs', () => {
    expect(parseSitemapRoutes(xml, 'https://assistify.lat')).not.toContain('/externa');
  });

  it('returns [] for xml with no <loc>', () => {
    expect(parseSitemapRoutes('<urlset></urlset>', 'https://assistify.lat')).toEqual([]);
  });
});

describe('parseHomeLinks', () => {
  const html = `
    <a href="/funciones">Funciones</a>
    <a href="https://assistify.lat/planes">Planes</a>
    <a href="/funciones#top">dup with fragment</a>
    <a href="https://twitter.com/apex">externo</a>
    <a href="mailto:hola@assistify.lat">mail</a>
    <a href="#seccion">solo fragmento</a>
    <a href='/soluciones'>Soluciones</a>
    <a href="/">Inicio</a>`;

  it('returns same-origin pathnames, deduped, fragments/mailto/externals excluded', () => {
    expect(parseHomeLinks(html, 'https://assistify.lat')).toEqual([
      '/funciones',
      '/planes',
      '/soluciones',
      '/',
    ]);
  });

  it('returns [] when there are no anchors', () => {
    expect(parseHomeLinks('<div>no links</div>', 'https://assistify.lat')).toEqual([]);
  });
});

describe('allocateTourDurations', () => {
  it('single route → the whole duration, no transitions', () => {
    expect(allocateTourDurations(30, 1, 0.5)).toEqual([30]);
  });

  it('empty tour → []', () => {
    expect(allocateTourDurations(30, 0, 0.5)).toEqual([]);
  });

  it('splits so that stitched total (sum − (n−1)·T) equals the target', () => {
    const T = 0.5;
    for (const [total, n] of [
      [30, 3],
      [24, 4],
      [40, 5],
    ] as Array<[number, number]>) {
      const parts = allocateTourDurations(total, n, T);
      expect(parts).toHaveLength(n);
      const stitched = parts.reduce((a, b) => a + b, 0) - (n - 1) * T;
      expect(stitched).toBeCloseTo(total, 5);
      // equal split
      for (const p of parts) expect(p).toBeCloseTo(parts[0]!, 5);
    }
  });
});
