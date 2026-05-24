---
title: Counter-Offer Enum Fix Session
type: source
created: 2026-05-21
updated: 2026-05-24
sources: [raw/sessions/2026-05-21-counter-offer-enum-fix.md]
tags: [postgres, enum, rpc, bug-fix]
---

# Counter-Offer Enum Fix Session

Session from 2026-05-21 fixing counter-offer submission failures caused
by a Postgres enum cast bug. PL/pgSQL functions that declared variables
as `text` and then assigned enum literal values failed silently or threw
cast errors when those variables were used in queries against
enum-typed columns. Additionally, the `campaign_status` enum was missing
the `in_progress` value, causing status transitions to fail.

## Key Decisions

- Fixed all PL/pgSQL function variable declarations to use the actual
  enum type (e.g., `application_status`) instead of `text`, eliminating
  implicit cast failures.
- Added the missing `in_progress` value to the `campaign_status` enum
  via an `ALTER TYPE ... ADD VALUE` migration rather than recreating
  the enum, which would have required rewriting all dependent columns
  and constraints.

## Patterns Discovered

- PL/pgSQL functions must declare variables with the correct enum type,
  not `text`. Postgres does not implicitly cast text literals to enum
  values inside function bodies the way it does in ad-hoc SQL — the
  variable type determines the cast behavior at assignment time.
- `ALTER TYPE ... ADD VALUE` is non-transactional in Postgres (it
  cannot be rolled back), so it should be applied as its own migration
  step to avoid partial transaction failures.
- Enum cast bugs surface as runtime errors that are difficult to
  reproduce in development because ad-hoc SQL in psql or the Supabase
  SQL editor does perform implicit text-to-enum casts, masking the
  issue.

## See Also

- [[Supabase]]
- [[Campaign Lifecycle]]
