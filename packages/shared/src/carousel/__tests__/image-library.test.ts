import { describe, it, expect, afterEach } from 'vitest';
import {
  getReuseConfig,
  isReusableStrategy,
  resolveImageMode,
  computeStyleFingerprint,
  buildAssetMatchText,
  extractSubjectTags,
  libraryAssetPath,
} from '../image-library.js';
import type { SlideSpec } from '../types.js';
import type { BrandImageProfile, ProjectBrand } from '../../viral/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseBrand: ProjectBrand = {
  projectId: 'proj-1',
  brandName: 'APEX',
  oneLiner: 'Landing pages que convierten',
  audience: { who: 'founders', where: 'LATAM', pains: [] },
  valueProps: [],
  features: [],
  caseStudies: [],
  voiceTone: 'directo',
  ctas: [],
  doNotSay: [],
  parsedAt: '2026-05-09T00:00:00Z',
};

const worldAnchorProfile: BrandImageProfile = {
  mode: 'illustration-3d',
  technique: 'premium 3D render, octane-style',
  subjectStrategy: 'world-anchor',
  composition: 'single hero subject, lots of negative space',
  moodKeywords: ['cinematic', 'premium'],
  negativeVisuals: ['humans', 'text'],
};

const apexBrand: ProjectBrand = {
  ...baseBrand,
  visualStyle: {
    accentColor: '#6366F1',
    secondaryAccent: '#00D4FF',
    backgroundColor: '#050B18',
    vibe: 'tech-premium dark mode',
    imageProfile: worldAnchorProfile,
  },
};

const slide: SlideSpec = {
  idx: 2,
  role: 'insight',
  headline: 'El cache invisible que te frena',
  visualPrompt: 'a shattered geometric prism floating mid-air with glowing cyan fissures',
};

// ---------------------------------------------------------------------------
// getReuseConfig
// ---------------------------------------------------------------------------

