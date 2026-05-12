"""Singleton Supabase client with the service-role key.

All RPC calls that touch Vault require service_role. Tests override via
`set_client()` to inject a mock.
"""
from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from supabase import create_client

from .config import get_settings

if TYPE_CHECKING:
    from supabase import Client


_override: "Client | None" = None


def set_client(client: "Client | None") -> None:
    """Tests: inject a mock client. Pass None to restore the cached singleton."""
    global _override
    _override = client


@lru_cache
def _build_client() -> "Client":
    settings = get_settings()
    return create_client(settings.supabase_url_str, settings.supabase_service_role_key)


def get_client() -> "Client":
    if _override is not None:
        return _override
    return _build_client()
