import { describe, it, expect } from 'vitest';
import {
  parseSitemapRoutes,
  parseHomeLinks,
  parseHomeAnchors,
  allocateTourDurations,
  scorePricingRoute,
  looksLikePricingContent,
  pickBestPricingRoute,
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

describe('parseHomeAnchors', () => {
  it('returns same-origin {path,text}, tags stripped, deduped by path', () => {
    const html = `
      <a href="/planes">Precios y planes</a>
      <a href="/funciones"><span>Funciones</span> nuevas</a>
      <a href="https://twitter.com/x">Externo</a>
      <a href="/planes">dup</a>`;
    expect(parseHomeAnchors(html, 'https://assistify.lat')).toEqual([
      { path: '/planes', text: 'Precios y planes' },
      { path: '/funciones', text: 'Funciones nuevas' },
    ]);
  });

  it('skips fragments/mailto and cross-origin', () => {
    const html = `<a href="#x">frag</a><a href="mailto:a@b.com">mail</a><a href="https://x.com/y">ext</a>`;
    expect(parseHomeAnchors(html, 'https://assistify.lat')).toEqual([]);
  });
});

describe('scorePricingRoute', () => {
  it('scores pricing-ish routes above non-pricing ones', () => {
    const planes = scorePricingRoute({ path: '/planes', text: 'Precios' });
    const funciones = scorePricingRoute({ path: '/funciones', text: 'Funciones' });
    expect(planes).toBeGreaterThan(funciones);
    expect(funciones).toBe(0);
  });

  it('matches by path slug even without link text (accent-insensitive)', () => {
    expect(scorePricingRoute({ path: '/precios', text: '' })).toBeGreaterThan(0);
    expect(scorePricingRoute({ path: '/pricing', text: '' })).toBeGreaterThan(0);
    expect(scorePricingRoute({ path: '/tarifas', text: '' })).toBeGreaterThan(0);
  });

  it('a weak keyword (servicios) scores lower than a strong one (planes)', () => {
    expect(scorePricingRoute({ path: '/servicios', text: 'Servicios' })).toBeGreaterThan(0);
    expect(scorePricingRoute({ path: '/planes', text: 'Planes y precios' })).toBeGreaterThan(
      scorePricingRoute({ path: '/servicios', text: 'Servicios' }),
    );
  });
});

describe('looksLikePricingContent', () => {
  it('true when the page shows prices / per-period tokens', () => {
    const html = '<h1>Planes</h1><div>USD 19/mes</div><div>USD 35/mes</div><a>Probá gratis</a>';
    expect(looksLikePricingContent(html)).toBe(true);
  });

  it('false on a page with no price signals', () => {
    expect(looksLikePricingContent('<h1>Nuestras funciones</h1><p>Reservas y avisos.</p>')).toBe(false);
  });
});

describe('pickBestPricingRoute', () => {
  const candidates = [
    { path: '/funciones', text: 'Funciones' },
    { path: '/planes', text: 'Precios' },
    { path: '/soluciones', text: 'Soluciones' },
  ];

  it('picks the highest-scoring pricing route', () => {
    expect(pickBestPricingRoute(candidates)).toBe('/planes');
  });

  it('content price-signal boosts a weak-slug candidate', () => {
    const cands = [
      { path: '/servicios', text: 'Servicios' },
      { path: '/nosotros', text: 'Nosotros' },
    ];
    const content = { '/servicios': 'Plan Pro USD 19/mes USD 35/mes gratis' };
    expect(pickBestPricingRoute(cands, content)).toBe('/servicios');
  });

  it('returns null when nothing looks like pricing', () => {
    expect(pickBestPricingRoute([{ path: '/a', text: 'A' }, { path: '/b', text: 'B' }])).toBeNull();
  });
});
