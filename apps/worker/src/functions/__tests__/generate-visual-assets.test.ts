/**
 * Tests for generate-visual-assets.
 *
 * Strategy: rather than running Inngest end-to-end, we directly invoke the
 * registered function's handler via its public `inngest.createFunction` shape
 * with mocked `step` + `event`. This is the same lightweight harness used in
 * other Inngest unit tests in the codebase.
 *
 * We mock:
 *  - `@virus/shared/visuals/providers` (Luma + Gemini) — never call real APIs
 *  - The Supabase admin client via `__setAdminClientForTests`
 *  - `inngest.send` to capture downstream events without firing real ones
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __setAdminClientForTests } from '../../lib/supabase.js';

// ---------------------------------------------------------------------------
// Mock the providers + inngest send BEFORE importing the function under test.
//
// vi.mock is hoisted to the top, so we cannot reference top-level variables
// inside the factory. We attach mocks to globalThis and the factory reads from
// there at module-evaluation time.
// ---------------------------------------------------------------------------

// vi.hoisted runs BEFORE all imports (and before vi.mock factories), so the
// mocks defined here are available inside the factories.
const { generateVideoLumaMock, generateImageGeminiMock, inngestSendMock } = vi.hoisted(
  () => ({
    generateVideoLumaMock: vi.fn(),
    generateImageGeminiMock: vi.fn(),
    inngestSendMock: vi.fn(async () => undefined),
  }),
);

vi.mock('@virus/shared/visuals', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@virus/shared/visuals');
  const realProviders = (actual as { providers?: Record<string, unknown> }).providers ?? {};
  return {
    ...actual,
    providers: {
      ...realProviders,
      generateVideoLuma: (...args: unknown[]) => generateVideoLumaMock(...args),
      generateImageGemini: (...args: unknown[]) => generateImageGeminiMock(...args),
    },
  };
});

vi.mock('../../inngest/index.js', async () => {
  const real = await vi.importActual<typeof import('../../inngest/index.js')>(
    '../../inngest/index.js',
  );
  return {
    ...real,
    inngest: new Proxy(real.inngest, {
      get(target, prop) {
        if (prop === 'send') return inngestSendMock;
        return Reflect.get(target, prop);
      },
    }),
  };
});

// Now import the function under test (after vi.mock hoisting).
import { generateVisualAssets, parseAssetChoices } from '../generate-visual-assets.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface FakeRunResult {
  type: 'run';
  id: string;
  result: unknown;
}
interface FakeSendResult {
  type: 'sendEvent';
  id: string;
  payload: { name: string; data: unknown };
}

interface FakeStepLog {
  ran: string[];
  events: Array<{ name: string; data: unknown }>;
}

function makeFakeStep(log: FakeStepLog) {
  return {
    run: async <T>(id: string, fn: () => T | Promise<T>): Promise<T> => {
      log.ran.push(id);
      return await fn();
    },
    sendEvent: async (id: string, payload: { name: string; data: unknown }) => {
      log.events.push(payload);
      return { ids: [id] } as unknown as FakeSendResult;
    },
  };
}

function getHandler(): (args: { event: { data: { videoId: string } }; step: ReturnType<typeof makeFakeStep> }) => Promise<unknown> {
  // Inngest InngestFunction stores the user handler internally; access via
  // the documented public field. Falls back to the closest known shape.
  const fn = generateVisualAssets as unknown as {
    fn?: (args: unknown) => Promise<unknown>;
    opts?: { fn?: (args: unknown) => Promise<unknown> };
    [k: string]: unknown;
  };
  const candidates = [fn.fn, fn.opts?.fn, (fn as Record<string, unknown>)['handler']];
  for (const c of candidates) {
    if (typeof c === 'function') {
      return c as (args: {
        event: { data: { videoId: string } };
        step: ReturnType<typeof makeFakeStep>;
      }) => Promise<unknown>;
    }
  }
  // Last resort: scan own properties for a function with arity >= 1.
  for (const key of Object.keys(fn)) {
    const v = fn[key];
    if (typeof v === 'function' && v.length === 1) {
      return v as (args: {
        event: { data: { videoId: string } };
        step: ReturnType<typeof makeFakeStep>;
      }) => Promise<unknown>;
    }
  }
  throw new Error('cannot locate generateVisualAssets handler');
}

// ---------------------------------------------------------------------------
// Mock supabase client builder
// ---------------------------------------------------------------------------

interface FakeRow {
  table: string;
  data: unknown;
}

interface FakeDBOpts {
  videoRow?: Record<string, unknown> | null;
  projectRow?: Record<string, unknown> | null;
  ideaRow?: Record<string, unknown> | null;
  brandRow?: Record<string, unknown> | null;
  /** existing visual_assets row returned for a (project_id, prompt_hash) read in claimRow */
  existingClaimRow?: Record<string, unknown> | null;
  /** rpc results, keyed by rpc name */
  rpc?: Record<string, unknown>;
  /** Manual asset lookup result by id (visual_assets eq id). */
  manualAssetById?: Record<string, Record<string, unknown> | null>;
  /** findReusableAsset result (visual_assets ordered by last_used_at) */
  reusableAsset?: Record<string, unknown> | null;
  /** Storage upload error (null = success) */
  storageUploadError?: { message: string } | null;
  /** Track inserts for assertions */
  inserts?: FakeRow[];
  /** Track updates for assertions */
  updates?: FakeRow[];
}

