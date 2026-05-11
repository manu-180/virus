# Virus IG Publisher

FastAPI + instagrapi service that publishes virus-generated carousels to
Instagram. Multi-account aware. Deployed standalone on Railway. Talks to
Supabase (Vault-encrypted credentials) and is invoked by the virus worker
over HTTP with HMAC-SHA256 auth.

```
Vercel (web/worker)  ──HMAC──▶  Railway (this service)  ──▶  Instagram (private API)
                                       │
                                       └──▶  Supabase (Vault, ig_accounts, ig_publications)
```

## Why a separate Python service?

`instagrapi` is the only mature library for IG's private API and it's Python-only.
We isolate it behind a small HTTP surface so the rest of virus stays TypeScript.

## Status

| Area | Status |
|---|---|
| HMAC auth | ✅ |
| Health endpoint | ✅ |
| Vault-backed account loader | ⏳ next commit |
| Session manager | ⏳ |
| Publish endpoint | ⏳ |
| Onboarding CLI | ⏳ |
| Railway deploy | ⏳ |

## Local dev

```bash
cd apps/ig-publisher

# Python 3.11
python -m venv .venv
. .venv/bin/activate          # Linux/Mac
.venv\Scripts\activate        # Windows

pip install -r requirements.txt

cp .env.example .env          # fill in SUPABASE_*, IG_PUBLISHER_HMAC_SECRET

uvicorn app.main:app --reload --port 8000

# In another terminal:
curl http://localhost:8000/health
```

## Tests

```bash
pytest                        # unit tests only
pytest -m integration         # also hits real Supabase / IG (requires creds)
```

## Onboarding a new IG account

```bash
python -m scripts.onboard_account \
  --project-slug apex \
  --ig-username apex.stack \
  --display-name "APEX Stack"
```

You'll be prompted for password and (optional) TOTP seed. The script logs in
once locally to obtain a session blob, then encrypts password/TOTP/session in
Supabase Vault and inserts an `ig_accounts` row. After this, the deployed
publisher can post to that account without needing the credentials again.

See `docs/ig-publisher/onboarding-guide.md` for the full walkthrough.

## Operational notes

- **Rate limits:** Hard cap of 5 posts / 24h per account by default
  (`ig_accounts.daily_post_limit`, max 25). Enforced via the
  `ig_account_try_increment_post_count()` SQL function under row-level
  `FOR UPDATE` lock — safe under concurrent publishers.
- **Sessions:** Persisted encrypted in Supabase Vault (not in Railway
  volumes). If Railway recreates the container, sessions are restored.
- **Challenge:** If IG flags the account, status flips to `challenge` and
  the publisher returns 503 with `cooldown_until`. The user resolves the
  challenge in the IG app, then calls
  `POST /admin/refresh-session/{account_id}` to re-login.
- **No user data leaks:** the FastAPI app only ever returns the structured
  errors defined in `app/exceptions.py`. Internal stack traces stay in logs.

## Troubleshooting

See `docs/ig-publisher/troubleshooting.md`.
