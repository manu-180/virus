import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parser } from '@virus/shared/viral';
import {
  __setAdminClientForTests,
  type ProjectFile,
} from '../lib/supabase.js';
import {
  markFileStatus,
  persistParsed,
} from './parse-helpers/index.js';
import {
  __setAnthropicClientForNormalizeTests,
  claudeNormalize,
} from './parse-helpers/claude-normalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the seed fixtures once.
const SAMPLE_PATTERNS_MD_PATH = resolve(
  __dirname,
  '../../../../packages/shared/src/viral/seeds/apex-dev/sample-patterns.md',
);
const SAMPLE_PATTERNS_JSON_PATH = resolve(
  __dirname,
  '../../../../packages/shared/src/viral/seeds/apex-dev/patterns.json',
);

const sampleMd = readFileSync(SAMPLE_PATTERNS_MD_PATH, 'utf8');
const samplePatternsJson = JSON.parse(readFileSync(SAMPLE_PATTERNS_JSON_PATH, 'utf8'));

// ---------- 1. Deterministic parser round-trip ----------

describe('parsePatterns (deterministic) — sample-patterns.md round-trip', () => {
  it('parses the seed markdown into a ProjectPatterns with >= 5 hooks', () => {
    const result = parser.parsePatterns({
      source: sampleMd,
      mimeType: 'text/markdown',
      projectId: 'test-project-001',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return; // type narrow

    const data = result.data;

    // ProjectId override works
    expect(data.projectId).toBe('test-project-001');

    // Sanity check threshold (the worker uses >= 5 as the warning gate)
    expect(data.hooks.length).toBeGreaterThanOrEqual(5);

    // Should also have formats and topics
    expect(data.formats.length).toBeGreaterThan(0);
    expect(data.topics.length).toBeGreaterThan(0);

    // Language metadata extracted from frontmatter (the parser strips region
    // suffixes like "-AR" via its `\w+` regex — accept either form).
    expect(['es', 'es-AR']).toContain(data.language);

    // Pacing should have non-default-zero values populated from the doc
    expect(data.pacing.cutEverySec.min).toBeGreaterThan(0);
    expect(data.pacing.musicBpm.max).toBeGreaterThan(0);
  });

  it('matches the seed patterns.json structure on key fields', () => {
    const result = parser.parsePatterns({
      source: sampleMd,
      mimeType: 'text/markdown',
      projectId: 'test-project-001',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The seed JSON has a fixed projectId — we ignore that diff. The parser's
    // language regex strips the region suffix, so md gives us "es" while the
    // JSON seed has "es-AR" — both encode the same language family.
    expect(samplePatternsJson.language.startsWith(result.data.language)).toBe(true);

    // Hook count from md should be in the same ballpark as the seed json.
    // (md lists ~30 hooks; seed json also has many.)
    expect(result.data.hooks.length).toBeGreaterThanOrEqual(
      Math.min(5, samplePatternsJson.hooks.length),
    );
  });
});

// ---------- 2. claudeNormalize with mocked Anthropic client ----------

describe('claudeNormalize — mocked Anthropic client', () => {
  afterEach(() => {
    __setAnthropicClientForNormalizeTests(null);
    vi.restoreAllMocks();
  });

  it('returns ok on a valid mocked patterns response', async () => {
    const validPatterns = {
      projectId: 'p1',
      hooks: [
        {
          id: 'h-1',
          text: 'Hook 1',
          type: 'curiosity_gap',
          estimatedEngagement: 'high',
          bestPlatforms: ['reels'],
          exampleTopics: [],
          language: 'es',
        },
      ],
      formats: [],
      topics: [],
      pacing: {
        audioSpeedMultiplier: { min: 1, max: 1.2 },
        cutEverySec: { min: 3, max: 5 },
        ideaDensitySec: 4,
        musicBpm: { min: 80, max: 110 },
        voiceLufs: -15,
        musicLufs: -20,
        duckingDb: 8,
      },
      visualElements: [],
      ctaTemplates: [],
      hashtags: { reels: [], tiktok: [], shorts: [] },
      captionTemplates: {},
      language: 'es',
      parsedAt: new Date().toISOString(),
    };

    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(validPatterns) }],
        }),
      },
    };
    __setAnthropicClientForNormalizeTests(fakeClient as never);

    const result = await claudeNormalize({
      text: 'some messy text',
      kind: 'viral_patterns',
      projectId: 'p1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.projectId).toBe('p1');
    }
    expect(fakeClient.messages.create).toHaveBeenCalledOnce();

    // Sanity-check: schema cache_control was set on the system block.
    const callArgs = fakeClient.messages.create.mock.calls[0]![0]!;
    expect(callArgs.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('strips ```json``` fences before parsing', async () => {
    const validBrand = {
      projectId: 'p1',
      brandName: 'Acme',
      oneLiner: 'We make things',
      audience: { who: 'devs', where: 'twitter', pains: [] },
      valueProps: [],
      features: [],
      caseStudies: [],
      voiceTone: 'friendly',
      ctas: [],
      doNotSay: [],
      parsedAt: new Date().toISOString(),
    };

    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '```json\n' + JSON.stringify(validBrand) + '\n```',
            },
          ],
        }),
      },
    };
    __setAnthropicClientForNormalizeTests(fakeClient as never);

    const result = await claudeNormalize({
      text: 'foo',
      kind: 'project_info',
      projectId: 'p1',
    });

    expect(result.ok).toBe(true);
  });

  it('returns failure when zod validation fails', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"projectId": "p1"}' }],
        }),
      },
    };
    __setAnthropicClientForNormalizeTests(fakeClient as never);

    const result = await claudeNormalize({
      text: 'foo',
      kind: 'viral_patterns',
      projectId: 'p1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/zod_validation_failed/);
    }
  });

  it('returns failure when claude returns non-JSON', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'sorry, I cannot' }],
        }),
      },
    };
    __setAnthropicClientForNormalizeTests(fakeClient as never);

    const result = await claudeNormalize({
      text: 'foo',
      kind: 'viral_patterns',
      projectId: 'p1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/claude_output_not_valid_json/);
    }
  });
});