function makeFakeAdminClient(opts: FakeDBOpts = {}) {
  opts.inserts = opts.inserts ?? [];
  opts.updates = opts.updates ?? [];

  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    let updateData: unknown = null;
    let selectFields = '';
    let limit = -1;
    let order: { column: string; ascending: boolean } | null = null;

    const api: Record<string, unknown> = {};

    api['select'] = (fields: string) => {
      selectFields = fields;
      return api;
    };
    api['eq'] = (col: string, val: unknown) => {
      filters[col] = val;
      return api;
    };
    api['order'] = (
      column: string,
      o?: { ascending?: boolean; nullsFirst?: boolean },
    ) => {
      order = { column, ascending: o?.ascending ?? true };
      void order; // satisfies linter; unused but tracked for future
      return api;
    };
    api['or'] = () => api;
    api['limit'] = (n: number) => {
      limit = n;
      void limit;
      return api;
    };
    api['maybeSingle'] = async () => {
      const data = resolveSelect(table, filters, opts);
      return { data, error: null };
    };
    api['single'] = async () => {
      const data = resolveSelect(table, filters, opts);
      if (!data) return { data: null, error: { message: 'not_found' } };
      return { data, error: null };
    };
    api['insert'] = (row: unknown) => {
      opts.inserts!.push({ table, data: row });
      return {
        select: () => ({
          single: async () => {
            // Return a row with id derived from the inserted prompt_hash
            const r = row as Record<string, unknown>;
            const id =
              (r['id'] as string | undefined) ??
              `inserted-${(r['prompt_hash'] as string | undefined) ?? Math.random()}`;
            return { data: { id }, error: null };
          },
        }),
        // also support .insert without .select() returning error/data
        then: (onF: (v: { error: null }) => unknown) => onF({ error: null }),
      } as unknown as { select: unknown; then: unknown };
    };
    api['update'] = (data: unknown, _opts?: unknown) => {
      updateData = data;
      // eq() on the chain will be called next
      const updateChain: Record<string, unknown> = {};
      updateChain['eq'] = (col: string, val: unknown) => {
        filters[col] = val;
        opts.updates!.push({ table, data: { fields: updateData, where: { ...filters } } });
        return Promise.resolve({ error: null, count: 1 });
      };
      return updateChain;
    };
    return api;
  };

  return {
    from: builder,
    rpc: async (name: string, _args?: unknown) => {
      const v = opts.rpc?.[name] ?? 0;
      return { data: v, error: null };
    },
    storage: {
      from: () => ({
        upload: async () =>
          opts.storageUploadError
            ? { error: opts.storageUploadError, data: null }
            : { error: null, data: { path: 'ok' } },
      }),
    },
  } as unknown as Parameters<typeof __setAdminClientForTests>[0];
}

