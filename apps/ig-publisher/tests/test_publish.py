"""Unit tests for the carousel publishing pipeline.

instagrapi and Supabase are fully mocked. We exercise the request validation,
the rate-limit short-circuit, the happy path, and the main error-translation
branches.
"""
from __future__ import annotations

import io
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest

from app import accounts as accounts_module
from app import publish as publish_module
from app import sessions as sessions_module
from app.exceptions import (
    AccountNotFound,
    ChallengeRequired,
    ImageDownloadFailed,
    InvalidPayload,
    PublisherError,
    RateLimitExceeded,
    SessionExpired,
)
from app.publish import PublishRequest, publish_carousel, request_from_payload

ACCT = UUID("11111111-1111-1111-1111-111111111111")


# ── Helpers ─────────────────────────────────────────────────────


def _account_row(**overrides):
    base = accounts_module.AccountRow(
        id=ACCT,
        project_id=UUID("22222222-2222-2222-2222-222222222222"),
        user_id=UUID("33333333-3333-3333-3333-333333333333"),
        ig_username="apex.stack",
        display_name="APEX",
        status="active",
        session_updated_at=None,
        last_post_at=None,
        post_count_24h=0,
        daily_post_limit=5,
        last_error=None,
    )
    if overrides:
        return accounts_module.AccountRow(
            **{**base.__dict__, **overrides}
        )
    return base


def _secrets():
    return accounts_module.AccountSecrets(
        ig_username="apex.stack",
        password="hunter2",
        totp_seed=None,
        session_b64="eyJhIjoxfQ==",  # b64({"a":1})
    )


@pytest.fixture
def mock_account(monkeypatch):
    """Make accounts module behave as if the account is healthy and bumpable."""
    monkeypatch.setattr(
        accounts_module, "require_active_account", lambda _id: _account_row()
    )
    monkeypatch.setattr(
        accounts_module, "get_account_secrets", lambda _id: _secrets()
    )
    monkeypatch.setattr(
        accounts_module, "try_increment_post_count", lambda _id: True
    )
    monkeypatch.setattr(
        accounts_module, "update_session_blob", lambda _id, _b: None
    )
    monkeypatch.setattr(accounts_module, "mark_status", lambda *a, **k: None)


@pytest.fixture
def mock_session(monkeypatch):
    """Stub the session manager so it returns a fake instagrapi-like client."""
    client = SimpleNamespace(
        album_upload=lambda paths, caption: SimpleNamespace(
            model_dump=lambda: {"id": "9999_1234", "code": "ABC123"}
        ),
        media_comment=lambda mid, text: None,
        get_settings=lambda: {"ok": True},
    )
    monkeypatch.setattr(
        sessions_module,
        "login_for_account",
        lambda account_id, secrets, persist_session: client,
    )
    monkeypatch.setattr(
        sessions_module, "persist_current_session", lambda *a, **k: None
    )
    monkeypatch.setattr(sessions_module, "clear_cache", lambda _id: None)
    return client


@pytest.fixture
def mock_download(monkeypatch, tmp_path: Path):
    """Skip the real HTTP download — fabricate files on disk."""

    def fake(url: str, dest_dir: Path, idx: int) -> Path:
        dest_dir.mkdir(parents=True, exist_ok=True)
        path = dest_dir / f"slide-{idx:02d}.jpg"
        path.write_bytes(b"\xff\xd8\xff\xe0fake-jpeg")
        return path

    monkeypatch.setattr(publish_module, "_download_to_tempfile", fake)


# ── request_from_payload ────────────────────────────────────────


def test_request_from_payload_happy_path() -> None:
    req = request_from_payload(
        {
            "account_id": str(ACCT),
            "image_urls": ["https://x/1.png", "https://x/2.png"],
            "caption": "hello",
            "first_comment": None,
            "idempotency_key": "pub-123",
        }
    )
    assert req.account_id == ACCT
    assert req.image_urls == ["https://x/1.png", "https://x/2.png"]
    assert req.caption == "hello"
    assert req.idempotency_key == "pub-123"


def test_request_from_payload_missing_field() -> None:
    with pytest.raises(InvalidPayload, match="missing"):
        request_from_payload({"account_id": str(ACCT)})


def test_request_from_payload_bad_account_id() -> None:
    with pytest.raises(InvalidPayload, match="account_id"):
        request_from_payload(
            {
                "account_id": "not-a-uuid",
                "image_urls": [],
                "caption": "x",
            }
        )


def test_request_from_payload_non_dict_body() -> None:
    with pytest.raises(InvalidPayload, match="JSON object"):
        request_from_payload([])  # type: ignore[arg-type]


def test_request_from_payload_generates_idempotency_key() -> None:
    req = request_from_payload(
        {
            "account_id": str(ACCT),
            "image_urls": ["a", "b"],
            "caption": "x",
        }
    )
    assert req.idempotency_key  # non-empty


# ── PublishRequest.validate ─────────────────────────────────────


def _req(**overrides) -> PublishRequest:
    base = {
        "account_id": ACCT,
        "image_urls": ["a", "b"],
        "caption": "hello",
        "first_comment": None,
        "idempotency_key": "k",
    }
    base.update(overrides)
    return PublishRequest(**base)


