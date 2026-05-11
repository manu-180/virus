# Deployment Guide

End-to-end guide for running Virus **always-on in production**. The pipeline
is split across three platforms — each is responsible for one piece:

| Service          | Where             | What it does                                                |
| ---------------- | ----------------- | ----------------------------------------------------------- |
| Web (Next.js)    | **Vercel**        | UI + API routes, dispatches Inngest events                  |
| Worker (Node)    | **Railway**       | Receives Inngest webhooks, runs all background pipelines    |
| IG Publisher     | **Railway**       | FastAPI service that posts carousels to Instagram          |
| Event bus        | **Inngest Cloud** | Routes events from web → worker, retries, observability     |
| Database         | **Supabase**      | Postgres + Auth + Storage (already running)                |
| Video rendering  | **AWS Lambda**    | Remotion render farm (already deployed)                    |

Once configured, **you never run anything locally for production use**. The
local dev setup (`pnpm dev:full`) remains for development only.

---

## 1. Inngest Cloud setup

This is the glue between Vercel and Railway. Without it, events from the web
have nowhere to go.

1. Go to https://app.inngest.com and sign in.
2. Create a new app called `virus` (or use an existing environment).
3. In the **Production** environment, open **Manage → Event Keys** and copy
   the value. This is your `INNGEST_EVENT_KEY`.
4. Open **Manage → Signing Key** and copy that too. This is
   `INNGEST_SIGNING_KEY` — only the worker needs it.

> Inngest's free plan covers up to 50k executions / month with 7-day history,
> which is plenty for early production traffic.

---

## 2. Worker on Railway

The worker is a Node process that exposes `/api/inngest` (for Inngest Cloud
to call) and `/health` (for Railway healthchecks).

### 2.1 Create the service

1. https://railway.app → **New Project → Deploy from GitHub repo**.
2. Pick `manu-180/virus`.
3. After the repo is linked, **Settings → Service**:
   - **Root Directory**: `/` (repo root — the Dockerfile needs access to
     `packages/*`)
   - **Builder**: Dockerfile
   - **Dockerfile Path**: `apps/worker/Dockerfile`
   - **Watch Paths** (optional, reduces noise): `apps/worker/**`,
     `packages/shared/**`, `packages/db/**`, `packages/inngest/**`
4. Rename the service to `virus-worker` so internal DNS is predictable.

### 2.2 Configure environment variables

In **Variables**, paste these (values from Supabase / Inngest / etc.):

```
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_PROJECT_REF=...

ANTHROPIC_API_KEY=...
GOOGLE_AI_API_KEY=...
LUMA_API_KEY=...
FAL_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ASSEMBLYAI_API_KEY=...

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
REMOTION_LAMBDA_FUNCTION_NAME=...
REMOTION_S3_BUCKET=...
REMOTION_SERVE_URL=...

INNGEST_EVENT_KEY=...      # from step 1
INNGEST_SIGNING_KEY=...    # from step 1

VISUAL_ASSETS_BUCKET=visual-assets
ASSETS_ENABLED=true

NODE_ENV=production
```

> Railway provides `$PORT` automatically — don't set it yourself.

### 2.3 Expose a public URL

In **Settings → Networking** click **Generate Domain**. Railway returns
something like `virus-worker-production.up.railway.app`. Copy that URL.

### 2.4 Deploy

Push to `main` or trigger a deploy from the dashboard. Watch the logs:
you should see `[worker] listening on :PORT — Inngest serve at /api/inngest`.

Verify the deploy is healthy:

```bash
curl https://virus-worker-production.up.railway.app/health
# → {"ok":true,"functions":17}
```

### 2.5 Register the worker with Inngest Cloud

1. https://app.inngest.com → your env → **Apps → Sync new app**.
2. URL: `https://virus-worker-production.up.railway.app/api/inngest`
3. Click **Sync**. Within a few seconds Inngest pulls the function list and
   the app shows green.

> If the sync fails with a signing-key error, double-check `INNGEST_SIGNING_KEY`
> in Railway matches the one in Inngest Cloud.

---

## 3. IG Publisher on Railway

Already has `apps/ig-publisher/Dockerfile` + `railway.toml` — just point a
Railway service at it.

1. **New service → Deploy from GitHub repo**, same repo.
2. **Settings → Service**:
   - **Root Directory**: `apps/ig-publisher`
   - Railway auto-detects the Dockerfile.
