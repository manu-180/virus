import { describe, it, expect } from 'vitest';
import { computePromptHash } from '../hash.js';
import type { PromptHashInput } from '../hash.js';

const baseInput: PromptHashInput = {
  prompt: 'a developer at a glowing terminal in dim light',
  themeColor: '#3ECF8E',
  provider: 'luma',
  template: 'tip',
  language: 'es-AR',
};

describe('computePromptHash', () => {
  it('produces a 32-char lowercase hex string', async () => {
    const h = await computePromptHash(baseInput);
    expect(h).toHaveLength(32);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic for the same input', async () => {
    const a = await computePromptHash(baseInput);
    const b = await computePromptHash(baseInput);
    expect(a).toBe(b);
  });

  it('normalises themeColor casing (#3ECF8E === #3ecf8e)', async () => {
    const upper = await computePromptHash({ ...baseInput, themeColor: '#3ECF8E' });
    const lower = await computePromptHash({ ...baseInput, themeColor: '#3ecf8e' });
    expect(upper).toBe(lower);
  });

  it('trims whitespace from prompt', async () => {
    const padded = await computePromptHash({ ...baseInput, prompt: '   the prompt   ' });
    const tight = await computePromptHash({ ...baseInput, prompt: 'the prompt' });
    expect(padded).toBe(tight);
  });

  it('changes when prompt content changes', async () => {
    const a = await computePromptHash(baseInput);
    const b = await computePromptHash({ ...baseInput, prompt: 'something else entirely' });
    expect(a).not.toBe(b);
  });

  it('changes when provider changes', async () => {
    const a = await computePromptHash(baseInput);
    const b = await computePromptHash({ ...baseInput, provider: 'gemini' });
    expect(a).not.toBe(b);
  });

  it('changes when template changes', async () => {
    const a = await computePromptHash(baseInput);
    const b = await computePromptHash({ ...baseInput, template: 'hot-take' });
    expect(a).not.toBe(b);
  });

  it('changes when language changes', async () => {
    const a = await computePromptHash(baseInput);
    const b = await computePromptHash({ ...baseInput, language: 'en-US' });
    expect(a).not.toBe(b);
  });

  it('changes when themeColor changes (different color)', async () => {
    const a = await computePromptHash(baseInput);
    const b = await computePromptHash({ ...baseInput, themeColor: '#ff00ff' });
    expect(a).not.toBe(b);
  });
});
