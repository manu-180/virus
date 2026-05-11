"""Runtime configuration loaded from environment via pydantic-settings."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, HttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All env-driven config. Validated at startup; fail fast on bad input."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Supabase ──────────────────────────────────────────────
    supabase_url: HttpUrl = Field(..., alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY", min_length=20)

    # ── HMAC ──────────────────────────────────────────────────
    ig_publisher_hmac_secret: str = Field(..., alias="IG_PUBLISHER_HMAC_SECRET", min_length=32)

    # ── Admin (optional, gates /admin/*) ──────────────────────
    ig_publisher_admin_token: str | None = Field(default=None, alias="IG_PUBLISHER_ADMIN_TOKEN")

    # ── Runtime ───────────────────────────────────────────────
    environment: Literal["development", "staging", "production"] = Field(
        default="development", alias="ENVIRONMENT"
    )
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO", alias="LOG_LEVEL")
    log_format: Literal["json", "console"] = Field(default="json", alias="LOG_FORMAT")
    port: int = Field(default=8000, alias="PORT")

    # ── Paths ─────────────────────────────────────────────────
    download_dir: str = Field(default="/tmp/ig-publisher", alias="DOWNLOAD_DIR")

    @field_validator("ig_publisher_hmac_secret")
    @classmethod
    def _hmac_strength(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("IG_PUBLISHER_HMAC_SECRET must be at least 32 chars")
        if v in {"changeme", "secret", "password"}:
            raise ValueError("IG_PUBLISHER_HMAC_SECRET is set to an obviously weak value")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def supabase_url_str(self) -> str:
        # Strip trailing slash for clean URL composition
        return str(self.supabase_url).rstrip("/")


@lru_cache
def get_settings() -> Settings:
    """Cached singleton. Tests can override via dependency injection."""
    return Settings()  # type: ignore[call-arg]