3. **Variables**: see `apps/ig-publisher/.env.example`. At minimum:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `IG_PUBLISHER_HMAC_SECRET` (must match the web's value)
   - `IG_PUBLISHER_ADMIN_TOKEN`
4. **Settings → Networking → Generate Domain** (or use Railway internal DNS
   from the web service: `ig-publisher.railway.internal:8000`).

Healthcheck `/health` is already configured in `railway.toml`.

---

## 4. Web on Vercel

1. https://vercel.com → **Add New → Project**, import `manu-180/virus`.
2. Vercel auto-detects Next.js + reads `vercel.json` from the repo root.
3. **Settings → Environment Variables** (Production scope):

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...

   ANTHROPIC_API_KEY=...
   GOOGLE_AI_API_KEY=...   # used by carousel preview routes

   INNGEST_EVENT_KEY=...   # SAME value as the worker

   IG_PUBLISHER_HMAC_SECRET=...
   IG_PUBLISHER_ADMIN_TOKEN=...
   IG_PUBLISHER_URL=https://ig-publisher-production.up.railway.app

   NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>
   NODE_ENV=production
   ```

4. Deploy. Vercel returns your domain (e.g. `virus.vercel.app`).

> The web app does **not** need `INNGEST_SIGNING_KEY` — it only publishes
> events; it never receives webhooks from Inngest.

---

## 5. End-to-end verification

Once all three services are deployed:

1. Open your Vercel domain → log in.
2. Create a new carousel.
3. Watch progress through the status pills (`pending` → `generating_slides`
   → `composing` → `generating_captions` → `ready`).
4. In Inngest Cloud → **Runs**, you should see each function execute.
5. In Railway → worker logs, you should see `[worker]` log lines for each
   step.

If a step stalls:

- **Stuck in `pending`** → web couldn't reach Inngest Cloud. Check
  `INNGEST_EVENT_KEY` on Vercel.
- **Stuck mid-pipeline** → worker isn't reachable or signing key is wrong.
  Check Inngest Cloud → Apps → your worker is green; check Railway logs.
- **Function fails with `Cannot find package '@virus/...'`** → the worker
  Dockerfile didn't copy a package. Re-deploy after pulling the latest
  Dockerfile.

---

## 6. Cost expectations

| Service    | Free tier               | Paid tier (when you outgrow free)         |
| ---------- | ----------------------- | ----------------------------------------- |
| Vercel     | Hobby (free)            | $20 / mo Pro                              |
| Railway    | $5 trial credit         | Hobby $5 / mo + usage (~$3–8 / mo worker) |
| Inngest    | 50k executions / mo     | $20 / mo for 1M executions                |
| Supabase   | 500 MB DB, 1 GB storage | $25 / mo Pro                              |

For the early stage you'll likely stay under $15/mo total (Railway worker +
Vercel free + Inngest free + Supabase free).

---

## 6.5 Operations: stuck carousels & diagnostics

The carousel pipeline has three layers of defense against stuck rows
(see `apps/web/src/server/carousel/watchdog.ts` for thresholds):

| Layer | Where | When it fires | Catches |
| --- | --- | --- | --- |
| Detail watchdog | Web `GET /api/carousels/[id]` | When the user opens a stuck carousel | Single-row clean-up while user is browsing |
| List sweep | Web `GET /api/carousels` | Every visit to the carousels list | Stuck rows the user never reopens |
| Cron sweep | Web `GET /api/cron/sweep-stuck-carousels` | External scheduler (cron-job.org, Railway cron, GitHub Actions) | Background coverage when nobody is browsing |
| Inngest sweep | Worker scheduled function `sweep-stuck-carousels` | Every 2 min, **only if the worker is up** | Defense-in-depth |

### Set up the cron sweep (recommended)

1. Pick a random secret and set it on the web's Railway service:
   ```
   CRON_SECRET=<a random 40+ char string>
   ```
2. Schedule any external service to hit the endpoint every 2–5 minutes:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://<your-web-domain>/api/cron/sweep-stuck-carousels
   ```
   Returns `{ ok, inspected, failed, failedIds }`.

### Diagnostic endpoint

Set `DIAG_TOKEN` on the web and call:

```bash
curl "https://<your-web-domain>/api/diag/inngest?token=$DIAG_TOKEN"
```

The response tells you:

- Whether the web sees `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.
- Count of carousels currently in each non-terminal status with their age.
- If `INNGEST_WORKER_URL` is configured, a `/health` probe of the worker
  (so you can confirm the worker is reachable from the web).
- The watchdog thresholds in use.

If `workerProbe.ok === false` and the queue shows growing pending rows, the
worker is down or unreachable — check Railway → worker service → logs and
verify Inngest Cloud → Apps still has the worker synced.

---

## 7. Maintenance

- **Updating the worker**: push to `main` → Railway auto-builds & redeploys.
  Active Inngest runs finish on the old container (graceful SIGTERM, 25s
  drain) before the new one takes over.
- **Rolling back**: Railway → Deployments → click any prior deploy → Rollback.
- **Adding a new Inngest function**: just add it to `apps/worker/src/index.ts`
  `functions` array, push, and Inngest Cloud will pick it up on the next sync
  (auto-syncs on deploy if you registered the app in step 2.5).
- **Local dev** still works with `pnpm dev:full` — no production env vars are
  required, and the local Inngest dev server replaces Inngest Cloud.
