# Session — restoring `handle_updated_at()`, and the consumers that had quietly adapted to it being broken

**Date:** 2026-08-07
**PRs:** #385 (`fix/restore-updated-at-trigger`)
**Migrations:** `20260807233000`, `20260807233100`, `20260807233200` — all applied to prod 2026-08-08 ~01:15 UTC
**Edge function:** `donny-analytics-alerts` v95 → v96

## How it surfaced

Not from a bug report. During the previous session's `knowledge-sync` I hit a contradiction: a
`donny_knowledge` row's *content* was demonstrably the new revision, but its `updated_at` equalled
its `created_at` from 78 minutes earlier. The verification step keyed on `max(updated_at)`, so it
reported the RAG as stale when it was current.

Chasing that produced the root cause: `public.handle_updated_at()` on prod had a body of literally

```
BEGIN
    -- Function logic here
    RETURN NEW;
END;
```

It never assigns `NEW.updated_at`. Every trigger bound to it fired and changed nothing.

**This was prod drift, not repo state.** Both repo definitions — `20250616011059` and
`20250617123640` — have always said `NEW.updated_at = now()`. Production had diverged. Same
"recorded ≠ actual" class as the collaboration state machine repaired in PR #325: the migration is
recorded in `schema_migrations`, the object in the database is something else.

Measured blast radius on prod: **35 triggers across 31 tables**. Four tables (`beta_feedback`,
`feature_flags`, `onboarding_steps`, `user_onboarding_progress`) carry *two* triggers each bound to
the same function — harmless, since both assign the same `now()` inside one transaction.

## Why the fix was not one line

`CREATE OR REPLACE FUNCTION` is the whole repair. The work was everything that had, over years,
silently come to depend on the column never moving. Two subagents audited the blast radius in
parallel; the audit found 34 explicit `updated_at` writers, every frontend read, and two genuine
hazards.

**Safe — the 34 explicit writers.** 32 are SQL `updated_at = now()` inside RPCs. `now()` is
`transaction_timestamp()`, so the trigger's `now()` in the same transaction is the *identical*
value — not a clobber. The other 2 are edge functions writing `new Date().toISOString()`
(`refund-campaign-escrow`, `sync-seat-count`); those get upgraded from an edge clock to the DB
clock. Meaning preserved, skew removed.

**Safe — the entire frontend.** Zero sites treat `updated_at` as stable, compare it to
`created_at`, filter on it, or key a cache on it. Three `.order('updated_at')` call sites are plain
top-N with no cursor, so rows reorder correctly with no skip/duplicate hazard.

**Hazard 1 — `donny-analytics-alerts`.** Three filters read `.gte("updated_at", since)` on
`campaigns` and `campaign_collaborations`. Against a frozen column that is a *"created in the last
24h"* filter. Restoring the trigger would have silently converted it to *"modified in the last
24h"* and started emitting "Payment released" / "Revision requested" alerts for rows whose status
never changed. Repointed to `created_at`.

**Hazard 2 — DRE `occurred_at`.** `dre_pending_events()` derived milestone `occurred_at` from
`updated_at`. Once the column moves, a routine edit to an old campaign dates an old milestone as
fresh, clearing `dre-award-engine`'s forward-only `go_live_at` gate and firing "You earned DC
Points" for months-old activity. The awards themselves were never at risk —
`dragon_point_events` has `UNIQUE(user_id, event_type, source_id)` and freezes `occurred_at` once
written. What was at risk is **who gets notified**.

## The recommendation I made and then rejected

The founder was asked to choose, and picked "keep milestones suppressed". The option I showed them
swapped the DRE anchors to bare `created_at`.

Reading the actual SQL afterwards showed that preview was wrong. Bare `created_at` suppresses
retroactive firing, but it *also* suppresses legitimate **future** milestones: a business
completing its 5th campaign next week, on campaigns created months ago, gets an `occurred_at` from
months ago, lands before `go_live_at`, and is never told. The founder approved that on my framing.

The real cause was that `campaigns` **had no completion anchor at all** — which is precisely why
the original DRE migration reached for `updated_at` and said so in a comment:
`-- business campaign milestones (5/10/25/50) — campaigns has no completed_at`.

So the fix adds one. `campaigns.completed_at`, stamped by a trigger that fires **only on the
transition into `completed`** (a no-op update leaving `status='completed'` must not re-stamp, or
the anchor is as mutable as the column it replaces). Pattern copied from
`content_submitted_at` (`20260710120007`), which exists for this same reason and whose header
already recorded `handle_updated_at` as "a verified no-op" — the knowledge was in the repo the
whole time. Anchors became `coalesce(completed_at, created_at)`.

## Codex dissent, resolved by annotation rather than change

Codex flagged the `created_at` alert windows as P2 regressions: after the restore, `updated_at`
*would* be a usable status signal, so a real escrow change on an older row won't alert.

