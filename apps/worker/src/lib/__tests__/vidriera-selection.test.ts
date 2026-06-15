import { describe, it, expect } from 'vitest';
import { isPromotable, type DemoRow } from '../vidriera-selection.js';

function demo(overrides: Partial<DemoRow> = {}): DemoRow {
  return {
    id: 'id-1',
    slug: 'nebula',
    titulo: 'Nebula',
    pitch: 'Analytics con IA',
    tipo_producto: 'SaaS',
    status: 'deployado',
    url_deploy: 'https://nebula-delta-henna.vercel.app',
    caption_ig: null,
    created_at: '2026-06-14T00:00:00Z',
    promoted_at: null,
    ig_permalink: null,
    promo_error: null,
    ...overrides,
  };
}

describe('isPromotable', () => {
  it('accepts a deployado demo with a live url that is not promoted', () => {
    expect(isPromotable(demo({ status: 'deployado' }))).toBe(true);
  });

  it('accepts a listo demo with a live url that is not promoted', () => {
    expect(isPromotable(demo({ status: 'listo' }))).toBe(true);
  });

  it('rejects a demo whose status is not promotable (e.g. idea)', () => {
    expect(isPromotable(demo({ status: 'idea' }))).toBe(false);
  });

  it('rejects a demo with no live url_deploy', () => {
    expect(isPromotable(demo({ url_deploy: null }))).toBe(false);
  });

  it('rejects a demo with a blank/whitespace url_deploy', () => {
    expect(isPromotable(demo({ url_deploy: '   ' }))).toBe(false);
  });

  it('rejects a demo already promoted', () => {
    expect(isPromotable(demo({ promoted_at: '2026-06-15T00:00:00Z' }))).toBe(false);
  });
});
