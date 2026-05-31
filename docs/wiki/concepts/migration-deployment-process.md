---
title: Migration Deployment Process
type: concept
created: 2026-05-31
updated: 2026-05-31
sources: [migration-drift-audit-2026-05-31.md]
tags: [supabase, migrations, deployment, drift, lovable]
---
# Migration Deployment Process

How database schema changes reach (or fail to reach) production, and how to keep the repo and
production in sync. Governs all work touching `supabase/migrations/`.

## The core gap

Pushing to `main` makes [[Lovable]] deploy the **frontend only**. Database migrations and edge
functions are **not** deployed by a push — they must be applied separately (MCP `apply_migration`
/ `supabase db push`, and `deploy_edge_function` / `supabase functions deploy`). This split is the
root cause of two recurring drift classes:

1. **Repo → prod drift:** a migration file is committed but never applied. The frontend ships
   expecting schema that production lacks.
2. **Prod → repo drift:** a change applied directly in production (Lovable UI / dashboard / MCP)
   is never mirrored back into a repo migration, so the repo can't reproduce production.

## Two parallel histories

Since 2026-05-09 the repo and the production `schema_migrations` ledger keep **separate
bookkeeping** for the same changes: repo files use round hand-authored timestamps
(`20260512200000`), while the ledger records wall-clock apply-time versions (`20260512143...`).
Consequence: **the ledger version list is not a reliable index of which repo files were applied** —
object-level verification is required to know the truth (see [[Migration Drift Audit 2026-05]]).

## Deployment checklist (every `supabase/` change)

1. Push code to `main` (Lovable deploys frontend).
2. Apply migrations to prod (`apply_migration` or `supabase db push --linked`).
3. Deploy edge functions (`deploy_edge_function` or `supabase functions deploy <name>`).
4. Mirror any prod-applied change back into a repo migration file.
5. Verify: `npm run migrations:audit` + `supabase migration list --linked`.
6. Verify the feature in production (DevTools, desktop + mobile).

## Known Issues

- **Back-dating silently skips:** a migration stamped earlier than an already-applied one is
  skipped by `supabase db push`. Never back-date; never reuse a version prefix (the ledger keys on
  it). `npm run migrations:audit` flags both.
- **`db dump`/`db pull` need Docker.** When Docker is unavailable, introspect production with
  `supabase gen types typescript --linked` (columns + functions) and `supabase inspect db
  index-sizes/table-sizes --linked` (tables + indexes) — both work without Docker.

## Auditing

- `npm run migrations:audit` (`scripts/audit-migrations.mjs`) — local lint for duplicate,
  back-dated, and malformed migration filenames; exits non-zero on hard anomalies.
- Full drift audit procedure and the latest results: [[Migration Drift Audit 2026-05]].

## See Also

- [[Supabase]] — backend the migrations run against
- [[Lovable]] — deploys frontend only; the gap this concept exists to close
- [[Migration Drift Audit 2026-05]] — 2026-05-31 audit: 1 true drift (`campaign_skips`), 51
  prod-only ledger entries, duplicate version `20260526200000`
