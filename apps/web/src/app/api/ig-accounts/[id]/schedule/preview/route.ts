/**
 * GET /api/ig-accounts/[id]/schedule/preview?windows=3
 *
 * Returns the next N upcoming publish windows based on the schedule's
 * current target_hours_utc + jitter_minutes. Pure projection — does NOT
 * consider in-flight publications, daily caps, or cooldowns. Useful for
 * "Próximas publicaciones" preview in the UI.
 *
 * If no schedule exists, uses the defaults from DEFAULT_SCHEDULE.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_SCHEDULE,
  type SchedulePreviewResponse,
} from '@/lib/types/ig';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

const DEFAULT_WINDOW_COUNT = 3;
const MAX_WINDOW_COUNT = 10;

/**
 * Generates the next `count` target instants in UTC given an array of
 * target hours and a starting reference time. Walks day by day until we
 * have enough.
 */
export function computeNextWindows(
  now: Date,
  targetHoursUtc: number[],
  jitterMinutes: number,
  count: number,
): { targetTime: string; jitterMin: string; jitterMax: string }[] {
  if (targetHoursUtc.length === 0) return [];
  const sortedHours = [...targetHoursUtc].sort((a, b) => a - b);

  const result: { targetTime: string; jitterMin: string; jitterMax: string }[] = [];
  // Anchor at the start of the current UTC day.
  const dayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0,
  ));

  for (let offset = 0; offset < 14 && result.length < count; offset++) {
    for (const h of sortedHours) {
      const target = new Date(dayStart.getTime() + offset * 86_400_000 + h * 3_600_000);
      // Skip targets whose window already fully closed.
      if (target.getTime() + jitterMinutes * 60_000 <= now.getTime()) continue;
      const jMin = new Date(target.getTime() - jitterMinutes * 60_000);
      const jMax = new Date(target.getTime() + jitterMinutes * 60_000);
      result.push({
        targetTime: target.toISOString(),
        jitterMin: jMin.toISOString(),
        jitterMax: jMax.toISOString(),
      });
      if (result.length >= count) break;
    }
  }

  return result;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Ownership check on the account.
    const { data: account, error: acctErr } = await (supabase as AnyTable)
      .from('ig_accounts')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (acctErr) {
      console.error('[ig-schedule-preview] account lookup error:', acctErr);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const { data: schedule, error: schedErr } = await (supabase as AnyTable)
      .from('ig_publication_schedules')
      .select('target_hours_utc, jitter_minutes')
      .eq('ig_account_id', id)
      .maybeSingle();

    if (schedErr) {
      console.error('[ig-schedule-preview] schedule lookup error:', schedErr);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    const targetHours = (schedule?.target_hours_utc as number[] | undefined) ??
      DEFAULT_SCHEDULE.target_hours_utc;
    const jitter = (schedule?.jitter_minutes as number | undefined) ??
      DEFAULT_SCHEDULE.jitter_minutes;

    const rawCount = Number(req.nextUrl.searchParams.get('windows') ?? DEFAULT_WINDOW_COUNT);
    const count = Number.isFinite(rawCount)
      ? Math.max(1, Math.min(MAX_WINDOW_COUNT, Math.floor(rawCount)))
      : DEFAULT_WINDOW_COUNT;

    const windows = computeNextWindows(new Date(), targetHours, jitter, count);
    const response: SchedulePreviewResponse = { windows };
    return NextResponse.json(response);
  } catch (err) {
    console.error('[GET /api/ig-accounts/[id]/schedule/preview]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
