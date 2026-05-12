"""Unit tests for the session manager. instagrapi is mocked."""
from __future__ import annotations

import base64
import json
from uuid import UUID

import pytest

from app import sessions
from app.accounts import AccountSecrets

ACCT = UUID("11111111-1111-1111-1111-111111111111")


class FakeIgClient:
    """Mimics the small slice of instagrapi.Client we touch."""

    def __init__(self):
        self.request_timeout = None
        self.delay_range = None
        self._settings: dict = {"uuids": {"phone_id": "abc"}, "device_settings": {"model": "Pixel"}}
        self.login_calls: list[dict] = []
        self.account_info_called = False
        self.login_raises: Exception | None = None
        self.account_info_raises: Exception | None = None

    def set_settings(self, s: dict) -> None:
        self._settings = dict(s)

    def get_settings(self) -> dict:
        return dict(self._settings)

    def login(self, username: str, password: str, verification_code: str | None = None) -> None:
        self.login_calls.append(
            {"username": username, "password": password, "verification_code": verification_code}
        )
        if self.login_raises:
            raise self.login_raises
        # Simulate IG mutating settings after login.
        self._settings["authorization_data"] = {"sessionid": "fresh"}

    def account_info(self):
        self.account_info_called = True
        if self.account_info_raises:
            raise self.account_info_raises
        return {"user": "ok"}


@pytest.fixture(autouse=True)
def _clear_cache():
    sessions.clear_cache()
    yield
    sessions.clear_cache()


@pytest.fixture
def fake_client(monkeypatch):
    instance = FakeIgClient()
    monkeypatch.setattr(sessions, "_new_client", lambda: instance)
    return instance


# ── Encode / decode roundtrip ──────────────────────────────────


def test_encode_decode_roundtrip():
    payload = {"uuids": {"phone_id": "x"}, "n": 1}
    blob = sessions.encode_settings(payload)
    # Result is valid base64 + decodes back.
    raw = base64.b64decode(blob.encode())
    assert json.loads(raw) == payload
    assert sessions.decode_settings(blob) == payload


# ── Login flow ─────────────────────────────────────────────────


def test_login_for_account_fresh_login_persists_session(fake_client):
    persisted: list[tuple[UUID, str]] = []
    secrets = AccountSecrets(
        ig_username="apex.stack",
        password="pw",
        totp_seed=None,
        session_b64=None,
    )

    client = sessions.login_for_account(
        ACCT, secrets, persist_session=lambda aid, blob: persisted.append((aid, blob))
    )

    assert client is fake_client
    assert fake_client.login_calls == [
        {"username": "apex.stack", "password": "pw", "verification_code": None}
    ]
    assert len(persisted) == 1
    assert persisted[0][0] == ACCT
    decoded = sessions.decode_settings(persisted[0][1])
    assert decoded["authorization_data"]["sessionid"] == "fresh"


def test_login_for_account_with_totp_passes_verification_code(fake_client):
    # JBSWY3DPEHPK3PXP is a well-known test secret; pyotp will produce a 6-digit code.
    secrets = AccountSecrets(
        ig_username="apex.stack",
        password="pw",
        totp_seed="JBSWY3DPEHPK3PXP",
        session_b64=None,
    )

    sessions.login_for_account(ACCT, secrets, persist_session=lambda *_: None)

    assert len(fake_client.login_calls) == 1
    code = fake_client.login_calls[0]["verification_code"]
    assert code is not None
    assert code.isdigit()
    assert len(code) == 6


def test_login_for_account_restores_session_when_blob_valid(fake_client):
    blob = sessions.encode_settings({"uuids": {"phone_id": "stored"}})
    secrets = AccountSecrets(
        ig_username="apex.stack",
        password="pw",
        totp_seed=None,
        session_b64=blob,
    )
    persisted: list = []

    sessions.login_for_account(
        ACCT, secrets, persist_session=lambda *args: persisted.append(args)
    )

    # We restored from blob → no fresh login, no persist write.
    assert fake_client.login_calls == []
    assert fake_client.account_info_called is True
    assert persisted == []


def test_login_for_account_falls_back_to_fresh_login_if_session_invalid(monkeypatch):
    """If account_info() raises LoginRequired the manager retries with a fresh login."""

    class _LoginRequired(Exception):
        pass

    # Patch the symbol the validator imports — see sessions._validate_logged_in.
    import instagrapi.exceptions as ig_exc  # type: ignore[import-not-found]

    monkeypatch.setattr(ig_exc, "LoginRequired", _LoginRequired, raising=False)

    # First _new_client() returns a client whose account_info() blows up.
    failing = FakeIgClient()
    failing.account_info_raises = _LoginRequired("session dead")

    fresh = FakeIgClient()
    queue = [failing, fresh]
    monkeypatch.setattr(sessions, "_new_client", lambda: queue.pop(0))

    blob = sessions.encode_settings({"uuids": {"phone_id": "stale"}})
    secrets = AccountSecrets(
        ig_username="apex.stack",
        password="pw",
        totp_seed=None,
        session_b64=blob,
    )
    persisted: list = []

    client = sessions.login_for_account(
        ACCT, secrets, persist_session=lambda aid, b: persisted.append((aid, b))
    )

    assert client is fresh
    assert fresh.login_calls != []
    assert len(persisted) == 1


def test_login_for_account_is_cached_per_account(fake_client):
    secrets = AccountSecrets(
        ig_username="apex.stack",
        password="pw",
        totp_seed=None,
        session_b64=None,
    )

    c1 = sessions.login_for_account(ACCT, secrets, persist_session=lambda *_: None)
    c2 = sessions.login_for_account(ACCT, secrets, persist_session=lambda *_: None)
    assert c1 is c2
    # Only one login happened despite two calls.
    assert len(fake_client.login_calls) == 1


def test_persist_current_session_writes_blob(fake_client):
    persisted: list = []
    sessions.persist_current_session(
        ACCT, fake_client, persist_session=lambda aid, b: persisted.append((aid, b))
    )
    assert len(persisted) == 1
    decoded = sessions.decode_settings(persisted[0][1])
    assert "uuids" in decoded