describe('getReuseConfig', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to enabled with threshold 0.82 and 7-day cooldown', () => {
    delete process.env['CAROUSEL_IMAGE_REUSE'];
    delete process.env['CAROUSEL_IMAGE_REUSE_THRESHOLD'];
    delete process.env['CAROUSEL_IMAGE_REUSE_COOLDOWN_DAYS'];
    const cfg = getReuseConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.threshold).toBeCloseTo(0.82, 5);
    expect(cfg.cooldownDays).toBe(7);
  });

  it('disables when CAROUSEL_IMAGE_REUSE=false', () => {
    process.env['CAROUSEL_IMAGE_REUSE'] = 'false';
    expect(getReuseConfig().enabled).toBe(false);
  });

  it('clamps the threshold into [0.5, 0.99]', () => {
    process.env['CAROUSEL_IMAGE_REUSE_THRESHOLD'] = '2';
    expect(getReuseConfig().threshold).toBe(0.99);
    process.env['CAROUSEL_IMAGE_REUSE_THRESHOLD'] = '0.1';
    expect(getReuseConfig().threshold).toBe(0.5);
  });

  it('falls back to defaults on unparseable values', () => {
    process.env['CAROUSEL_IMAGE_REUSE_THRESHOLD'] = 'not-a-number';
    process.env['CAROUSEL_IMAGE_REUSE_COOLDOWN_DAYS'] = 'xyz';
    const cfg = getReuseConfig();
    expect(cfg.threshold).toBeCloseTo(0.82, 5);
    expect(cfg.cooldownDays).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// isReusableStrategy / resolveImageMode
// ---------------------------------------------------------------------------

describe('isReusableStrategy', () => {
  it('world-anchor brands are reusable', () => {
    expect(isReusableStrategy(apexBrand)).toBe(true);
  });

  it('standalone brands are reusable', () => {
    const standalone: ProjectBrand = {
      ...apexBrand,
      visualStyle: {
        ...apexBrand.visualStyle,
        imageProfile: { ...worldAnchorProfile, subjectStrategy: 'standalone' },
      },
    };
    expect(isReusableStrategy(standalone)).toBe(true);
  });

  it('brands without an imageProfile (legacy character-anchor) are NOT reusable', () => {
    expect(isReusableStrategy(baseBrand)).toBe(false);
  });

  it('explicit character-anchor brands are NOT reusable', () => {
    const charAnchor: ProjectBrand = {
      ...apexBrand,
      visualStyle: {
        ...apexBrand.visualStyle,
        imageProfile: { ...worldAnchorProfile, subjectStrategy: 'character-anchor' },
      },
    };
    expect(isReusableStrategy(charAnchor)).toBe(false);
  });
});

describe('resolveImageMode', () => {
  it('returns the imageProfile mode when present', () => {
    expect(resolveImageMode(apexBrand)).toBe('illustration-3d');
  });

  it('falls back to photo for legacy brands', () => {
    expect(resolveImageMode(baseBrand)).toBe('photo');
  });
});

// ---------------------------------------------------------------------------
// computeStyleFingerprint
// ---------------------------------------------------------------------------

describe('computeStyleFingerprint', () => {
  it('is deterministic for the same brand', () => {
    expect(computeStyleFingerprint(apexBrand)).toBe(computeStyleFingerprint(apexBrand));
  });

  it('is a 16-char hex string', () => {
    expect(computeStyleFingerprint(apexBrand)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when the visual technique changes (a restyle invalidates imagery)', () => {
    const restyled: ProjectBrand = {
      ...apexBrand,
      visualStyle: {
        ...apexBrand.visualStyle,
        imageProfile: { ...worldAnchorProfile, technique: 'flat pastel vector illustration' },
      },
    };
    expect(computeStyleFingerprint(restyled)).not.toBe(computeStyleFingerprint(apexBrand));
  });

  it('changes when the accent color changes', () => {
    const recolored: ProjectBrand = {
      ...apexBrand,
      visualStyle: { ...apexBrand.visualStyle, accentColor: '#FF0000' },
    };
    expect(computeStyleFingerprint(recolored)).not.toBe(computeStyleFingerprint(apexBrand));
  });

  it('differs between two distinct brands', () => {
    expect(computeStyleFingerprint(apexBrand)).not.toBe(computeStyleFingerprint(baseBrand));
  });
});

// ---------------------------------------------------------------------------
// buildAssetMatchText
// ---------------------------------------------------------------------------

describe('buildAssetMatchText', () => {
  it('combines role, topic, headline and visual prompt', () => {
    const text = buildAssetMatchText(slide, 'cache invalidation en Next.js');
    expect(text).toContain('role: insight');
    expect(text).toContain('topic: cache invalidation en Next.js');
    expect(text).toContain('headline: El cache invisible que te frena');
    expect(text).toContain('scene: a shattered geometric prism');
  });

  it('omits empty topic / headline cleanly', () => {
    const bare: SlideSpec = { idx: 0, role: 'hook', headline: '', visualPrompt: 'a glowing monolith' };
    const text = buildAssetMatchText(bare, '');
    expect(text).toBe('role: hook. scene: a glowing monolith');
  });
});

// ---------------------------------------------------------------------------
// extractSubjectTags
// ---------------------------------------------------------------------------

describe('extractSubjectTags', () => {
  it('extracts content words and drops stopwords', () => {
    const tags = extractSubjectTags('a shattered geometric prism floating with the glowing fissures');
    expect(tags).toContain('shattered');
    expect(tags).toContain('geometric');
    expect(tags).toContain('prism');
    expect(tags).not.toContain('the');
    expect(tags).not.toContain('with');
  });

  it('de-duplicates repeated words', () => {
    const tags = extractSubjectTags('monolith monolith monolith glowing');
    expect(tags.filter((t) => t === 'monolith')).toHaveLength(1);
  });

  it('caps at 10 tags', () => {
    const tags = extractSubjectTags(
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima',
    );
    expect(tags.length).toBeLessThanOrEqual(10);
  });

  it('returns an empty array for an empty prompt', () => {
    expect(extractSubjectTags('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// libraryAssetPath
// ---------------------------------------------------------------------------

describe('libraryAssetPath', () => {
  it('builds a library/{project}/{role}/{id}.png path', () => {
    expect(libraryAssetPath('proj-1', 'hook', 'asset-9')).toBe(
      'library/proj-1/hook/asset-9.png',
    );
  });
});
