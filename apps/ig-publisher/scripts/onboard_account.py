"""Interactive CLI to onboard a new Instagram account.

What it does:
    1. Resolve the target project (by ``--project-id`` or ``--project-slug``).
    2. Prompt for the IG password (hidden) and an optional TOTP seed.
    3. Log in *locally* using instagrapi to validate credentials and
       produce a session blob.
    4. Call the ``ig_account_create_with_secrets`` RPC so password,
       TOTP seed, and session blob are stored encrypted in Supabase Vault.
    5. Print the new account UUID.

Nothing is written to Supabase if login fails — we don't want half-onboarded
accounts. Re-running the script will fail with a unique-key violation; soft-
delete the previous row first if you need to redo the onboarding.

Usage:
    python -m scripts.onboard_account \\
        --project-slug apex --ig-username apex.stack --display-name "APEX"

    python -m scripts.onboard_account \\
        --project-id 5ba476ee-...-c639f3b --ig-username botlode.ai

The ``.env`` file at ``apps/ig-publisher/.env`` must have
``SUPABASE_URL`` and ``SUPABASE_SERVICE_ROLE_KEY`` set.
"""
from __future__ import annotations

import argparse
import getpass
import sys
from typing import Any
from uuid import UUID

from app.accounts import create_account_with_secrets
from app.logging_config import configure_logging, get_logger
from app.sessions import login_local_for_onboarding
from app.supabase_client import get_client


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="onboard_account",
        description="Onboard a new Instagram account for the virus IG publisher.",
    )
    target = p.add_mutually_exclusive_group(required=True)
    target.add_argument("--project-id", type=str, help="Project UUID (no lookup).")
    target.add_argument(
        "--project-slug",
        type=str,
        help="Project slug (e.g. 'apex'). If multiple users own a project "
             "with the same slug, you'll get an error listing the UUIDs — "
             "rerun with --project-id.",
    )

    p.add_argument("--ig-username", required=True, type=str)
    p.add_argument("--display-name", type=str, help="Human-readable label (defaults to ig-username).")
    p.add_argument(
        "--no-totp",
        action="store_true",
        help="Skip the TOTP-seed prompt. Use only if the account has no 2FA.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate inputs and log in to IG, but don't write anything to Supabase.",
    )
    return p.parse_args(argv)


def _resolve_project_id(args: argparse.Namespace, log: Any) -> UUID:
    if args.project_id:
        try:
            return UUID(args.project_id)
        except ValueError as exc:
            raise SystemExit(f"--project-id is not a valid UUID: {exc}") from exc

    client = get_client()
    res = (
        client.table("projects")
        .select("id, user_id, name")
        .eq("slug", args.project_slug)
        .is_("deleted_at", "null")
        .execute()
    )
    rows = res.data or []

    if not rows:
        raise SystemExit(f"no project found with slug={args.project_slug!r}")
    if len(rows) > 1:
        listing = "\n  ".join(
            f"{r['id']}  (user_id={r['user_id']}, name={r.get('name')!r})" for r in rows
        )
        raise SystemExit(
            f"slug={args.project_slug!r} matches {len(rows)} projects:\n  {listing}\n"
            "Rerun with --project-id <UUID>."
        )

    project_id = UUID(rows[0]["id"])
    log.info(
        "onboard.project_resolved",
        slug=args.project_slug,
        project_id=str(project_id),
    )
    return project_id


def _prompt_password() -> str:
    pwd = getpass.getpass("IG password: ").strip()
    if not pwd:
        raise SystemExit("password cannot be empty")
    return pwd


def _prompt_totp_seed() -> str | None:
    print(
        "TOTP seed (base32, optional — paste the secret behind the QR code,"
        " or press Enter to skip):",
        file=sys.stderr,
    )
    seed = getpass.getpass("TOTP seed: ").strip()
    return seed or None


def main(argv: list[str] | None = None) -> int:
    configure_logging(level="INFO", fmt="console")
    log = get_logger("onboard")
    args = _parse_args(argv)

    project_id = _resolve_project_id(args, log)
    display_name = args.display_name or args.ig_username

    print(f"→ Project:       {project_id}", file=sys.stderr)
    print(f"→ IG username:   {args.ig_username}", file=sys.stderr)
    print(f"→ Display name:  {display_name}", file=sys.stderr)
    if args.dry_run:
        print("→ DRY RUN — nothing will be written", file=sys.stderr)

    password = _prompt_password()
    totp_seed = None if args.no_totp else _prompt_totp_seed()

    log.info("onboard.logging_in", ig_username=args.ig_username)
    try:
        session_b64 = login_local_for_onboarding(args.ig_username, password, totp_seed)
    except Exception as exc:  # noqa: BLE001 — surface anything to the CLI
        import traceback

        log.error("onboard.login_failed", error=str(exc), error_type=type(exc).__name__)
        print(f"\n✖ Login failed: {exc}", file=sys.stderr)
        print("\n--- full traceback ---", file=sys.stderr)
        traceback.print_exc()
        print(
            "\n  If IG asked for a challenge, open the Instagram app, verify the"
            " device, then re-run this script.",
            file=sys.stderr,
        )
        return 1

    print("✓ Login succeeded — session blob captured", file=sys.stderr)

    if args.dry_run:
        print("\n(dry-run) skipping Supabase write", file=sys.stderr)
        return 0

    try:
        account_id = create_account_with_secrets(
            project_id=project_id,
            ig_username=args.ig_username,
            display_name=display_name,
            password=password,
            totp_seed=totp_seed,
            session_b64=session_b64,
        )
    except Exception as exc:  # noqa: BLE001
        log.error("onboard.rpc_failed", error=str(exc))
        print(f"\n✖ Supabase RPC failed: {exc}", file=sys.stderr)
        return 2

    print(f"\n✓ Account created: {account_id}", file=sys.stderr)
    print(f"  Project:  {project_id}", file=sys.stderr)
    print(f"  Status:   active (session persisted)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
