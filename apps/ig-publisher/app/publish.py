"""Carousel publishing pipeline.

Flow:
    1. Validate payload (caller is responsible for HMAC).
    2. Load account + secrets via the vault-backed RPCs.
    3. Check + bump the per-account 24h post counter (atomic SQL FOR UPDATE).
    4. Hydrate an instagrapi Client (restore session or fresh login).
    5. Download each image URL to a temp file (instagrapi only accepts local
       paths for album_upload).
    6. Call client.album_upload(paths, caption=...). On success, persist the
       rotated session blob back to Vault.
    7. Translate instagrapi exceptions to domain errors so the API surfaces
       structured JSON to the worker.

The Postgres counter increment is the single source of truth for rate
limiting under concurrent workers. We bump *before* posting so two parallel
publishes can't both slip under the cap; on a post failure we roll the
counter back via mark_post_failed_and_decrement.

Idempotency: callers pass an Idempotency-Key (the ig_publications row id).
The route layer checks ig_publications.status before invoking us — once a
row is in 'published', a retry short-circuits without touching IG.
"""
from __future__ import annotations

import os
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

import httpx

from . import accounts as accounts_module
from . import sessions as sessions_module
from .exceptions import (
    AccountNotFound,
    ChallengeRequired,
    ImageDownloadFailed,
    InvalidPayload,
    PublisherError,
    RateLimitExceeded,
    SessionExpired,
)
from .logging_config import get_logger

if TYPE_CHECKING:
    from instagrapi import Client

log = get_logger("publish")


# ── Domain types ────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class PublishRequest:
    """Validated input. The route layer parses JSON → this."""

    account_id: UUID
    image_urls: list[str]
    caption: str
    first_comment: str | None
    idempotency_key: str  # publication row id, used for traceability + temp dir name

    def validate(self) -> None:
        if len(self.image_urls) < 2 or len(self.image_urls) > 10:
            raise InvalidPayload(
                f"instagram carousels require 2–10 images, got {len(self.image_urls)}"
            )
        if not self.caption.strip():
            raise InvalidPayload("caption is required")
        # IG caps captions at 2200 characters
        if len(self.caption) > 2200:
            raise InvalidPayload(
                f"caption is {len(self.caption)} chars (IG max 2200)"
            )
        if self.first_comment is not None and len(self.first_comment) > 2200:
            raise InvalidPayload("first_comment exceeds IG max (2200 chars)")


@dataclass(frozen=True, slots=True)
class PublishResult:
    """What we return to the caller on success."""

    ig_media_id: str
    ig_permalink: str | None


# ── HTTP image download ─────────────────────────────────────────


_DOWNLOAD_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)


def _download_to_tempfile(url: str, dest_dir: Path, idx: int) -> Path:
    """Stream a single image URL to a temp file. Raises ImageDownloadFailed."""
    suffix = ".jpg"
    # Best-effort: keep .png if the URL hints at it. instagrapi auto-converts
    # to JPEG for IG anyway, but a sensible extension helps debugging.
    if ".png" in url.split("?", 1)[0].lower():
        suffix = ".png"

    path = dest_dir / f"slide-{idx:02d}{suffix}"
    try:
        with httpx.stream("GET", url, timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True) as resp:
            if resp.status_code != 200:
                raise ImageDownloadFailed(
                    f"image download failed (HTTP {resp.status_code}) for slide {idx}",
                    details={"idx": idx, "status": resp.status_code},
                )
            with path.open("wb") as fh:
                for chunk in resp.iter_bytes():
                    fh.write(chunk)
    except httpx.HTTPError as exc:
        raise ImageDownloadFailed(
            f"image download failed for slide {idx}: {exc}",
            details={"idx": idx, "error": str(exc)},
        ) from exc

    if path.stat().st_size == 0:
        raise ImageDownloadFailed(
            f"image download for slide {idx} produced an empty file",
            details={"idx": idx},
        )
    return path


# ── IG call wrapper ─────────────────────────────────────────────


def _album_upload(
    client: "Client",
    paths: list[Path],
    caption: str,
) -> dict:
    """Call instagrapi.album_upload. Translate exceptions → domain errors.

    Returns the raw media dict from instagrapi for the caller to extract id/code.
    """
    # Local import keeps test suites from pulling all of instagrapi.
    from instagrapi.exceptions import (
        ChallengeRequired as IgChallengeRequired,
        ClientError,
        LoginRequired,
        MediaError,
        PleaseWaitFewMinutes,
    )

    path_strs = [str(p) for p in paths]
    try:
        media = client.album_upload(path_strs, caption=caption)
    except IgChallengeRequired as exc:
        raise ChallengeRequired("instagram challenge required during upload") from exc
    except LoginRequired as exc:
        raise SessionExpired("session expired during upload") from exc
    except PleaseWaitFewMinutes as exc:
        # IG asked for a cooldown — surface as rate limit so worker retries later.
        raise RateLimitExceeded(
            "instagram asked us to wait before next upload",
            retry_after_s=15 * 60,
        ) from exc
    except MediaError as exc:
        raise InvalidPayload(f"instagram rejected media: {exc}") from exc
    except ClientError as exc:
        raise SessionExpired(f"upload failed: {exc}") from exc

    # instagrapi returns a Media pydantic model
    if hasattr(media, "model_dump"):
        return media.model_dump()
    if hasattr(media, "dict"):
        return media.dict()
    # Already a dict
    return dict(media)  # type: ignore[arg-type]