Factually right, but measured against a state that has never been live — the stub means those
filters already behave as "created in window" today. The implied alternative is the option the
founder explicitly declined, and it is worse: `updated_at` moves on any write, so "alert on
modification" fires "Payment released" off a title edit. Behavior was left as decided, and all
three call sites annotated with the rationale, the known limitation, and the genuinely correct fix
— a `status_changed_at` stamped by its own narrow trigger, exactly like the `completed_at` added
here. That remains open.

The `edge-function-reviewer` also corrected an overstatement of mine. I had written that the
filter change "preserves today's behavior exactly." It does not quite:
`campaign_collaborations.updated_at` has zero explicit writers (those two blocks *are* exactly
equivalent), but `campaigns.updated_at` has exactly one —
`accept_application_with_collaboration` sets `status='active', updated_at=now()` without touching
escrow. So an older campaign with escrow already held, whose creator is accepted today, matched
the old filter and no longer matches. Since an UPDATE can never predate its own INSERT,
`updated_at >= created_at` always holds, making this a **pure narrowing**: no row newly appears, a
few stop alerting, and those were mistimed anyway.

## Ordering, and why it was load-bearing

1. Merge the PR
2. Deploy `donny-analytics-alerts` (v96)
3. Apply `20260807233000` (`campaigns.completed_at`)
4. Apply `20260807233100` (DRE anchors)
5. Apply `20260807233200` (the restore)

Reversed, there is a window in which alerts misfire and milestone notifications fire
retroactively. `20260807233100` is `language sql`, so Postgres validates its body at `CREATE` time
and rejects it outright if `completed_at` isn't there yet — the ordering partly enforces itself.

## Verified on prod, not assumed

- Pre-state: `pg_get_functiondef(...) ilike '%NEW.updated_at%'` → **false** (stub confirmed live).
- 35 triggers / 31 tables enumerated directly; the 31-vs-35 gap resolved as four double-bound tables, not an audit gap.
- `campaigns.completed_at` + `trg_set_campaign_completed_at` exist; `completed` campaigns on prod = **0**, unanchored = **0**.
- `dre_pending_events()` retains `security definer`, `search_path=public`, and grants `service_role`/`postgres` only; both anchors present; no stale `ca.updated_at`.
- Live rollback-wrapped round-trip on `feature_flags`: `updated_at` moved to `now()`. **Trigger fires.**
- `dre_pending_events()` returns **0 pending events** — the engine is fully caught up, so the restore fires nothing retroactively. Nothing to suppress.
- Post-merge hook auto-synced Donny's RAG: `errors=0`.

Scope note: prod had **zero** completed campaigns and all 11 completed collaborations already
carried `completed_at`. The DRE cluster touched no live rows. This is future-proofing, not a live
repair — the live repair was the analytics alerts.

## Gotchas worth keeping

- A migration recorded in `schema_migrations` is not proof the object exists, and is not proof the object still has the body the migration gave it. Check `pg_get_functiondef`.
- `now()` is `transaction_timestamp()`. A BEFORE-UPDATE trigger's `now()` and an RPC's `updated_at = now()` in the same transaction are the same value — that's why 32 writers needed no change.
- A stale `-- ...has no completed_at` comment in an already-merged migration is worth reading as a **finding**, not decoration. It named the root cause years before this session.
- Rows written before 2026-08-07 have a frozen `updated_at` equal to `created_at`. Any recency sweep spanning that date reads them as never-modified.
- `dre_config` is a key/value table (`config_key`/`config_value jsonb`), not a wide row — `select go_live_at from dre_config` fails.

## Post-merge correction (2026-08-08) — the writer audit was wrong

A Codex P2 against the *documentation* ("rows before 2026-08-07 carry a frozen `updated_at`" is
overbroad) prompted a check against real rows, which falsified something bigger: the audit's claim
that **`campaign_collaborations.updated_at` has zero explicit writers**, which was the entire basis
for calling that alert block "exactly equivalent".

It has one — `src/hooks/useProjectComplete.ts:52`, on the completion path. Prod shows **10 of 16**
pre-restore rows with `updated_at != created_at`, and the give-away is in the timestamps
themselves: 3-digit milliseconds (JS `toISOString()`) against `created_at`'s 6-digit microseconds
(`now()`). The broader count was off too — a grep for `updated_at: new Date().toISOString()` alone
returns ~20 edge-function sites against the 2 the audit reported.

**Impact, measured against the live 24h window:** of 16 collaborations, 1 moved more than 24h after
creation. So the repoint costs ~1-in-16 historical status alerts, not zero. The conclusion survives
— still a pure narrowing, still small — but "equivalent" was false, and Codex's original P2 on line
232 was materially stronger than it was credited when the decision was made to hold behavior and
annotate.

**Method lesson:** the audit was done by reading code and reasoning about it, and it was checked by
*more reading*. What broke it open was one query against actual rows. A claim of the form "nothing
writes X" is cheaply falsifiable with data — so falsify it with data, not with a second read.
