# @virus/db

Supabase schema, migrations, and TypeScript types for the Virus multi-project system.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- Docker running (for local Supabase)
- `.env.local` with `SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN` for remote ops

## Local Development

```bash
# Start local Supabase (Docker)
supabase start

# Apply all migrations + seed.sql from scratch
supabase db reset

# Apply only pending migrations (preserves local data)
supabase migration up --local
```

After `supabase db reset`, verify:

```bash
psql $DATABASE_URL -c "SELECT count(*) FROM viral_hooks_seed"
# Expected: 30

psql $DATABASE_URL -c "\d projects"
psql $DATABASE_URL -c "\d project_files"
psql $DATABASE_URL -c "\d project_used_signatures"
```

`DATABASE_URL` is printed by `supabase start` (look for `DB URL`).

## Migrations

| File | Contents |
|------|----------|
| `migrations/0001_init.sql` | Extensions, all tables, triggers (updated_at, handle_new_user, set_project_file_version, enforce_single_current_*, set_project_user_id) |
| `migrations/0002_rls.sql` | `ENABLE ROW LEVEL SECURITY` + policies for all tables |
| `migrations/0003_indexes.sql` | Performance indexes for all 8 predicted query patterns |
| `migrations/0004_storage_buckets.sql` | Buckets (project-files, videos, audio, thumbnails) + storage policies |

## Seed

`seed.sql` runs automatically on `supabase db reset`. Contains:

- 30 viral hooks in `viral_hooks_seed` (`niche = 'dev/software'`, language `es-AR`)
- 3 default pillar templates in `pillar_templates` (60/30/10 split)

All INSERTs use `ON CONFLICT DO NOTHING` — safe to run multiple times.

## Deploy to Production

```bash
# Link project (once)
supabase link --project-ref $SUPABASE_PROJECT_REF

# Preview what will run
supabase db push --dry-run

# Deploy
supabase db push
```

## TypeScript Types

Generate after any migration change:

```bash
# From local instance
supabase gen types typescript --local > src/types.gen.ts

# From remote project
supabase gen types typescript --project-id $SUPABASE_PROJECT_REF > src/types.gen.ts
```

Types are exported from `src/index.ts`.

## Testing RLS

Use the Supabase local Studio at `http://localhost:54323` or run SQL directly:

```bash
# Test as a specific user (replace with a real user UUID from auth.users)
psql $DATABASE_URL -c "SET request.jwt.claims = '{\"sub\": \"<user-uuid>\", \"role\": \"authenticated\"}'; SELECT * FROM projects;"

# Or use supabase test (requires test files in supabase/tests/)
supabase test db
```

## Schema Overview

```
profiles          ← 1:1 with auth.users (auto-created via trigger)
projects          ← multi-tenant container per user
  project_files   ← versioned uploads (viral_patterns / project_info)
  project_patterns← parsed viral patterns (JSONB), is_current flag
  project_brand   ← parsed brand info (JSONB), is_current flag
  content_pillars ← 60/30/10 distribution (user_id denormalized)
  video_ideas     ← generated ideas (user_id denormalized)
  videos          ← full pipeline state (user_id denormalized)
    job_events    ← Inngest step audit log
    video_performance ← per-platform metrics
  project_used_signatures ← anti-repetition hashes (14-day window)

viral_hooks_seed  ← public catalog (not project-scoped)
pillar_templates  ← reference defaults for wizard (not project-scoped)
```
