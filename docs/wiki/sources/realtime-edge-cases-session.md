---
title: Realtime Edge Cases Session
type: source
created: 2026-05-06
updated: 2026-05-24
sources: [raw/sessions/2026-05-06-053114-realtime-edge-cases.md]
tags: [realtime, race-conditions, presence]
---

# Realtime Edge Cases Session

Session from 2026-05-06 (05:31) addressing race conditions and edge
cases in the realtime subsystem. Fixed sponsorship accept race
conditions, double-click payment submission, message draft persistence
across navigation, presence ghost state on tab close, message retry on
failure, staleTime overrides causing stale data, and a single-slot
campaign acceptance trigger.

## Key Decisions

- Used `fetch` with `keepalive: true` for presence cleanup on
  `beforeunload` instead of `navigator.sendBeacon`, because Supabase
  requests require Authorization headers that sendBeacon cannot attach.
- Guarded sponsorship accept with `.in()` status filters so concurrent
  accept attempts on the same sponsorship are idempotent rather than
  producing duplicate collaborations.
- Replaced a partial unique index approach for single-slot campaign
  acceptance with a database trigger, because partial unique indexes
  were fragile across status transitions and the trigger could enforce
  the business rule regardless of which status values are involved.

## Patterns Discovered

- `fetch` with `keepalive: true` is the correct pattern for unload-time
  network calls when custom headers are required — sendBeacon only
  supports simple POST bodies.
- `.in()` status guards on Supabase mutations make concurrent writes
  idempotent by ensuring only rows in expected states are modified.
- Database triggers are more robust than partial unique indexes for
  enforcing single-slot invariants because they survive status value
  changes without index redefinition.
- `staleTime` overrides on individual queries can mask realtime updates;
  prefer consistent staleTime values or explicit invalidation.

## See Also

- [[Supabase]]
- [[Campaign Lifecycle]]
- [[Error Handling Patterns]]
