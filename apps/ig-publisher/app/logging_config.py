"""Structured logging with structlog. JSON in prod, pretty console in dev."""
from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(*, level: str = "INFO", fmt: str = "json") -> None:
    """Configure both stdlib logging and structlog with consistent format."""
    log_level = getattr(logging, level.upper(), logging.INFO)

    # Reset root handlers (Railway / uvicorn add their own)
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
        force=True,
    )

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if fmt == "json":
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Quiet down noisy libraries
    for noisy in ("httpx", "httpcore", "urllib3", "instagrapi.mixins.private"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name) if name else structlog.get_logger()
