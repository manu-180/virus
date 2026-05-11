"""HMAC-SHA256 signature verification for incoming requests.

Pattern (matches the worker's ig-publisher TS client):

    body = JSON.stringify(payload)
    sig  = "sha256=" + hmac_sha256(SHARED_SECRET, body).hex()
    headers["X-Sidecar-Signature"] = sig

We verify on the raw request body (not the deserialized JSON) so that any
whitespace difference in the client's serialization wouldn't break things.
"""
from __future__ import annotations

import hashlib
import hmac

from fastapi import Header, HTTPException, Request, status

from .config import get_settings
from .exceptions import InvalidSignature

SIGNATURE_HEADER = "X-Sidecar-Signature"
SIGNATURE_PREFIX = "sha256="


def compute_signature(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"{SIGNATURE_PREFIX}{digest}"


def verify_signature(body: bytes, signature: str | None, secret: str) -> None:
    """Constant-time verification. Raises InvalidSignature on mismatch."""
    if not signature or not signature.startswith(SIGNATURE_PREFIX):
        raise InvalidSignature("missing or malformed X-Sidecar-Signature header")
    expected = compute_signature(body, secret)
    if not hmac.compare_digest(expected, signature):
        raise InvalidSignature("signature mismatch")


async def require_hmac(
    request: Request,
    x_sidecar_signature: str | None = Header(default=None, alias=SIGNATURE_HEADER),
) -> None:
    """FastAPI dependency: enforces a valid HMAC signature on the raw body.

    Use as `Depends(require_hmac)` on protected routes.
    """
    settings = get_settings()
    body = await request.body()
    try:
        verify_signature(body, x_sidecar_signature, settings.ig_publisher_hmac_secret)
    except InvalidSignature as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": exc.code, "message": exc.message},
        ) from exc


async def require_admin_token(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """Gate for /admin/* endpoints. Stricter than HMAC: requires a constant
    token that's distinct from the HMAC secret. If unset in env, all admin
    endpoints are disabled (returns 404).
    """
    settings = get_settings()
    if not settings.ig_publisher_admin_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if not x_admin_token or not hmac.compare_digest(
        x_admin_token, settings.ig_publisher_admin_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_admin_token"},
        )
