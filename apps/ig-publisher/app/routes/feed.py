"""POST /feed/carousel — publish a carousel album to Instagram.

Auth: HMAC-SHA256 on the raw body (`X-Sidecar-Signature`).

Body:
    {
      "account_id": "<uuid>",
      "image_urls": ["https://...", ... 2-10 entries],
      "caption":   "string (≤2200 chars)",
      "first_comment": "string | null",
      "idempotency_key": "string (typically the ig_publications.id)"
    }

Response (200):
    { "ig_media_id": "...", "ig_permalink": "https://www.instagram.com/p/CODE/" }

Errors:
    400 invalid_payload, 404 account_not_found, 409 account_disabled,
    429 rate_limit_exceeded, 502 image_download_failed, 503 challenge_required |
    session_expired, 500 publisher_error.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..auth import require_hmac
from ..exceptions import InvalidPayload
from ..logging_config import get_logger
from ..publish import (
    PublishResult,
    publish_carousel,
    request_from_payload,
)

router = APIRouter(tags=["feed"])
log = get_logger("routes.feed")


@router.post("/carousel")
async def publish_carousel_route(
    request: Request,
    _hmac: None = Depends(require_hmac),
) -> dict:
    """Publish one carousel to Instagram. Idempotent via Idempotency-Key body field."""
    try:
        payload = await request.json()
    except Exception as exc:  # noqa: BLE001 — fastapi.json() raises bare json.JSONDecodeError
        raise InvalidPayload(f"body is not valid JSON: {exc}") from exc

    req = request_from_payload(payload)

    log.info(
        "feed.publish_received",
        account_id=str(req.account_id),
        slide_count=len(req.image_urls),
        idempotency_key=req.idempotency_key,
    )

    result: PublishResult = publish_carousel(req)
    return {
        "ig_media_id": result.ig_media_id,
        "ig_permalink": result.ig_permalink,
    }