function resolveSelect(
  table: string,
  filters: Record<string, unknown>,
  opts: FakeDBOpts,
): unknown {
  if (table === 'videos') return opts.videoRow ?? null;
  if (table === 'projects') return opts.projectRow ?? null;
  if (table === 'video_ideas') return opts.ideaRow ?? null;
  if (table === 'project_brand') return opts.brandRow ?? null;
  if (table === 'visual_assets') {
    // Manual asset lookup by id?
    if (typeof filters['id'] === 'string' && opts.manualAssetById) {
      return opts.manualAssetById[filters['id'] as string] ?? null;
    }
    // findReusableAsset path uses category + theme_color + status='ready' + burned=false
    if (
      filters['status'] === 'ready' &&
      filters['burned'] === false &&
      filters['category']
    ) {
      return opts.reusableAsset ?? null;
    }
    // claimRow read: project_id + prompt_hash
    if (filters['project_id'] && filters['prompt_hash']) {
      return opts.existingClaimRow ?? null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reusable test fixtures
// ---------------------------------------------------------------------------

const baseVideo = {
  id: 'video-1',
  project_id: 'project-1',
  user_id: 'user-1',
  idea_id: 'idea-1',
  template: 'tip',
  status: 'audio',
  theme_color: '#3ECF8E',
  language: 'es',
  script: {
    segments: [
      { index: 0, role: 'hook', voiceover: 'h', startSec: 0, endSec: 1, onScreenText: 'hook text' },
      { index: 1, role: 'reveal', voiceover: 'r', startSec: 1, endSec: 2, onScreenText: 'reveal text' },
      { index: 2, role: 'cta', voiceover: 'c', startSec: 2, endSec: 3, onScreenText: 'cta text' },
    ],
    totalDurationSec: 3,
    recommendedTemplate: 'tip',
    musicMood: 'cinematic',
    themeColor: '#3ECF8E',
  },
  audio_url: null,
  captions: null,
  video_url: null,
  duration_seconds: null,
  caption_instagram: null,
  caption_tiktok: null,
  caption_shorts: null,
  hashtags: null,
  inngest_run_id: null,
  error: null,
  created_at: '2026-05-05T00:00:00Z',
  updated_at: '2026-05-05T00:00:00Z',
};

const baseProject = { id: 'project-1', theme_color: '#3ECF8E' };

const baseIdea = {
  id: 'idea-1',
  metadata: { asset_choices: { hook: { mode: 'fresh' }, reveal: { mode: 'fresh' }, cta: { mode: 'fresh' } } },
};

const baseBrand = { one_liner: 'A delightful product' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generate-visual-assets', () => {
  beforeEach(() => {
    generateVideoLumaMock.mockReset();
    generateImageGeminiMock.mockReset();
    inngestSendMock.mockReset();
    inngestSendMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __setAdminClientForTests(null);
  });

  it('parseAssetChoices: returns all-fresh defaults on missing/invalid input', () => {
    expect(parseAssetChoices(undefined)).toEqual({
      hook: { mode: 'fresh' },
      reveal: { mode: 'fresh' },
      cta: { mode: 'fresh' },
    });
    expect(parseAssetChoices({ asset_choices: 'not-an-object' })).toEqual({
      hook: { mode: 'fresh' },
      reveal: { mode: 'fresh' },
      cta: { mode: 'fresh' },
    });
    expect(
      parseAssetChoices({
        asset_choices: { hook: { mode: 'manual', assetId: '11111111-1111-1111-1111-111111111111' } },
      }),
    ).toMatchObject({
      hook: { mode: 'manual', assetId: '11111111-1111-1111-1111-111111111111' },
      reveal: { mode: 'fresh' },
      cta: { mode: 'fresh' },
    });
  });

  it('happy path: all-fresh produces 3 ready assets and emits assets.generated', async () => {
    generateVideoLumaMock.mockResolvedValue({
      bytes: Buffer.from([0x00]),
      durationSec: 6,
      width: 720,
      height: 1280,
      costUsd: 0.36,
    });
    generateImageGeminiMock.mockResolvedValue({
      bytes: Buffer.from([0x01]),
      width: 1080,
      height: 1920,
      costUsd: 0.04,
    });

    const fakeDB = makeFakeAdminClient({
      videoRow: baseVideo,
      projectRow: baseProject,
      ideaRow: baseIdea,
      brandRow: baseBrand,
      rpc: {
        sum_visual_spend_last_24h_user: 0,
        sum_visual_spend_last_24h_global: 0,
      },
      existingClaimRow: null,
    });
    __setAdminClientForTests(fakeDB);

    const log: FakeStepLog = { ran: [], events: [] };
    const handler = getHandler();
    const result = (await handler({
      event: { data: { videoId: 'video-1' } },
      step: makeFakeStep(log),
    })) as { ok: boolean; assetIds: { hook: string | null; reveal: string | null; cta: string | null } };

    expect(result.ok).toBe(true);
    expect(generateVideoLumaMock).toHaveBeenCalledTimes(2); // hook + cta
    expect(generateImageGeminiMock).toHaveBeenCalledTimes(1); // reveal
    expect(result.assetIds.hook).not.toBeNull();
    expect(result.assetIds.reveal).not.toBeNull();
    expect(result.assetIds.cta).not.toBeNull();

    // emitted assets.generated
    const generated = log.events.find((e) => e.name === 'virus/assets.generated');
    expect(generated).toBeDefined();
  });

  it('spend cap reached: emits assets.generated with all-NULL ids and skips providers', async () => {
    const fakeDB = makeFakeAdminClient({
      videoRow: baseVideo,
      projectRow: baseProject,
      ideaRow: baseIdea,
      brandRow: baseBrand,
      rpc: {
        sum_visual_spend_last_24h_user: 9999,
        sum_visual_spend_last_24h_global: 0,
      },
    });
    __setAdminClientForTests(fakeDB);

    const log: FakeStepLog = { ran: [], events: [] };
    const handler = getHandler();
    const result = (await handler({
      event: { data: { videoId: 'video-1' } },
      step: makeFakeStep(log),
    })) as { ok: boolean; capped?: boolean };

    expect(result.ok).toBe(true);
    expect(result.capped).toBe(true);
    expect(generateVideoLumaMock).not.toHaveBeenCalled();
    expect(generateImageGeminiMock).not.toHaveBeenCalled();

    const generated = log.events.find((e) => e.name === 'virus/assets.generated');
    expect(generated).toBeDefined();
    expect((generated!.data as { assetIds: Record<string, string | null> }).assetIds).toEqual({
      hook: null,
      reveal: null,
      cta: null,
    });
  });

  it('provider error: failing slot resolves to NULL, other slots succeed', async () => {
    generateVideoLumaMock.mockRejectedValueOnce(new Error('luma_failed: capacity'));
    generateVideoLumaMock.mockResolvedValueOnce({
      bytes: Buffer.from([0x00]),
      durationSec: 5,
      width: 720,
      height: 1280,
      costUsd: 0.3,
    });
    generateImageGeminiMock.mockResolvedValue({
      bytes: Buffer.from([0x01]),
      width: 1080,
      height: 1920,
      costUsd: 0.04,
    });

    const fakeDB = makeFakeAdminClient({
      videoRow: baseVideo,
      projectRow: baseProject,
      ideaRow: baseIdea,
      brandRow: baseBrand,
      rpc: {
        sum_visual_spend_last_24h_user: 0,
        sum_visual_spend_last_24h_global: 0,
      },
    });
    __setAdminClientForTests(fakeDB);

    const log: FakeStepLog = { ran: [], events: [] };
    const handler = getHandler();
    const result = (await handler({
      event: { data: { videoId: 'video-1' } },
      step: makeFakeStep(log),
    })) as { ok: boolean; assetIds: { hook: string | null; reveal: string | null; cta: string | null } };

    expect(result.ok).toBe(true);

    // Exactly one slot is null (the one whose Luma call failed).
    const nulls = Object.values(result.assetIds).filter((v) => v === null).length;
    expect(nulls).toBe(1);

    // assets.failed was emitted at least once
    expect(inngestSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'virus/assets.failed' }),
    );
  });

  it('cache hit: claim-row returns existing ready asset, provider not called for that slot', async () => {
    // Pre-populate claim-row read so claimRow returns 'ready'.
    const fakeDB = makeFakeAdminClient({
      videoRow: baseVideo,
      projectRow: baseProject,
      ideaRow: baseIdea,
      brandRow: baseBrand,
      rpc: {
        sum_visual_spend_last_24h_user: 0,
        sum_visual_spend_last_24h_global: 0,
      },
      existingClaimRow: {
        id: 'cached-asset',
        status: 'ready',
        created_at: new Date().toISOString(),
      },
    });
    __setAdminClientForTests(fakeDB);

    const log: FakeStepLog = { ran: [], events: [] };
    const handler = getHandler();
    const result = (await handler({
      event: { data: { videoId: 'video-1' } },
      step: makeFakeStep(log),
    })) as { ok: boolean; assetIds: { hook: string | null; reveal: string | null; cta: string | null } };

    expect(result.ok).toBe(true);
    // All 3 slots should have hit cache → no provider calls.
    expect(generateVideoLumaMock).not.toHaveBeenCalled();
    expect(generateImageGeminiMock).not.toHaveBeenCalled();
    expect(result.assetIds.hook).toBe('cached-asset');
    expect(result.assetIds.reveal).toBe('cached-asset');
    expect(result.assetIds.cta).toBe('cached-asset');
  });

  it('manual asset choice: uses provided assetId without calling provider', async () => {
    const ideaWithManualHook = {
      id: 'idea-1',
      metadata: {
        asset_choices: {
          hook: { mode: 'manual', assetId: '22222222-2222-2222-2222-222222222222' },
          reveal: { mode: 'fresh' },
          cta: { mode: 'fresh' },
        },
      },
    };

    generateVideoLumaMock.mockResolvedValue({
      bytes: Buffer.from([0x00]),
      durationSec: 5,
      width: 720,
      height: 1280,
      costUsd: 0.3,
    });
    generateImageGeminiMock.mockResolvedValue({
      bytes: Buffer.from([0x01]),
      width: 1080,
      height: 1920,
      costUsd: 0.04,
    });

    const fakeDB = makeFakeAdminClient({
      videoRow: baseVideo,
      projectRow: baseProject,
      ideaRow: ideaWithManualHook,
      brandRow: baseBrand,
      rpc: {
        sum_visual_spend_last_24h_user: 0,
        sum_visual_spend_last_24h_global: 0,
      },
      manualAssetById: {
        '22222222-2222-2222-2222-222222222222': {
          id: '22222222-2222-2222-2222-222222222222',
          status: 'ready',
          burned: false,
          category: 'hook',
        },
      },
    });
    __setAdminClientForTests(fakeDB);

    const log: FakeStepLog = { ran: [], events: [] };
    const handler = getHandler();
    const result = (await handler({
      event: { data: { videoId: 'video-1' } },
      step: makeFakeStep(log),
    })) as { ok: boolean; assetIds: { hook: string | null; reveal: string | null; cta: string | null } };

    expect(result.ok).toBe(true);
    expect(result.assetIds.hook).toBe('22222222-2222-2222-2222-222222222222');
    // Luma called only once (CTA), Gemini once (reveal).
    expect(generateVideoLumaMock).toHaveBeenCalledTimes(1);
    expect(generateImageGeminiMock).toHaveBeenCalledTimes(1);
  });
});
