"""Health endpoint — public (no HMAC), used by Railway healthcheck."""
from __future__ import annotations

from fastapi import APIRouter

from .. import __version__
from ..config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str | bool]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": "virus-ig-publisher",
        "version": __version__,
        "environment": settings.environment,
    }
