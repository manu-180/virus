import { describe, it, expect } from 'vitest';
import { buildVoScriptPrompt, buildCaptionPrompt } from '../vidriera-copy.js';
import type { DemoRow } from '../vidriera-selection.js';

const demo: DemoRow = {
  id: 'id',
  slug: 'nebula',
  titulo: 'Nebula',
  pitch: 'Analytics con IA para PyMEs',
  tipo_producto: 'SaaS',
  status: 'deployado',
  url_deploy: 'https://x.vercel.app',
  caption_ig: 'Una landing SaaS del futuro',
  created_at: '2026-06-14',
  promoted_at: null,
  ig_permalink: null,
  promo_error: null,
};

describe('buildVoScriptPrompt', () => {
  it('grounds the script in THIS demo (title + pitch)', () => {
    const p = buildVoScriptPrompt(demo);
    expect(p).toContain('Nebula');
    expect(p).toContain('Analytics con IA para PyMEs');
  });

  it('asks for argentine voseo and an APEX CTA', () => {
    const p = buildVoScriptPrompt(demo).toLowerCase();
    expect(p).toContain('voseo');
    expect(p).toContain('apex');
  });
});

describe('buildCaptionPrompt', () => {
  it('forbids the word "demo" and asks for client-style APEX framing', () => {
    const p = buildCaptionPrompt(demo).toLowerCase();
    expect(p).toContain('demo'); // the prohibition itself names the forbidden word
    expect(p).toContain('nunca');
    expect(p).toContain('apex');
  });

  it('passes the existing caption_ig as a rewrite seed', () => {
    expect(buildCaptionPrompt(demo)).toContain('Una landing SaaS del futuro');
  });
});