// ---------- 3. markFileStatus + persistParsed with mocked Supabase ----------

describe('markFileStatus + persistParsed — mocked Supabase', () => {
  let updateMock: ReturnType<typeof vi.fn>;
  let upsertMock: ReturnType<typeof vi.fn>;
  let eqMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eqMock = vi.fn().mockResolvedValue({ error: null });
    updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    upsertMock = vi.fn().mockResolvedValue({ error: null });

    const fakeClient = {
      from: vi.fn().mockImplementation((_table: string) => ({
        update: updateMock,
        upsert: upsertMock,
      })),
    };

    __setAdminClientForTests(fakeClient as never);
  });

  afterEach(() => {
    __setAdminClientForTests(null);
    vi.restoreAllMocks();
  });

  it('markFileStatus(ok) clears parse_error', async () => {
    await markFileStatus('file-1', 'ok');
    expect(updateMock).toHaveBeenCalledOnce();
    const payload = updateMock.mock.calls[0]![0]!;
    expect(payload.parse_status).toBe('ok');
    expect(payload.parse_error).toBeNull();
    expect(eqMock).toHaveBeenCalledWith('id', 'file-1');
  });

  it('markFileStatus(ok, "warning:too_few_hooks") preserves the warning string', async () => {
    await markFileStatus('file-1', 'ok', 'warning:too_few_hooks');
    const payload = updateMock.mock.calls[0]![0]!;
    expect(payload.parse_status).toBe('ok');
    expect(payload.parse_error).toBe('warning:too_few_hooks');
  });

  it('markFileStatus(failed, error) records the error', async () => {
    await markFileStatus('file-1', 'failed', 'boom');
    const payload = updateMock.mock.calls[0]![0]!;
    expect(payload.parse_status).toBe('failed');
    expect(payload.parse_error).toBe('boom');
  });

  it('persistParsed upserts on (project_id, source_file_id) for viral_patterns', async () => {
    const file: ProjectFile = {
      id: 'file-1',
      project_id: 'proj-1',
      kind: 'viral_patterns',
      version: 1,
      storage_path: 'proj-1/patterns/v1.md',
      mime_type: 'text/markdown',
      parse_status: 'pending',
      created_at: new Date().toISOString(),
    };
    const data = {
      projectId: 'proj-1',
      hooks: [],
      formats: [],
      topics: [],
      pacing: {
        audioSpeedMultiplier: { min: 1, max: 1 },
        cutEverySec: { min: 1, max: 1 },
        ideaDensitySec: 1,
        musicBpm: { min: 1, max: 1 },
        voiceLufs: 0,
        musicLufs: 0,
        duckingDb: 0,
      },
      visualElements: [],
      ctaTemplates: [],
      hashtags: { reels: [], tiktok: [], shorts: [] },
      captionTemplates: {},
      language: 'es',
      parsedAt: new Date().toISOString(),
    };

    await persistParsed(file, data as never);
    expect(upsertMock).toHaveBeenCalledOnce();
    const [row, opts] = upsertMock.mock.calls[0]!;
    expect(row.project_id).toBe('proj-1');
    expect(row.source_file_id).toBe('file-1');
    expect(row.is_current).toBe(true);
    expect(opts).toEqual({ onConflict: 'project_id,source_file_id' });
  });

  it('markFileStatus throws on DB error', async () => {
    const dbError = { message: 'connection refused' };
    eqMock = vi.fn().mockResolvedValue({ error: dbError });
    updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    __setAdminClientForTests({
      from: vi.fn().mockReturnValue({ update: updateMock, upsert: upsertMock }),
    } as never);

    await expect(markFileStatus('file-err', 'ok')).rejects.toThrow(
      'mark_file_status_failed: connection refused',
    );
  });

  it('persistParsed routes project_info to project_brand table', async () => {
    const fromSpy = vi.fn().mockReturnValue({ update: updateMock, upsert: upsertMock });
    __setAdminClientForTests({ from: fromSpy } as never);

    const file: ProjectFile = {
      id: 'file-2',
      project_id: 'proj-2',
      kind: 'project_info',
      version: 1,
      storage_path: 'proj-2/info/v1.md',
      mime_type: 'text/markdown',
      parse_status: 'pending',
      created_at: new Date().toISOString(),
    };
    const data = {
      projectId: 'proj-2',
      brandName: 'X',
      oneLiner: 'Y',
      audience: { who: '', where: '', pains: [] },
      valueProps: [],
      features: [],
      caseStudies: [],
      voiceTone: '',
      ctas: [],
      doNotSay: [],
      parsedAt: new Date().toISOString(),
    };

    await persistParsed(file, data as never);
    expect(fromSpy).toHaveBeenCalledWith('project_brand');
  });
});
