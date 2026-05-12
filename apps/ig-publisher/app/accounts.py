"""Account loader and credential retrieval.

All credential access goes through SECURITY DEFINER RPCs defined in
migration 0028_ig_accounts.sql. The RPCs validate the caller is
service_role and decrypt Vault secrets server-side.

Surface:
    get_account_by_id(account_id)         → AccountRow | None
    get_account_secrets(account_id)       → AccountSecrets   (raises AccountNotFound)
    try_increment_post_count(account_id)  → bool             (False = rate limited)
    update_session_blob(account_id, b64)  → None
    mark_status(account_id, status, error=None) → None
    create_account_with_secrets(...)      → uuid             (used by onboarding CLI)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from .exceptions import AccountDisabled, AccountNotFound
from .logging_config import get_logger
from .supabase_client import get_client

log = get_logger("accounts")


# ── Data classes ────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class AccountSecrets:
    """Decrypted material returned by `ig_account_get_secrets()`."""

    ig_username: str
    password: str
    totp_seed: str | None
    session_b64: str | None


@dataclass(frozen=True, slots=True)
class AccountRow:
    """Public columns of `public.ig_accounts` (no secret ids)."""

    id: UUID
    project_id: UUID
    user_id: UUID
    ig_username: str
    display_name: str | None
    status: str
    session_updated_at: datetime | None
    last_post_at: datetime | None
    post_count_24h: int
    daily_post_limit: int
    last_error: str | None

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "AccountRow":
        return cls(
            id=UUID(row["id"]),
            project_id=UUID(row["project_id"]),
            user_id=UUID(row["user_id"]),
            ig_username=row["ig_username"],
            display_name=row.get("display_name"),
            status=row["status"],
            session_updated_at=_parse_ts(row.get("session_updated_at")),
            last_post_at=_parse_ts(row.get("last_post_at")),
            post_count_24h=int(row["post_count_24h"]),
            daily_post_limit=int(row["daily_post_limit"]),
            last_error=row.get("last_error"),
        )


def _parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    # Postgres returns ISO strings like "2026-05-11T14:00:00+00:00"
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


# ── Queries ─────────────────────────────────────────────────────


def get_account_by_id(account_id: UUID) -> AccountRow | None:
    """Return the public columns of an account, or None if not found / soft-deleted."""
    client = get_client()
    res = (
        client.table("ig_accounts")
        .select(
            "id, project_id, user_id, ig_username, display_name, status, "
            "session_updated_at, last_post_at, post_count_24h, daily_post_limit, last_error"
        )
        .eq("id", str(account_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    return AccountRow.from_row(rows[0])


def require_active_account(account_id: UUID) -> AccountRow:
    """Fetch an account or raise the right domain error if missing/disabled."""
    account = get_account_by_id(account_id)
    if account is None:
        raise AccountNotFound(f"account {account_id} not found")
    if account.status == "disabled":
        raise AccountDisabled(f"account {account_id} is disabled")
    return account


def get_account_secrets(account_id: UUID) -> AccountSecrets:
    """Call `ig_account_get_secrets` RPC. Raises AccountNotFound if missing."""
    client = get_client()
    res = client.rpc("ig_account_get_secrets", {"p_account_id": str(account_id)}).execute()
    rows = res.data or []
    if not rows:
        raise AccountNotFound(f"account {account_id} not found (no secrets)")
    row = rows[0]
    return AccountSecrets(
        ig_username=row["ig_username"],
        password=row["password"],
        totp_seed=row.get("totp_seed"),
        session_b64=row.get("session_b64"),
    )


# ── Mutations ───────────────────────────────────────────────────


def try_increment_post_count(account_id: UUID) -> bool:
    """Atomic rate-limit check. Returns True if increment succeeded."""
    client = get_client()
    res = client.rpc(
        "ig_account_try_increment_post_count", {"p_account_id": str(account_id)}
    ).execute()
    return bool(res.data)


def update_session_blob(account_id: UUID, session_b64: str) -> None:
    """Persist the latest instagrapi session blob (encrypted in Vault)."""
    client = get_client()
    client.rpc(
        "ig_account_update_session",
        {"p_account_id": str(account_id), "p_session_b64": session_b64},
    ).execute()
    log.info("account.session_persisted", account_id=str(account_id))


def mark_status(account_id: UUID, status: str, *, last_error: str | None = None) -> None:
    """Update account status (e.g. 'challenge', 'active', 'disabled')."""
    payload: dict[str, Any] = {"status": status, "last_action_at": "now()"}
    if last_error is not None:
        payload["last_error"] = last_error
    client = get_client()
    # Direct UPDATE rather than RPC — service_role bypasses RLS.
    # We can't pass `now()` as a string via supabase-py builder; use a tiny RPC fallback below.
    # Workaround: drop last_action_at here, let the next post update it.
    payload.pop("last_action_at", None)
    client.table("ig_accounts").update(payload).eq("id", str(account_id)).execute()
    log.info("account.status_updated", account_id=str(account_id), status=status)


# ── Onboarding ──────────────────────────────────────────────────


def create_account_with_secrets(
    *,
    project_id: UUID,
    ig_username: str,
    display_name: str | None,
    password: str,
    totp_seed: str | None = None,
    session_b64: str | None = None,
) -> UUID:
    """Wrapper around the `ig_account_create_with_secrets` RPC.

    Returns the new account UUID. Raises on RPC error (caller surfaces to CLI).
    """
    client = get_client()
    res = client.rpc(
        "ig_account_create_with_secrets",
        {
            "p_project_id": str(project_id),
            "p_ig_username": ig_username,
            "p_display_name": display_name,
            "p_password": password,
            "p_totp_seed": totp_seed,
            "p_session_b64": session_b64,
        },
    ).execute()
    if not res.data:
        raise RuntimeError("ig_account_create_with_secrets returned no id")
    return UUID(res.data)
