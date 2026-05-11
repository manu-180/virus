// Liveness probe — pure "is the Next server alive?" check.
//
// Distinct from /api/health which runs full-stack readiness checks (DB,
// Anthropic, AWS, etc.) and returns 503 if any dependency is unreachable.
// That's the right shape for a status dashboard but the wrong shape for
// a Railway healthcheck: an outage in any one dep would mark the deploy
// unhealthy and block traffic even when Next itself is fine.
//
// Use this path for Railway's `Healthcheck Path` setting.

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true }, { status: 200 });
}
