import { describe, it, expect } from 'vitest';
import { parsePatterns } from '../parser/index.js';
import { SEED_APEX_DEV, ALL_SEEDS, getSeedBySlug } from '../seeds/index.js';
import { ProjectPatternsSchema, ProjectBrandSchema } from '../parser/zod-schemas.js';

describe('SEED_APEX_DEV', () => {
  it('sample-patterns.md parsea idempotente al JSON', () => {
    const result = parsePatterns({
      source: SEED_APEX_DEV.samplePatternsMarkdown,
      mimeType: 'text/markdown',
      projectId: '__seed_apex_dev__',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hooks.length).toBe(SEED_APEX_DEV.patterns.hooks.length);
      expect(result.data.formats.length).toBe(SEED_APEX_DEV.patterns.formats.length);
    }
  });

  it('patterns.json valida contra Zod schema', () => {
    const result = ProjectPatternsSchema.safeParse(SEED_APEX_DEV.patterns);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error('Zod errors:', result.error.flatten());
    }
  });

  it('brand.json valida contra Zod schema', () => {
    const result = ProjectBrandSchema.safeParse(SEED_APEX_DEV.brand);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error('Zod errors:', result.error.flatten());
    }
  });

  it('patterns.json tiene exactamente 30 hooks', () => {
    expect(SEED_APEX_DEV.patterns.hooks.length).toBe(30);
  });

  it('patterns.json tiene exactamente 15 formatos', () => {
    expect(SEED_APEX_DEV.patterns.formats.length).toBe(15);
  });

  it('patterns.json tiene exactamente 25 topics', () => {
    expect(SEED_APEX_DEV.patterns.topics.length).toBe(25);
  });

  it('samplePatternsMarkdown no está vacío', () => {
    expect(SEED_APEX_DEV.samplePatternsMarkdown.length).toBeGreaterThan(100);
  });

  it('sampleBrandMarkdown no está vacío', () => {
    expect(SEED_APEX_DEV.sampleBrandMarkdown.length).toBeGreaterThan(100);
  });
});

describe('ALL_SEEDS', () => {
  it('contiene al menos un seed', () => {
    expect(ALL_SEEDS.length).toBeGreaterThanOrEqual(1);
  });

  it('getSeedBySlug devuelve el seed correcto', () => {
    const seed = getSeedBySlug('apex-dev');
    expect(seed).toBeDefined();
    expect(seed?.slug).toBe('apex-dev');
  });

  it('getSeedBySlug devuelve undefined para slug desconocido', () => {
    expect(getSeedBySlug('no-existe')).toBeUndefined();
  });
});
