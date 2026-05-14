/**
 * /api/ig-accounts/[id]/schedule
 *
 * GET → returns the auto-publish schedule for the given IG account.
 *       If none exists, returns DEFAULT_SCHEDULE plus { exists: false }.
 *
 * PUT → upserts the schedule. Body:
 *   {
 *     enabled: boolean,
 *     posts_per_day: int,
 *     target_hours_utc: int[],
 *     jitter_minutes: int,
 *     min_hours_between_posts: int,
 *   }
 *
 * Ownership check is done via RLS (the policy on `ig_publication_schedules`
 * scopes by user_id) plus an explicit lookup against `ig_accounts` to give
 * users a friendly 404 instead of an RLS-flavoured 500.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_SCHEDULE,
  type IgPublicationSchedule,
  type UpdateSchedulePayload,
} from '@/lib/types/ig';

// Tables added after the @virus/db types snapshot — bypass typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePayload(raw: unknown): UpdateSchedulePayload | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'invalid_body' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = raw as any;

  if (typeof o.enabled !== 'boolean') return { error: 'enabled_must_be_boolean' };

  if (!Number.isInteger(o.posts_per_day) || o.posts_per_day < 1 || o.posts_per_day > 5) {
    return { error: 'posts_per_day_out_of_range' };
  }

  if (!Array.isArray(o.target_hours_utc) || o.target_hours_utc.length === 0) {
    return { error: 'target_hours_utc_required' };
  }
  if (o.target_hours_utc.length > 24) return { error: 'target_hours_utc_too_long' };
  for (const h of o.target_hours_utc) {
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      return { error: 'target_hours_utc_invalid_hour' };
    }
  }
  // De-dupe to keep the row tidy.
  const dedupedHours = Array.from(new Set<number>(o.target_hours_utc as number[])).sort(
    (a, b) => a - b,
  );

  if (!Number.isInteger(o.jitter_minutes) || o.jitter_minutes < 0 || o.jitter_minutes > 60) {
    return { error: 'jitter_minutes_out_of_range' };
  }

  if (
    !Number.isInteger(o.min_hours_between_posts) ||
    o.min_hours_between_posts < 1 ||
    o.min_hours_between_posts > 24
  ) {
    return { error: 'min_hours_between_posts_out_of_range' };
  }

  return {
    enabled: o.enabled,
    posts_per_day: o.posts_per_day,
    target_hours_utc: dedupedHours,
    jitter_minutes: o.jitter_minutes,
    min_hours_between_posts: o.min_hours_between_posts,
  };
}

// ---------------------------------------------------------------------------
// Shared ownership + account fetch
// ---------------------------------------------------------------------------

type Guard =
  | { error: 'unauthorized' | 'internal_error' | 'not_found'; status: number }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { supabase: any; user: { id: string }; accountId: string };

async function requireOwnedAccount(igAccountId: string): Promise<Guard> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return { error: 'unauthorized', status: 401 };

  const { data: account, error: acctErr } = await (supabase as AnyTable)
    .from('ig_accounts')
    .select('id')
    .eq('id', igAccountId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (acctErr) {
    console.error('[ig-schedule] account lookup error:', acctErr);
    return { error: 'internal_error', status: 500 };
  }
  if (!account) return { error: 'not_found', status: 404 };
  return { supabase, user, accountId: igAccountId };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await requireOwnedAccount(id);
    if ('error' in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { supabase } = guard;

    const { data, error } = await (supabase as AnyTable)
      .from('ig_publication_schedules')
      .select(
        'id, ig_account_id, user_id, enabled, posts_per_day, target_hours_utc, jitter_minutes, min_hours_between_posts, consecutive_failures, last_dispatched_at, last_carousel_id, disabled_reason, created_at, updated_at',
      )
      .eq('ig_account_id', id)
      .maybeSingle();

    if (error) {
      console.error('[GET ig-schedule] error:', error);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        exists: false,
        schedule: {
          ig_account_id: id,
          ...DEFAULT_SCHEDULE,
        },
      });
    }

    return NextResponse.json({
      exists: true,
      schedule: data as IgPublicationSchedule,
    });
  } catch (err) {
    console.error('[GET /api/ig-accounts/[id]/schedule]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT — upsert
// ---------------------------------------------------------------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await requireOwnedAccount(id);
    if ('error' in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { supabase, user } = guard;

    const body = await req.json().catch(() => null);
    const parsed = validatePayload(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // We re-set consecutive_failures + disabled_reason whenever the user
    // re-enables, to give them a clean slate after a reconnect.
    const upsertRow: Record<string, unknown> = {
      ig_account_id: id,
      user_id: user.id,
      enabled: parsed.enabled,
      posts_per_day: parsed.posts_per_day,
      target_hours_utc: parsed.target_hours_utc,
      jitter_minutes: parsed.jitter_minutes,
      min_hours_between_posts: parsed.min_hours_between_posts,
    };
    if (parsed.enabled) {
      upsertRow['consecutive_failures'] = 0;
      upsertRow['disabled_reason'] = null;
    }

    const { data, error } = await (supabase as AnyTable)
      .from('ig_publication_schedules')
      .upsert(upsertRow, { onConflict: 'ig_account_id' })
      .select(
        'id, ig_account_id, user_id, enabled, posts_per_day, target_hours_utc, jitter_minutes, min_hours_between_posts, consecutive_failures, last_dispatched_at, last_carousel_id, disabled_reason, created_at, updated_at',
      )
      .single();

    if (error || !data) {
      console.error('[PUT ig-schedule] upsert failed:', error);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    return NextResponse.json({ schedule: data as IgPublicationSchedule });
  } catch (err) {
    console.error('[PUT /api/ig-accounts/[id]/schedule]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
