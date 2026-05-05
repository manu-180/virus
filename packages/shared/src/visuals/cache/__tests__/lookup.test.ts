import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  STALE_CLAIM_MINUTES,
  claimRow,
  findCachedAsset,
  findReusableAsset,
} from '../lookup.js';
import type { ClaimRowInput } from '../lookup.js';

// ---------------------------------------------------------------------------
// Mock builder.
//
// Supabase queries are chained: db.from('t').select(...).eq(...).maybeSingle()
// We model each chain as a thenable that returns a pre-rigged final result.
// ---------------------------------------------------------------------------

type FinalResult = { data: unknown; error: unknown };

interface ChainMock {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

/**
 * Build a chain mock where every chained method returns the chain itself, and
 * the terminal `maybeSingle` / `single` returns the rigged result.
 *
 * For multi-call sequences (e.g. select THEN insert in `claimRow`), pass an
 * array of results — they'll be consumed in order by terminal calls.
 */
function makeChain(results: FinalResult[]): {
  chain: ChainMock;
  from: ReturnType<typeof vi.fn>;
} {
  const queue = [...results];
  const consume = (): FinalResult => {
    const r = queue.shift();
    if (!r) throw new Error('chain mock: no more rigged results queued');
    return r;
  };

  const chain = {} as ChainMock;
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => consume());
  chain.single = vi.fn(async () => consume());
  // insert/update return the chain so .select().single() works after them
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);

  // For .update().eq() pattern that does NOT terminate in maybeSingle (just returns void),
  // make .eq itself awaitable as a final no-op success when called directly.
  // We override eq to return a thenable wrapper if used as the terminal.
  const baseEq = chain.eq;
  chain.eq = vi.fn((...args: unknown[]) => {
    const result = baseEq(...args);
    // Decorate the chain with a `then` so `await db.from().update().eq(...)` resolves.
    // Only consume from queue if the user actually awaits it; otherwise it stays a chain.
    return new Proxy(result, {
      get(target, prop) {
        if (prop === 'then') {
          return (resolve: (v: FinalResult) => void) => {
            // peek the next queued result and use it for the await
            resolve(consume());
          };
        }
        return target[prop as keyof typeof target];
      },
    });
  });

  const from = vi.fn(() => chain);
  return { chain, from };
}

function makeDb(results: FinalResult[]): { db: SupabaseClient; from: ReturnType<typeof vi.fn> } {
  const { from } = makeChain(results);
  // Cast to SupabaseClient — only `from` is used in the code under test.
  const db = { from } as unknown as SupabaseClient;
  return { db, from };
}

// ---------------------------------------------------------------------------
// findCachedAsset
// ---------------------------------------------------------------------------

describe('findCachedAsset', () => {
  it('returns the row on a hit', async () => {
    const row = { id: 'asset-1', status: 'ready', burned: false };
    const { db } = makeDb([{ data: row, error: null }]);
    const out = await findCachedAsset(db, 'proj-1', 'hash-abc');
    expect(out).toEqual(row);
  });

  it('returns null on a miss', async () => {
    const { db } = makeDb([{ data: null, error: null }]);
    const out = await findCachedAsset(db, 'proj-1', 'hash-abc');
    expect(out).toBeNull();
  });

  it('throws when supabase reports an error', async () => {
    const { db } = makeDb([{ data: null, error: { message: 'boom' } }]);
    await expect(findCachedAsset(db, 'proj-1', 'hash-abc')).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// findReusableAsset
// ---------------------------------------------------------------------------

describe('findReusableAsset', () => {
  it('returns the oldest reusable row when one exists', async () => {
    const row = { id: 'asset-old', last_used_at: null };
    const { db } = makeDb([{ data: row, error: null }]);
    const out = await findReusableAsset(db, 'proj-1', 'hook', '#3ECF8E');
    expect(out).toEqual(row);
  });

  it('returns null when nothing is eligible', async () => {
    const { db } = makeDb([{ data: null, error: null }]);
    const out = await findReusableAsset(db, 'proj-1', 'hook', '#3ECF8E');
    expect(out).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// claimRow
// ---------------------------------------------------------------------------

const baseInput: ClaimRowInput = {
  projectId: 'proj-1',
  userId: 'user-1',
  type: 'video',
  category: 'hook',
  provider: 'luma',
  prompt: 'a developer at a glowing terminal',
  promptHash: 'hash-abc',
  template: 'tip',
  language: 'es-AR',
  themeColor: '#3ECF8E',
};

describe('claimRow', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('returns weOwnIt=false on cache hit (status=ready)', async () => {
    const existing = { id: 'a-1', status: 'ready', created_at: new Date().toISOString() };
    const { db } = makeDb([{ data: existing, error: null }]);
    const out = await claimRow(db, baseInput);
    expect(out).toEqual({ assetId: 'a-1', status: 'ready', weOwnIt: false });
  });

  it('returns weOwnIt=false on fresh concurrent pending claim', async () => {
    const existing = {
      id: 'a-2',
      status: 'pending',
      created_at: new Date(Date.now() - 60_000).toISOString(), // 1 min old (fresh)
    };
    const { db } = makeDb([{ data: existing, error: null }]);
    const out = await claimRow(db, baseInput);
    expect(out).toEqual({ assetId: 'a-2', status: 'pending', weOwnIt: false });
  });

  it('reclaims a stale pending row (>5 min) and returns weOwnIt=true', async () => {
    const stale = {
      id: 'a-3',
      status: 'pending',
      created_at: new Date(Date.now() - (STALE_CLAIM_MINUTES + 1) * 60_000).toISOString(),
    };
    // Sequence: select → returns stale, then update().eq() resolves successfully.
    const { db } = makeDb([
      { data: stale, error: null },
      { data: null, error: null }, // update result
    ]);
    const out = await claimRow(db, baseInput);
    expect(out).toEqual({ assetId: 'a-3', status: 'pending', weOwnIt: true });
  });

  it('reclaims a previously failed row and returns weOwnIt=true', async () => {
    const failed = {
      id: 'a-failed',
      status: 'failed',
      created_at: new Date(Date.now() - 600_000).toISOString(),
    };
    const { db } = makeDb([
      { data: failed, error: null },
      { data: null, error: null }, // update result
    ]);
    const out = await claimRow(db, baseInput);
    expect(out).toEqual({ assetId: 'a-failed', status: 'pending', weOwnIt: true });
  });

  it('inserts a fresh pending row when none exists, returns weOwnIt=true', async () => {
    // select → null, then insert().select().single() → { id }
    const { db } = makeDb([
      { data: null, error: null }, // select miss
      { data: { id: 'a-new' }, error: null }, // insert result
    ]);
    const out = await claimRow(db, baseInput);
    expect(out).toEqual({ assetId: 'a-new', status: 'pending', weOwnIt: true });
  });

  it('throws when select errors', async () => {
    const { db } = makeDb([{ data: null, error: { message: 'select failed' } }]);
    await expect(claimRow(db, baseInput)).rejects.toBeTruthy();
  });

  it('throws when insert errors', async () => {
    const { db } = makeDb([
      { data: null, error: null },
      { data: null, error: { message: 'insert failed' } },
    ]);
    await expect(claimRow(db, baseInput)).rejects.toBeTruthy();
  });
});
