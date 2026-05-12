"""Unit tests for the account loader. Supabase is fully mocked."""
from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

import pytest

from app import accounts, supabase_client
from app.exceptions import AccountDisabled, AccountNotFound

ACCT = UUID("11111111-1111-1111-1111-111111111111")
PROJ = UUID("22222222-2222-2222-2222-222222222222")
USER = UUID("33333333-3333-3333-3333-333333333333")


def _row(**overrides):
    base = {
        "id": str(ACCT),
        "project_id": str(PROJ),
        "user_id": str(USER),
        "ig_username": "apex.stack",
        "display_name": "APEX",
        "status": "active",
        "session_updated_at": "2026-05-11T14:00:00+00:00",
        "last_post_at": None,
        "post_count_24h": 2,
        "daily_post_limit": 5,
        "last_error": None,
    }
    base.update(overrides)
    return base


class FakeBuilder:
    """Tiny stand-in for the supabase-py query builder."""

    def __init__(self, response):
        self._response = response
        self.calls: list[tuple[str, tuple, dict]] = []

    def _record(self, name, *args, **kwargs):
        self.calls.append((name, args, kwargs))
        return self

    def table(self, _name):  # noqa: D401
        return self._record("table", _name)

    def select(self, *a, **kw):
        return self._record("select", *a, **kw)

    def eq(self, *a, **kw):
        return self._record("eq", *a, **kw)

    def is_(self, *a, **kw):
        return self._record("is_", *a, **kw)

    def limit(self, *a, **kw):
        return self._record("limit", *a, **kw)

    def update(self, *a, **kw):
        return self._record("update", *a, **kw)

    def rpc(self, *a, **kw):
        return self._record("rpc", *a, **kw)

    def execute(self):
        return self._response


@pytest.fixture(autouse=True)
def _reset_client():
    yield
    supabase_client.set_client(None)


def _install(response):
    builder = FakeBuilder(response)
    supabase_client.set_client(builder)
    return builder


def test_get_account_by_id_returns_typed_row():
    _install(SimpleNamespace(data=[_row()]))
    got = accounts.get_account_by_id(ACCT)
    assert got is not None
    assert got.id == ACCT
    assert got.ig_username == "apex.stack"
    assert got.status == "active"
    assert got.post_count_24h == 2


def test_get_account_by_id_returns_none_for_empty():
    _install(SimpleNamespace(data=[]))
    assert accounts.get_account_by_id(ACCT) is None


def test_require_active_account_raises_when_missing():
    _install(SimpleNamespace(data=[]))
    with pytest.raises(AccountNotFound):
        accounts.require_active_account(ACCT)


def test_require_active_account_raises_when_disabled():
    _install(SimpleNamespace(data=[_row(status="disabled")]))
    with pytest.raises(AccountDisabled):
        accounts.require_active_account(ACCT)


def test_get_account_secrets_returns_decrypted_payload():
    _install(
        SimpleNamespace(
            data=[
                {
                    "ig_username": "apex.stack",
                    "password": "hunter2",
                    "totp_seed": "JBSWY3DPEHPK3PXP",
                    "session_b64": "eyJhIjoxfQ==",
                }
            ]
        )
    )
    secrets = accounts.get_account_secrets(ACCT)
    assert secrets.ig_username == "apex.stack"
    assert secrets.password == "hunter2"
    assert secrets.totp_seed == "JBSWY3DPEHPK3PXP"
    assert secrets.session_b64 == "eyJhIjoxfQ=="


def test_get_account_secrets_raises_when_empty():
    _install(SimpleNamespace(data=[]))
    with pytest.raises(AccountNotFound):
        accounts.get_account_secrets(ACCT)


def test_try_increment_post_count_returns_bool():
    _install(SimpleNamespace(data=True))
    assert accounts.try_increment_post_count(ACCT) is True

    _install(SimpleNamespace(data=False))
    assert accounts.try_increment_post_count(ACCT) is False


def test_create_account_with_secrets_returns_uuid():
    new_id = "44444444-4444-4444-4444-444444444444"
    _install(SimpleNamespace(data=new_id))
    got = accounts.create_account_with_secrets(
        project_id=PROJ,
        ig_username="apex.stack",
        display_name="APEX",
        password="pw",
    )
    assert got == UUID(new_id)
