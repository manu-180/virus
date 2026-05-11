"""FastAPI entrypoint. Wires up logging, exception handlers, and routes."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import __version__
from .config import get_settings
from .exceptions import PublisherError
from .logging_config import configure_logging, get_logger
from .routes import health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(level=settings.log_level, fmt=settings.log_format)
    log = get_logger("startup")
    log.info(
        "ig_publisher.start",
        version=__version__,
        environment=settings.environment,
        port=settings.port,
    )
    try:
        yield
    finally:
        log.info("ig_publisher.shutdown")


app = FastAPI(
    title="Virus IG Publisher",
    description="Internal service that posts virus-generated carousels to Instagram.",
    version=__version__,
    lifespan=lifespan,
    # No docs in production (internal service)
    docs_url=None if get_settings().is_production else "/docs",
    redoc_url=None,
    openapi_url=None if get_settings().is_production else "/openapi.json",
)


# ── Domain exception → HTTP response ────────────────────────────
@app.exception_handler(PublisherError)
async def publisher_error_handler(_: Request, exc: PublisherError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content=exc.to_dict())


# ── Routes ──────────────────────────────────────────────────────
app.include_router(health.router)

# Carousel and admin routes are wired up in subsequent commits:
# from .routes import carousel, admin
# app.include_router(carousel.router, prefix="/feed")
# app.include_router(admin.router, prefix="/admin")
