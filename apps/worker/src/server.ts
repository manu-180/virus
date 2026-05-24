import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env.local'), override: true });

// Deploy marker: the previous Railway watch paths were configured to track
// only apps/worker/**, so changes that lived purely in packages/shared/**
// were silently skipped ("No changes to watched files"). Touching this file
// alongside shared-package changes forces a worker redeploy when the new code
// needs to land in production. If you see this marker comment alone in a
// commit, the diff in packages/shared is the real payload.
//
// 2026-05-23 redeploy: bundles the instagram-graph waitForContainerReady fix
// for Meta's status_code endpoint regression that started rejecting Page
// tokens with GraphMethodException on 2026-05-22.

import http from 'node:http';
import { serve } from 'inngest/node';
import { inngest, functions } from './index.js';

// Railway / Render / Fly inject $PORT. Local dev uses $WORKER_PORT (3002).
const PORT = Number(process.env['PORT'] ?? process.env['WORKER_PORT'] ?? 3001);

/**
 * HTTP entrypoint. Routes:
 *   - GET  /health, /healthz   → 200 JSON (Railway healthcheck)
 *   - GET  /                   → small banner (browser sanity-check)
 *   - ANY  /api/inngest[/...]  → Inngest Cloud sync + invocation webhook
 *   - else                     → 404
 *
 * The Inngest handler is mounted only under /api/inngest so other paths don't
 * leak introspection data and 404 cleanly.
 */
const inngestHandler = serve({ client: inngest, functions: [...functions] });

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (url === '/health' || url === '/healthz') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, functions: functions.length }));
    return;
  }

  if (url === '/' || url === '') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`virus-worker — ${functions.length} Inngest functions registered\n`);
    return;
  }

  if (
    url === '/api/inngest' ||
    url.startsWith('/api/inngest?') ||
    url.startsWith('/api/inngest/')
  ) {
    inngestHandler(req, res);
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'not_found', path: url }));
});

server.listen(PORT, () => {
  console.log(
    `[worker] listening on :${PORT} — Inngest serve at /api/inngest, health at /health (${functions.length} functions)`,
  );
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
// Railway sends SIGTERM, then SIGKILL after ~30s. Drain in-flight requests so
// we don't drop an Inngest invocation mid-step.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}, draining…`);
  server.close((err) => {
    if (err) {
      console.error('[worker] error during shutdown', err);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[worker] drain timeout — forcing exit');
    process.exit(1);
  }, 25_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Don't crash the worker on async leaks — Inngest's step runner retries.
process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[worker] uncaughtException', err);
});
