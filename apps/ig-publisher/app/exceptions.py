"""Domain exceptions — caught at the route layer and mapped to HTTP responses."""
from __future__ import annotations

from datetime import datetime
from typing import Any


class PublisherError(Exception):
    """Base for all domain errors raised by this service."""

    code: str = "publisher_error"
    http_status: int = 500

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"error": self.code, "message": self.message}
        if self.details:
            out["details"] = self.details
        return out


class InvalidSignature(PublisherError):
    code = "invalid_signature"
    http_status = 401


class AccountNotFound(PublisherError):
    code = "account_not_found"
    http_status = 404


class AccountDisabled(PublisherError):
    code = "account_disabled"
    http_status = 409


class RateLimitExceeded(PublisherError):
    code = "rate_limit_exceeded"
    http_status = 429

    def __init__(self, message: str, *, retry_after_s: int) -> None:
        super().__init__(message, details={"retry_after_s": retry_after_s})
        self.retry_after_s = retry_after_s


class CircuitOpen(PublisherError):
    code = "circuit_open"
    http_status = 503

    def __init__(self, message: str, *, cooldown_until: datetime) -> None:
        super().__init__(message, details={"cooldown_until": cooldown_until.isoformat()})
        self.cooldown_until = cooldown_until


class ChallengeRequired(PublisherError):
    """IG asked for a challenge (CAPTCHA, email/SMS verification)."""

    code = "challenge_required"
    http_status = 503


class SessionExpired(PublisherError):
    code = "session_expired"
    http_status = 503


class InvalidPayload(PublisherError):
    code = "invalid_payload"
    http_status = 400


class ImageDownloadFailed(PublisherError):
    code = "image_download_failed"
    http_status = 502
