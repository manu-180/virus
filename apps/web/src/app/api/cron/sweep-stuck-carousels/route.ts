import { NextRequest, NextResponse } from 'next/server';
import { sweepStuckCarousels } from '@/server/carousel/watchdog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron-callable sweep that marks every stuck carousel as failed.
 *
 * Designed to be hit by an external scheduler (Vercel/Railway cron, GitHub
 * Actions, Inngest scheduled function, or even a curl from a cheap monitor).
 * Idempotent: running it twice in a row is harmless because each row is
 * CAS-guarded on status.
 *
 * Auth: requires `Authorization: Bearer $CRON_SECRET` OR `?token=...` query.
 * If `CRON_SECRET` env is unset, the route refuses to run (so we never expose
 * a sweep to unauthenticated callers).
 *
 * GET and POST behave identically — GET is provided so Vercel-style cron
 * triggers (which only do GET) can call it.
 */
async function handle(req: NextRequest) {
  const expected = process.env['CRON_SECRET'];
  if (!expected) {
    return NextResponse.json(
      { error: 'cron_disabled', hint: 'set CRON_SECRET env var to enable' },
      { status: 503 },
    );
  }

  const header = req.headers.get('authorization');
  const headerToken = header?.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null;
  const queryToken = req.nextUrl.searchParams.get('token');
  const presented = headerToken ?? queryToken;

  if (presented !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof sweepStuckCarousels>>;
  try {
    result = await sweepStuckCarousels(200);
  } catch (err) {
    console.error('[cron:sweep-stuck-carousels] failed:', err);
    return NextResponse.json(
      { error: 'sweep_failed', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }

  console.log(JSON.stringify({
    route: 'cron/sweep-stuck-carousels',
    inspected: result.inspected,
    failed: result.failed.length,
    failedIds: result.failed,
    ms: Date.now() - startedAt,
  }));

  return NextResponse.json({
    ok: true,
    inspected: result.inspected,
    failed: result.failed.length,
    failedIds: result.failed,
  });
}

export const GET = handle;
export const POST = handle;