def test_validate_rejects_too_few_images() -> None:
    with pytest.raises(InvalidPayload, match="2–10"):
        _req(image_urls=["only-one"]).validate()


def test_validate_rejects_too_many_images() -> None:
    with pytest.raises(InvalidPayload, match="2–10"):
        _req(image_urls=["x"] * 11).validate()


def test_validate_rejects_empty_caption() -> None:
    with pytest.raises(InvalidPayload, match="caption is required"):
        _req(caption="   ").validate()


def test_validate_rejects_long_caption() -> None:
    with pytest.raises(InvalidPayload, match="2200"):
        _req(caption="x" * 2201).validate()


# ── publish_carousel happy path ─────────────────────────────────


def test_publish_happy_path(mock_account, mock_session, mock_download) -> None:
    req = _req()
    result = publish_carousel(req)
    assert result.ig_media_id == "9999_1234"
    assert result.ig_permalink == "https://www.instagram.com/p/ABC123/"


def test_publish_runs_first_comment_when_provided(
    monkeypatch, mock_account, mock_session, mock_download
) -> None:
    calls: list[tuple[str, str]] = []
    mock_session.media_comment = lambda mid, txt: calls.append((mid, txt))
    req = _req(first_comment="📌 link in bio")
    publish_carousel(req)
    assert calls == [("9999_1234", "📌 link in bio")]


def test_publish_skips_first_comment_when_blank(
    mock_account, mock_session, mock_download
) -> None:
    calls: list = []
    mock_session.media_comment = lambda *a, **k: calls.append(a)
    publish_carousel(_req(first_comment="   "))
    assert calls == []


# ── publish_carousel error paths ────────────────────────────────


def test_publish_short_circuits_when_rate_limit_hit(
    monkeypatch, mock_account, mock_session, mock_download
) -> None:
    monkeypatch.setattr(
        accounts_module, "try_increment_post_count", lambda _id: False
    )
    with pytest.raises(RateLimitExceeded):
        publish_carousel(_req())


def test_publish_propagates_account_not_found(monkeypatch) -> None:
    def boom(_id):
        raise AccountNotFound("nope")

    monkeypatch.setattr(accounts_module, "require_active_account", boom)
    with pytest.raises(AccountNotFound):
        publish_carousel(_req())


def test_publish_translates_challenge_required_and_marks_account(
    monkeypatch, mock_account, mock_session, mock_download
) -> None:
    def boom(paths, caption):
        raise ChallengeRequired("challenge required during upload")

    mock_session.album_upload = boom

    marks: list[tuple] = []
    monkeypatch.setattr(
        accounts_module,
        "mark_status",
        lambda aid, status, last_error=None: marks.append((aid, status, last_error)),
    )

    with pytest.raises(ChallengeRequired):
        publish_carousel(_req())

    assert marks and marks[0][1] == "challenge"


def test_publish_translates_session_expired(
    mock_account, mock_session, mock_download
) -> None:
    def boom(paths, caption):
        raise SessionExpired("session expired during upload")

    mock_session.album_upload = boom
    with pytest.raises(SessionExpired):
        publish_carousel(_req())


def test_publish_image_download_failure(monkeypatch, mock_account, mock_session) -> None:
    def boom(url, dest_dir, idx):
        raise ImageDownloadFailed("nope", details={"idx": idx})

    monkeypatch.setattr(publish_module, "_download_to_tempfile", boom)
    with pytest.raises(ImageDownloadFailed):
        publish_carousel(_req())


# ── _download_to_tempfile ───────────────────────────────────────


def test_download_to_tempfile_writes_and_returns_path(monkeypatch, tmp_path: Path) -> None:
    class FakeResponse:
        status_code = 200

        def iter_bytes(self):
            yield b"\xff\xd8\xff\xe0"
            yield b"jpeg-bytes"

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(
        publish_module.httpx,
        "stream",
        lambda *a, **k: FakeResponse(),
    )
    path = publish_module._download_to_tempfile("https://x/y.jpg", tmp_path, 0)
    assert path.exists()
    assert path.read_bytes().startswith(b"\xff\xd8\xff\xe0")


def test_download_to_tempfile_rejects_non_200(monkeypatch, tmp_path: Path) -> None:
    class FakeResponse:
        status_code = 404

        def iter_bytes(self):
            return iter([])

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(
        publish_module.httpx, "stream", lambda *a, **k: FakeResponse()
    )
    with pytest.raises(ImageDownloadFailed, match="HTTP 404"):
        publish_module._download_to_tempfile("https://x/y.jpg", tmp_path, 0)


def test_download_to_tempfile_rejects_empty_body(monkeypatch, tmp_path: Path) -> None:
    class FakeResponse:
        status_code = 200

        def iter_bytes(self):
            return iter([])  # nothing!

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(
        publish_module.httpx, "stream", lambda *a, **k: FakeResponse()
    )
    with pytest.raises(ImageDownloadFailed, match="empty"):
        publish_module._download_to_tempfile("https://x/y.jpg", tmp_path, 0)
