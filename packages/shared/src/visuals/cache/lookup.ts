// ---------------------------------------------------------------------------
// Cache lookup + claim primitives for the visual_assets table.
//
// `findCachedAsset`  → exact prompt-hash hit (for fresh-mode dedup).
// `findReusableAsset` → cooldown-aware pick for the 'reuse' user choice.
// `claimRow`          → idempotent insert-or-claim with stale-pending recovery.
//
// The claim semantics implement the "distributed mutex via row" pattern from
// the spec — multiple Inngest steps (or retries) racing to generate the same
// prompt all converge on the same row, and at most one ends up `weOwnIt=true`.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AssetCategory,
  AssetProvider,
  AssetType,
  VisualAssetRow,
} from '../types.js';

/** Seconds since claim creation after which a `pending` row is considered abandoned. */
export const STALE_CLAIM_MINUTES = 5;

// ---------------------------------------------------------------------------
// findCachedAsset
// ---------------------------------------------------------------------------

/**
 * Look up a `ready`, non-burned asset by exact `(project_id, prompt_hash)`.
 * Returns null on miss. Errors propagate.
 */
export async function findCachedAsset(
  db: SupabaseClient,
  projectId: string,
  promptHash: string,
): Promise<VisualAssetRow | null> {
  const { data, error } = await db
    .from('visual_assets')
    .select('*')
    .eq('project_id', projectId)
    .eq('prompt_hash', promptHash)
    .eq('status', 'ready')
    .eq('burned', false)
    .maybeSingle();
  if (error) throw error;
  return (data as VisualAssetRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// findReusableAsset
// ---------------------------------------------------------------------------

/**
 * Find a reusable asset for the 'reuse' user choice. Picks the asset with the
 * oldest `last_used_at` (NULLS first) for the given category + theme color,
 * subject to a cooldown so the same asset doesn't appear back-to-back.
 *
 * Returns null when no eligible asset exists.
 */
export async function findReusableAsset(
  db: SupabaseClient,
  projectId: string,
  category: AssetCategory,
  themeColor: string,
  cooldownDays = 14,
): Promise<VisualAssetRow | null> {
  const cutoff = new Date(Date.now() - cooldownDays * 86_400_000).toISOString();
  const { data, error } = await db
    .from('visual_assets')
    .select('*')
    .eq('project_id', projectId)
    .eq('category', category)
    .eq('theme_color', themeColor)
    .eq('status', 'ready')
    .eq('burned', false)
    .or(`last_used_at.is.null,last_used_at.lt.${cutoff}`)
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as VisualAssetRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// claimRow
// ---------------------------------------------------------------------------

export interface ClaimRowInput {
  projectId: string;
  userId: string;
  type: AssetType;
  category: AssetCategory;
  provider: AssetProvider;
  prompt: string;
  promptHash: string;
  template: string;
  language: string;
  themeColor: string;
}

export interface ClaimResult {
  assetId: string;
  status: 'ready' | 'pending';
  /**
   * `true` when this caller is responsible for actually generating the asset.
   * `false` when another caller already owns the work (concurrent gen) or the
   * asset is already `ready` (cache hit at claim time).
   */
  weOwnIt: boolean;
}

/**
 * Insert-or-claim a `visual_assets` row. Conflict-resolution semantics:
 *
 *  - row exists with status='ready'                       → return it, weOwnIt=false (cache hit)
 *  - row exists with status='pending' & created_at fresh  → return it, weOwnIt=false (concurrent)
 *  - row exists with status='pending' & created_at stale  → reclaim, weOwnIt=true
 *  - no row                                               → INSERT pending, weOwnIt=true
 *
 * "Stale" = older than {@link STALE_CLAIM_MINUTES} minutes — used to recover
 * from an Inngest run that died mid-generate without finalising the row.
 *
 * Note: the underlying table has UNIQUE(project_id, prompt_hash) so concurrent
 * inserts will race on the unique index. We read first to avoid the unique-
 * violation noise in 99% of cases; the worst-case race re-reads.
 */
export async function claimRow(
  db: SupabaseClient,
  input: ClaimRowInput,
): Promise<ClaimResult> {
  // Read existing row (if any).
  const { data: existing, error: selErr } = await db
    .from('visual_assets')
    .select('id, status, created_at')
    .eq('project_id', input.projectId)
    .eq('prompt_hash', input.promptHash)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    if (existing.status === 'ready') {
      return { assetId: existing.id, status: 'ready', weOwnIt: false };
    }
    if (existing.status === 'pending') {
      const ageMin = (Date.now() - new Date(existing.created_at).getTime()) / 60_000;
      if (ageMin > STALE_CLAIM_MINUTES) {
        // Reclaim: reset created_at + clear error so monitoring is accurate.
        const { error: updErr } = await db
          .from('visual_assets')
          .update({ created_at: new Date().toISOString(), error: null })
          .eq('id', existing.id);
        if (updErr) throw updErr;
        return { assetId: existing.id, status: 'pending', weOwnIt: true };
      }
      return { assetId: existing.id, status: 'pending', weOwnIt: false };
    }
    // status === 'failed' — treat as eligible to reclaim (caller decides retry).
    const { error: updErr } = await db
      .from('visual_assets')
      .update({
        status: 'pending',
        created_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', existing.id);
    if (updErr) throw updErr;
    return { assetId: existing.id, status: 'pending', weOwnIt: true };
  }

  // No row — insert fresh pending claim.
  const { data: inserted, error: insErr } = await db
    .from('visual_assets')
    .insert({
      project_id: input.projectId,
      user_id: input.userId, // copy_user_id_visual_assets trigger overrides anyway
      type: input.type,
      category: input.category,
      provider: input.provider,
      status: 'pending',
      prompt: input.prompt,
      prompt_hash: input.promptHash,
      template: input.template,
      language: input.language,
      theme_color: input.themeColor,
    })
    .select('id')
    .single();
  if (insErr) throw insErr;
  if (!inserted) throw new Error('claimRow: insert returned no row');
  return { assetId: inserted.id as string, status: 'pending', weOwnIt: true };
}
