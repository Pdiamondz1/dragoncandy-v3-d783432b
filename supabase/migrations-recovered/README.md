# Recovered migrations — a record, not a replay path

These 39 files are the SQL of migrations that were applied to **production** and
had no file anywhere in this repo. They were read back out of production's own
`supabase_migrations.schema_migrations` table on 2026-08-24, where the ledger
stores each migration's statements alongside its version.

They are **deliberately not in `supabase/migrations/`.** The Supabase CLI reads
only that directory, so nothing here is ever executed, and that is the point.

## Why they cannot live in the migrations directory

Each file carries **production's** version stamp. For much of this work the repo
authored the same migration under a *different* stamp — 189 of the repo's
unrecorded files are byte-equal to a ledger row under another version. Dropping
production's stamps into the replay sequence therefore does not extend the
history, it interleaves a second copy of it at the wrong points.

Two concrete cases, both found by review rather than reasoning:

- `20260628032233_dre_engine_schema.sql` sorts *after* the repo's own
  `20260627000000_dre_engine_schema.sql`, and would re-`create policy
  dre_config_auth_select` on a fresh database — a hard `already exists`, which
  stops the whole run.
- `20260723150524_synthetic_weight_safety_spine.sql` sorts *after*
  `20260723132000_fix_handle_new_user_preserve_internal_scope.sql` and would
  replace `handle_new_user()` with the body that fix corrected — silently
  reinstating consumer profiles for internal AIOS accounts.

Neither is a defect in the recovered SQL. Both ran correctly on production in
production's order. They are only wrong as members of *this* sequence, and no
amount of per-file idempotency fixes that: the stamps are the problem, and the
stamps are what makes them a faithful record.

## What they are for

- Reading. `20260808120130_can_notify_user_active_relationships.sql` is the
  function this project's docs describe as nearly lost.
- Stage 2 of the ledger reconciliation, which decides for each version whether
  the repo's copy or production's is authoritative.
- Stage 3, the baseline, which replaces the whole sequence with one schema dump
  taken from production and verified by restoring it.

## Fidelity

Each file is its ledger row's SQL verbatim beneath a four-line header. Stripping
the header reproduces the ledger content exactly; this was checked for all 39,
with a control that a one-character change is detected.

One file needs naming: `20260517191941_reset_transactional_data.sql` is 24
`TRUNCATE ... CASCADE` statements. It is kept verbatim because this directory is
a record and truncating its own record would defeat that — but it is real SQL
that really emptied a database, so do not run it looking for its side effects.
Its sibling, `supabase/migrations/20260517100000_reset_transactional_data.sql`,
*is* in the replay path and is neutralised there for exactly this reason.
