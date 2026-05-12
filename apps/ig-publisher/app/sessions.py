"""Session manager: cache + lifecycle of one ``instagrapi.Client`` per account.

Responsibilities:
    1. Build a Client from credentials (Vault) or a persisted session blob.
    2. Log in once per process / per account; reuse across requests.
    3. Persist the session blob back to Vault after login OR after each
       successful post (instagrapi mutates ``client.settings``).
    4. Translate instagrapi exceptions → domain exceptions.

The cache is process-local. With ``--workers 2`` each worker holds its own
copy; the per-account ``post_count`` lock lives in Postgres, so concurrent
workers cannot exceed ``daily_post_limit``.
"""
from __future__ import annotations

import base64
import json
import threading
from collections.abc import Callable
from typing import TYPE_CHECKING
from uuid import UUID

import pyotp

from .exceptions import (
    AccountDisabled,
    ChallengeRequired,
    PublisherError,
    SessionExpired,
)
from .logging_config import get_logger

if TYPE_CHECKING:
    from instagrapi import Client

    from .accounts import AccountSecrets

log = get_logger("sessions")

# ── Process-local cache ─────────────────────────────────────────

_clients: dict[UUID, "Client"] = {}
_cache_lock = threading.Lock()
_per_account_locks: dict[UUID, threading.Lock] = {}


def _lock_for(account_id: UUID) -> threading.Lock:
    """Return (and lazily create) the lock guarding logins for one account."""
    with _cache_lock:
        lock = _per_account_locks.get(account_id)
        if lock is None:
            lock = threading.Lock()
            _per_account_locks[account_id] = lock
        return lock


def clear_cache(account_id: UUID | None = None) -> None:
    """Drop cached client(s). Call when status flips to ``challenge``/``disabled``.

    Pass ``None`` to clear all (tests).
    """
    with _cache_lock:
        if account_id is None:
            _clients.clear()
        else:
            _clients.pop(account_id, None)


# ── Session blob (base64-encoded JSON of ``client.get_settings()``) ─────


def encode_settings(settings: dict) -> str:
    raw = json.dumps(settings, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def decode_settings(blob_b64: str) -> dict:
    raw = base64.b64decode(blob_b64.encode("ascii"))
    return json.loads(raw.decode("utf-8"))


# ── Login flow ──────────────────────────────────────────────────


def _totp_code(seed: str | None) -> str | None:
    if not seed:
        return None
    return pyotp.TOTP(seed).now()


def _new_client() -> "Client":
    # Local import so test suites can mock without pulling all of instagrapi.
    from instagrapi import Client as IgClient

    client = IgClient()
    # Default request timeout (instagrapi default is too long).
    client.request_timeout = 10
    client.delay_range = [1, 3]
    return client


def _login_fresh(client: "Client", secrets: "AccountSecrets") -> None:
    """Username/password login. Uses TOTP if seed provided. Raises on failure."""
    # Local import for type-checked exception classes.
    from instagrapi.exceptions import (
        BadPassword,
        ChallengeRequired as IgChallengeRequired,
        ClientError,
        PleaseWaitFewMinutes,
        TwoFactorRequired,
    )

    code = _totp_code(secrets.totp_seed)
    try:
        if code:
            client.login(secrets.ig_username, secrets.password, verification_code=code)
        else:
            client.login(secrets.ig_username, secrets.password)
    except IgChallengeRequired as exc:
        raise ChallengeRequired("instagram challenge required") from exc
    except TwoFactorRequired as exc:
        raise ChallengeRequired("2FA required but no TOTP seed configured") from exc
    except BadPassword as exc:
        raise AccountDisabled("instagram rejected the password") from exc
    except PleaseWaitFewMinutes as exc:
        raise SessionExpired("instagram asked us to wait — try again later") from exc
    except ClientError as exc:
        raise SessionExpired(f"login failed: {exc}") from exc


def _restore_session(client: "Client", settings: dict) -> None:
    client.set_settings(settings)


def _validate_logged_in(client: "Client") -> None:
    """Cheap call to ensure the session is alive. Raises ``SessionExpired``."""
    from instagrapi.exceptions import ClientError, LoginRequired

    try:
        # account_info() is cheap and authenticated.
        client.account_info()
    except LoginRequired as exc:
        raise SessionExpired("session expired") from exc
    except ClientError as exc:
        raise SessionExpired(f"session probe failed: {exc}") from exc


# ── Public API ──────────────────────────────────────────────────


SessionPersister = Callable[[UUID, str], None]
"""Signature of the callback used to persist the session blob to Vault.

In production this is ``accounts.update_session_blob``; tests inject a stub.
"""


def login_for_account(
    account_id: UUID,
    secrets: "AccountSecrets",
    *,
    persist_session: SessionPersister,
) -> "Client":
    """Build a ready-to-use Client for one account (login if needed).

    Threadsafe: concurrent calls for the same account block on a single lock
    so we never trigger two parallel logins (which IG punishes).

    Persistence rules:
        * If we restored from a blob and it still works → no write.
        * If we did a fresh login → write the new blob.
        * If restore fails → fall back to fresh login → write.
    """
    cached = _clients.get(account_id)
    if cached is not None:
        return cached

    with _lock_for(account_id):
        cached = _clients.get(account_id)
        if cached is not None:
            return cached

        client = _new_client()
        wrote_blob = False

        if secrets.session_b64:
            try:
                _restore_session(client, decode_settings(secrets.session_b64))
                _validate_logged_in(client)
                log.info("session.restored", account_id=str(account_id))
            except (SessionExpired, PublisherError) as exc:
                log.warning(
                    "session.restore_failed_falling_back_to_login",
                    account_id=str(account_id),
                    error=str(exc),
                )
                client = _new_client()
                _login_fresh(client, secrets)
                wrote_blob = True
                log.info("session.fresh_login", account_id=str(account_id))
        else:
            _login_fresh(client, secrets)
            wrote_blob = True
            log.info("session.fresh_login_first_time", account_id=str(account_id))

        if wrote_blob:
            blob = encode_settings(client.get_settings())
            persist_session(account_id, blob)

        _clients[account_id] = client
        return client


def persist_current_session(
    account_id: UUID,
    client: "Client",
    *,
    persist_session: SessionPersister,
) -> None:
    """Write the *current* in-memory settings to Vault.

    Call after every successful post — instagrapi rotates UUIDs/cookies as
    it operates, so the persisted blob should stay up to date.
    """
    blob = encode_settings(client.get_settings())
    persist_session(account_id, blob)


def login_local_for_onboarding(
    ig_username: str,
    password: str,
    totp_seed: str | None = None,
) -> str:
    """One-shot login used by the onboarding CLI.

    Runs entirely against ``instagrapi`` (no Supabase). Returns the resulting
    session blob (base64) so the caller can pass it to
    ``ig_account_create_with_secrets``.
    """
    from .accounts import AccountSecrets

    client = _new_client()
    secrets = AccountSecrets(
        ig_username=ig_username,
        password=password,
        totp_seed=totp_seed,
        session_b64=None,
    )
    _login_fresh(client, secrets)
    return encode_settings(client.get_settings())
