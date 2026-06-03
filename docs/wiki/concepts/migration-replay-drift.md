---
title: Migration Replay Drift
type: concept
created: 2026-06-02
updated: 2026-06-02
sources: [raw/sessions/2026-06-02-205607-qa-staging-supabase-planb.md]
tags: [migrations, supabase, schema, staging]
---

# Migration Replay Drift

Production was built through Lovable's migration path, **not** a clean sequential
`supabase db push`. As a result the repo's `supabase/migrations/` history accumulated
latent defects that never mattered on prod but **break a clean replay onto an empty
database** (e.g. standing up a [[Supabase]] staging project for the [[QA CI/CD Gate]]).
Discovered while replaying all 213 migrations onto `dragoncandy-staging`.

## The Seven Defect Classes

1. **Missing `;` after dollar-quoted bodies** — `$function$`/`$$` close tag not
   terminated before the next statement (Lovable-generated). `db push` errors at
   the next `CREATE`. Detector: `scripts/fix-migration-terminators.mjs` (CRLF-safe;
   must NOT false-positive on `$$` used as string literals/args).
2. **`CREATE OR REPLACE FUNCTION` that changes the return type** → `42P13`; needs a
   `DROP FUNCTION IF EXISTS` first.
3. **Data/seed migrations assuming prod rows** — e.g. `SELECT id FROM auth.users`
   yields NULL on an empty DB → NOT NULL violation. Guard with `IF EXISTS(...)`/count so they no-op.
4. **Out-of-band objects never captured in a migration** — e.g. `get_user_org_ids()`
   existed only in prod (added via dashboard). Recover via `pg_get_functiondef` against
   prod and add a new migration.
5. **Columns added out-of-band on prod** — a clean replay's schema lacks them, so
   later migrations referencing them fail (`column does not exist`).
6. **Deprecated extensions** — `pgsodium` transparent column encryption is unavailable
   on new Supabase projects; wrap in an exception-guarded block (encrypted on prod,
   plaintext fallback on staging).
7. **Duplicate migration version prefixes** — two files sharing a 14-digit timestamp
   collide on the `schema_migrations` primary key; rename one to a unique adjacent version.

## Resolution Strategy

**Fix-forward** (chosen over a prod-schema baseline dump): repair each migration so the
set replays cleanly, because the CI gate's value depends on replayability. `db push` is
resumable — it records each migration as applied, so after a fix you re-run and it
continues. Pure-data destructive migrations (cleanup/reset) are **skipped** with
`supabase migration repair --status applied <version>` rather than executed on a fresh DB.

## Implications

- A staging DB that can be rebuilt from migrations is itself a CI asset; the fixes
  benefit prod reproducibility too (prod already recorded them by version, so edits don't re-run).
- Going forward, migrations should be authored clean (proper terminators, `DROP` before
  return-type changes, no out-of-band schema, unique versions).

## See Also

- [[QA Staging Supabase (Plan B) Session]]
- [[QA CI/CD Gate]]
- [[Supabase]]
- [[Counter-Offer Enum Fix Session]]
