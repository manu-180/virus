# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Worker Dockerfile — Inngest serve handler for Railway.
# Build context: monorepo root.
#
# Local build:
#   docker build -f apps/worker/Dockerfile -t virus-worker .
#   docker run -p 3001:3001 --env-file apps/worker/.env.local virus-worker
#
# Railway:
#   - Service Root Directory: `/` (repo root)
#   - Dockerfile Path: `apps/worker/Dockerfile`
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: deps — install pnpm workspace ───────────────────────────────────
FROM node:22-bookworm-slim AS deps

ENV PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH \
    CI=true

# Native module build deps (sharp prebuilds usually work, but keep these as a
# safety net for transitive native installs).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates python3 make g++ libc6-dev \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

# Copy lockfile + all workspace manifests first so the install layer caches.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/ig-publisher/requirements.txt apps/ig-publisher/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/inngest/package.json packages/inngest/
COPY packages/remotion/package.json packages/remotion/

# Install only what the worker needs (and transitive workspace packages).
# --frozen-lockfile guarantees deterministic builds.
# (No --mount=type=cache: Railway's BuildKit rejects unprefixed cache IDs.
#  Railway already caches each Dockerfile layer between deploys, so the speed
#  hit is small.)
RUN pnpm install --frozen-lockfile --filter @virus/worker...

# ─── Stage 2: runtime — minimal image with ffmpeg + sources ───────────────────
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    HOST=0.0.0.0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# ffmpeg = audio post-processing in @virus/shared.
# tini   = correct PID 1 / SIGTERM forwarding for graceful shutdown.
# ca-certificates = HTTPS calls to Supabase / Anthropic / etc.
# node:22-bookworm-slim already ships a non-root `node` user (uid 1000).
# We reuse it instead of useradd'ing a duplicate.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates ffmpeg tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring everything pnpm produced over from the deps stage — this preserves the
# entire pnpm symlink graph (root node_modules + per-workspace node_modules that
# symlink to it). Without the per-workspace node_modules, Node can't resolve
# `tsx`, `@virus/shared`, etc. when running from apps/worker.
COPY --from=deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=deps --chown=node:node /repo/package.json ./package.json
COPY --from=deps --chown=node:node /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps --chown=node:node /repo/tsconfig.base.json ./tsconfig.base.json
COPY --from=deps --chown=node:node /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps --chown=node:node /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps --chown=node:node /repo/packages/db/node_modules ./packages/db/node_modules

# Playwright Chromium for the demo recorder (apps/worker/src/lib/recorder.ts).
# Installed to the shared PLAYWRIGHT_BROWSERS_PATH (set above) as root and BEFORE
# the source COPYs, so the ~120MB browser layer caches across code changes
# instead of re-downloading on every deploy. `--with-deps` pulls Chromium's OS
# libraries via apt. Made world-readable (a+rX) so the runtime `node` user (uid
# 1000) can exec the binary. ffmpeg was already installed above (for audio).
RUN cd /app/apps/worker \
    && node_modules/.bin/playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R a+rX /ms-playwright

# Workspace source code overlaid on top of the node_modules trees (the source
# isn't in the deps stage; it comes from the build context).
COPY --chown=node:node apps/worker/ ./apps/worker/
COPY --chown=node:node packages/shared/ ./packages/shared/
COPY --chown=node:node packages/db/ ./packages/db/

USER node

# Railway injects $PORT at runtime; our server reads it (falls back to 3001).
EXPOSE 3001

# tini → tsx → server.ts. tsx transpiles TS on the fly so cross-workspace
# imports of @virus/* (whose "main" is ./src/index.ts) resolve correctly.
ENTRYPOINT ["/usr/bin/tini", "--"]
WORKDIR /app/apps/worker
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
