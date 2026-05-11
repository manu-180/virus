# syntax=docker/dockerfile:1.7
# Multi-stage build for the IG Publisher (FastAPI + instagrapi)

# ─── Stage 1: builder ──────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /build

# System deps for Pillow (libjpeg, zlib) + cryptography (build only)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libjpeg62-turbo-dev \
        zlib1g-dev \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --user --no-warn-script-location -r requirements.txt

# ─── Stage 2: runtime ──────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/home/app/.local/bin:$PATH \
    PYTHONPATH=/app

# Runtime libs only (no -dev, no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libjpeg62-turbo \
        zlib1g \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 -s /bin/bash app

WORKDIR /app

# Copy installed Python packages from builder
COPY --from=builder --chown=app:app /root/.local /home/app/.local

# Copy application source
COPY --chown=app:app app ./app
COPY --chown=app:app scripts ./scripts

USER app

# Railway sets $PORT at runtime
EXPOSE 8000

# uvicorn with 2 workers — instagrapi keeps state per-process so we want
# few workers and rely on the per-account locks in DB.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