def _post_first_comment(client: "Client", media_id: str, text: str) -> None:
    """Best-effort first comment. We swallow errors — a missed comment must
    not flip the whole publication to 'failed'."""
    from instagrapi.exceptions import ClientError

    try:
        client.media_comment(media_id, text)
    except ClientError as exc:
        log.warning("publish.first_comment_failed", media_id=media_id, error=str(exc))


# ── Main entry point ────────────────────────────────────────────


def publish_carousel(req: PublishRequest) -> PublishResult:
    """Publish a carousel for one account. Synchronous — the worker is the one
    that retries / backs off."""
    req.validate()

    # 1. Load account (raises AccountNotFound / AccountDisabled)
    account = accounts_module.require_active_account(req.account_id)

    # 2. Decrypt secrets
    secrets = accounts_module.get_account_secrets(req.account_id)

    # 3. Atomic counter bump
    if not accounts_module.try_increment_post_count(req.account_id):
        raise RateLimitExceeded(
            f"daily limit of {account.daily_post_limit} posts reached for @{account.ig_username}",
            retry_after_s=60 * 60,
        )

    # 4. Login / restore session
    client = sessions_module.login_for_account(
        req.account_id,
        secrets,
        persist_session=accounts_module.update_session_blob,
    )

    # 5. Download images to a per-publication temp dir
    base_dir = Path(os.environ.get("DOWNLOAD_DIR", tempfile.gettempdir()))
    base_dir.mkdir(parents=True, exist_ok=True)
    # Use idempotency_key as subdir to keep retries colocated and easy to clean up
    work_dir = base_dir / f"pub-{req.idempotency_key}"
    work_dir.mkdir(parents=True, exist_ok=True)

    downloaded: list[Path] = []
    try:
        for idx, url in enumerate(req.image_urls):
            downloaded.append(_download_to_tempfile(url, work_dir, idx))

        log.info(
            "publish.uploading",
            account_id=str(req.account_id),
            ig_username=account.ig_username,
            slide_count=len(downloaded),
            idempotency_key=req.idempotency_key,
        )

        # 6. Upload
        media = _album_upload(client, downloaded, req.caption)

        media_id = str(media.get("id") or media.get("pk") or "")
        if not media_id:
            raise PublisherError("instagram returned no media id")

        code = media.get("code")
        permalink = f"https://www.instagram.com/p/{code}/" if code else None

        # 7. Persist rotated session
        try:
            sessions_module.persist_current_session(
                req.account_id,
                client,
                persist_session=accounts_module.update_session_blob,
            )
        except Exception as exc:  # noqa: BLE001
            # Session persistence failure is not fatal — log and continue.
            log.warning(
                "publish.session_persist_failed",
                account_id=str(req.account_id),
                error=str(exc),
            )

        # 8. Best-effort first comment
        if req.first_comment and req.first_comment.strip():
            _post_first_comment(client, media_id, req.first_comment.strip())

        log.info(
            "publish.success",
            account_id=str(req.account_id),
            ig_username=account.ig_username,
            media_id=media_id,
            permalink=permalink,
        )
        return PublishResult(ig_media_id=media_id, ig_permalink=permalink)

    except ChallengeRequired as exc:
        # Drop cached client so the next attempt forces a fresh login, and
        # flip the account to 'challenge' so the user has to re-onboard.
        sessions_module.clear_cache(req.account_id)
        try:
            accounts_module.mark_status(
                req.account_id, "challenge", last_error=str(exc)
            )
        except Exception:  # noqa: BLE001
            log.warning("publish.mark_challenge_failed", account_id=str(req.account_id))
        raise
    except PublisherError:
        # Any other IG-side failure: drop client so the next attempt forces
        # a fresh login. Don't change account status — the worker will retry.
        sessions_module.clear_cache(req.account_id)
        raise
    finally:
        # Best-effort cleanup. Railway's /tmp is wiped between restarts anyway,
        # but cleaning eagerly keeps disk usage bounded under heavy traffic.
        for p in downloaded:
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
        try:
            work_dir.rmdir()
        except OSError:
            pass


def _account_id_from_str(raw: str) -> UUID:
    try:
        return UUID(raw)
    except (ValueError, AttributeError) as exc:
        raise InvalidPayload(f"invalid account_id: {raw!r}") from exc


def request_from_payload(payload: dict) -> PublishRequest:
    """Validate + coerce the raw JSON body into a PublishRequest."""
    if not isinstance(payload, dict):
        raise InvalidPayload("body must be a JSON object")
    try:
        account_id = _account_id_from_str(payload["account_id"])
        image_urls = payload["image_urls"]
        caption = payload["caption"]
    except KeyError as exc:
        raise InvalidPayload(f"missing required field: {exc.args[0]}") from exc

    if not isinstance(image_urls, list) or not all(isinstance(u, str) for u in image_urls):
        raise InvalidPayload("image_urls must be a list of strings")
    if not isinstance(caption, str):
        raise InvalidPayload("caption must be a string")

    first_comment = payload.get("first_comment")
    if first_comment is not None and not isinstance(first_comment, str):
        raise InvalidPayload("first_comment must be a string or null")

    idempotency_key = payload.get("idempotency_key") or uuid.uuid4().hex

    return PublishRequest(
        account_id=account_id,
        image_urls=image_urls,
        caption=caption,
        first_comment=first_comment,
        idempotency_key=str(idempotency_key),
    )


__all__ = [
    "PublishRequest",
    "PublishResult",
    "publish_carousel",
    "request_from_payload",
]
