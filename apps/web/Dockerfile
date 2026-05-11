# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Web Dockerfile — Next.js (standalone) for Railway.
# Build context: monorepo root.
#
# Local build:
#   docker build -f apps/web/Dockerfile -t virus-web .
#
# Railway:
#   - Service Root Directory: `/` (repo root)
#   - Dockerfile Path: `apps/web/Dockerfile`
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1

# Native module build deps (sharp + transitive native installs).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates python3 make g++ libc6-dev \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

# Lockfile + every workspace manifest — these go in their own layer so
# the install cache survives source-only edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/ig-publisher/requirements.txt apps/ig-publisher/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/inngest/package.json packages/inngest/
COPY packages/remotion/package.json packages/remotion/

# Install only what @virus/web (and its transitive workspace deps) need.
RUN pnpm install --frozen-lockfile --filter @virus/web...

# Source for the web app and every workspace it depends on.
COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY packages/inngest/ packages/inngest/

# next.config.ts has `output: 'standalone'` so this emits
# apps/web/.next/standalone/{server.js, node_modules, apps/web/server.js}
# plus apps/web/.next/static and apps/web/public for static assets.
RUN pnpm --filter @virus/web build

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=3000

# ca-certificates = HTTPS to Supabase / Anthropic / Inngest.
# tini            = proper PID 1 / SIGTERM forwarding.
# (Uses the pre-existing `node` user/uid 1000 baked into the image.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Standalone output already contains a pruned node_modules + server.js.
# We then overlay the static + public assets that Next leaves outside.
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone/ ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public

USER node

# Railway injects $PORT — server.js (from standalone) reads it via Next.
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
