---
title: Updated-At Trigger Drift
type: concept
created: 2026-08-07
updated: 2026-08-08
sources: [2026-08-07-handle-updated-at-restore.md]
tags: [database, prod-drift, triggers, timestamps, dre, analytics, migrations]
---

# Updated-At Trigger Drift

For most of this project's life, `public.handle_updated_at()` on **prod** was a no-op stub:

```sql
BEGIN
    -- Function logic here
    RETURN NEW;
END;
```

It never assigned `NEW.updated_at`. All **35 triggers across 31 tables** bound to it fired and
changed nothing, so `updated_at` was frozen equal to `created_at` on every affected row.

**The repo was never wrong.** Both definitions — `20250616011059` and `20250617123640` — have
always said `NEW.updated_at = now()`. Production had diverged from them. This is the same
`recorded ≠ actual` class as [[Content Delivery State Machine]]: `schema_migrations` says a
migration ran; the object in the database is something else.

Restored 2026-08-07 by PR #385 / migration `20260807233200`, and proven by a rollback-wrapped live
round-trip on `feature_flags` — `updated_at` moved to `now()`.

## How it was found

Not by a bug report, and not by anything looking for it. A `knowledge-sync` verification step
keyed on `max(updated_at)` reported Donny's RAG as stale while the row's *content* was
demonstrably the new revision. The contradiction — content fresh, timestamp frozen — was the only
symptom this defect ever produced.

That is the general shape: a silently-broken write path produces no error, only a reader somewhere
drawing a confident wrong conclusion. See also [[Reading Agent Traces]] on treating extraction
output as leads rather than verdicts.

## The rule that survives the fix

Restoring the trigger did **not** make `updated_at` a status signal, and this is the part worth
carrying forward:

> `updated_at` moves on **any** write. A title edit is indistinguishable from a status change.

For "when did this *happen*", use a purpose-built anchor stamped by its own narrow trigger, fired
**only on the state transition** — never on any update that leaves the row in that state, or the
anchor becomes as mutable as the column it replaced.

Existing anchors, all of which exist for exactly this reason:

| Anchor | Table | Stamped on |
|---|---|---|
| `content_submitted_at` | `campaign_collaborations` | transition into `content_status='submitted'` ([[Creator Groups (Crews)]] Phase 2) |
| `payout_executed_at` | `campaign_collaborations` | the instant money moves ([[Payout Finalization & Re-entrancy]]) |
| `completed_at` | `campaigns` | transition into `status='completed'` (added by `20260807233000`) |
| `escrow_status_changed_at` | `campaigns` | transition of `escrow_status` only (`20260808020000`, PR #391) |
| `status_changed_at` | `campaign_collaborations` | transition of `status` or `content_status` (`20260808020000`, PR #391) |

`campaigns` had none until this session — which is precisely why the DRE migration reached for
`updated_at` and *said so in a comment*:
`-- business campaign milestones (5/10/25/50) — campaigns has no completed_at`. The root cause was
written down in the repo years before anyone acted on it.

## The two consumers that had adapted to it being broken

A one-line `CREATE OR REPLACE` was the whole repair. The work was everything that had quietly come
to depend on the column never moving — both hazards had to land **before** the restore.

**`donny-analytics-alerts`** filtered `.gte("updated_at", since)` on `campaigns` and
`campaign_collaborations`. Against a frozen column that is a *"created in the last 24h"* filter.
Restoring the trigger would have silently reinterpreted it as *"modified in the last 24h"*,
emitting "Payment released" / "Revision requested" for rows whose status never changed. Repointed
to `created_at` (v96).

**DRE `occurred_at`** ([[Dragon Rewards Engine (DRE)]]) derived milestone timestamps from `updated_at`.
Once the column moves, an edit to an old campaign dates an old milestone as fresh, clears
`dre-award-engine`'s forward-only `go_live_at` gate, and fires "You earned DC Points" for
months-old activity. The *awards* were never at risk — `dragon_point_events` has
`UNIQUE(user_id, event_type, source_id)` and freezes `occurred_at` once written. **What was at
risk is who gets notified.** Anchors moved to `coalesce(completed_at, created_at)`.

The SQL writers that set `updated_at = now()` inside RPCs need no change, because `now()` is
`transaction_timestamp()` — the trigger's `now()` in the same transaction is the *identical* value,
not a clobber. The edge-function and frontend writers that set `new Date().toISOString()` simply
upgrade from a client clock to the DB clock. No frontend site treats `updated_at` as stable,
compares it to `created_at`, or keys a cache on it.

> **The writer audit undercounted, and it mattered.** The pre-merge audit reported "34 explicit
> writers, of which 2 are edge functions" and — the load-bearing claim —
> "`campaign_collaborations.updated_at` has **zero** explicit writers". Both are wrong. A grep for
> `updated_at: new Date().toISOString()` alone returns ~20 edge-function sites, and
> `src/hooks/useProjectComplete.ts:52` writes `campaign_collaborations.updated_at` directly on the
> completion path. Prod confirms it: **10 of 16** pre-restore collaboration rows have
> `updated_at != created_at`. Caught only because a Codex P2 about a *documentation* over-claim
> prompted a check against real rows. See "Known Issues" for what this changes.

## The follow-up: `status_changed_at` (2026-08-08, PR #391)

The `created_at` fallback above was the safe choice, not the right one, and it was shipped with the
gap recorded. PR #391 closed it with the anchor the code had been missing all along:

| Column | Watches | Consumer |
|---|---|---|
| `campaigns.escrow_status_changed_at` | `escrow_status` **only** | payment_events |
| `campaign_collaborations.status_changed_at` | `status` + `content_status` | status_changes |

**The asymmetry is the lesson.** The first draft gave `campaigns` one anchor watching `status` and
`escrow_status`, symmetric with collaborations. Codex caught it: a campaign going
`active → completed` with escrow unchanged at `held` would stamp the anchor and make the alert
announce *"Funds held in escrow"* for an escrow event that never happened — reintroducing the exact
false-positive class the change existed to remove. Collaborations legitimately watch both, because
their alert labels `content_status || status`.

> The test for an anchor is never "how many columns". It is **"does every column this stamps on
> produce an event the reader actually reports"**. Symmetry between two tables is not evidence of
> correctness; the consumer is.

Two traps designed around, both recorded in the migration header so they aren't "fixed" back in:

- **No backfill.** `UPDATE ... SET <anchor> = created_at` is not free on these tables — it fires
  `handle_updated_at` (live again after the restore above), stamping `updated_at` across both core
  tables and flattening the three `.order('updated_at')` call sites, and
  `enforce_single_slot_campaign` re-evaluates on a no-op UPDATE and can `RAISE`, aborting the
  migration. Cost of skipping: a one-time ≤24h gap that self-heals.
- **`DEFAULT now()` set AFTER `ADD COLUMN`.** A volatile default inside `ADD COLUMN` is evaluated
  for every existing row — which would make the whole table look like it just changed and produce
  precisely the alert storm the column prevents.

Verified on prod by a `RAISE`-aborted (therefore atomically rolled back) probe: a no-op edit and a
**status-only** change both left `escrow_status_changed_at` NULL, while a real escrow transition
stamped it. That middle case is the regression, tested directly rather than argued.

Deploy order was **reversed** from the restore: migration first, then the function, because this
reads new columns. The `edge-function-reviewer` also caught that the three queries gated only on
`if (data)` and never checked `error` — so an out-of-order deploy would have skipped the alert
blocks *silently*, with no exception and no signal. It would have looked like a quiet day.

## Key Decisions

- **Restore rather than document-and-live-with.** The stub had already cost one false "RAG is stale" conclusion; every future reader would pay the same tax.
- **Fix the consumers first, in a strict order.** Deploy → `completed_at` → DRE anchors → restore. Reversed, there is a window where alerts misfire and milestone notifications fire retroactively. `20260807233100` is `language sql`, so Postgres validates its body at `CREATE` time and rejects it if `completed_at` is absent — the ordering partly enforces itself.
- **Add a real anchor instead of taking the cheap suppression.** The founder chose "keep milestones suppressed", and the option presented to them (bare `created_at`) would have delivered that — while *also* silently suppressing legitimate **future** milestones, since a business completing its 5th campaign next week on months-old campaigns would get a months-old `occurred_at` and land before `go_live_at`. The recommendation was withdrawn and replaced after reading the SQL. **A preview shown to a decision-maker is a claim; verify it before they act on it.**
- **Behavior held against Codex's dissent, and annotated instead.** See below.

## Known Issues

- **The alert windows are narrower than ideal, deliberately.** Codex flagged (P2) that post-restore, `updated_at` *would* be a usable status signal, so a real escrow change on an older row won't alert. Factually right, but measured against a state that was never live, and the implied alternative is the option the founder declined — `updated_at` moves on any write, so "alert on modification" fires "Payment released" off a title edit. **RESOLVED 2026-08-08 (PR #391)** by exactly that: `escrow_status_changed_at` / `status_changed_at`, each stamped by its own narrow trigger. See the follow-up section above. All three call sites carry the rationale in comments so it isn't re-litigated blind.
- **The `created_at` repoint costs real alerts on BOTH tables — more than was reported at merge time.** The claim made in the migration header and the PR was that `campaign_collaborations` was *exactly* equivalent because it had no explicit `updated_at` writer. It has one (`useProjectComplete.ts`), so that block was **partially functional**, not inert. Quantified on prod with the live 24h window: of 16 collaborations, 10 have a moved `updated_at`, and **1** moved more than 24h after creation — i.e. roughly 1 in 16 historical status changes would have alerted under the old filter and now won't. Still a **pure narrowing** (an UPDATE can never predate its own INSERT, so `updated_at >= created_at` always holds and no row newly appears), and still small — but "equivalent" was wrong. **This makes the Codex dissent below materially stronger than it was credited.**
- ~~The deployed `donny-analytics-alerts` comment overstates the case.~~ **Fixed in PR #391** — the comment was rewritten with the measurement when the function was redeployed (v97) for the anchor change, exactly as planned rather than as a standalone comment deploy.
- **Legacy `updated_at` is unreliable in both directions.** A pre-2026-08-07 row with `updated_at == created_at` means "no explicit writer touched it", not "never modified". But tables with an application-level writer moved anyway (`campaign_collaborations` 10/16, `organizations` 7/24; `campaigns` and `conversations` 0/26 and 0/13). And any legacy row updated after the restore moves normally. Verify per table; don't generalize.
- Four tables (`beta_feedback`, `feature_flags`, `onboarding_steps`, `user_onboarding_progress`) carry **two** triggers bound to this function. Both assign the same `now()` in one transaction, so the duplication is idempotent — but it is why a trigger count (35) and a table count (31) disagree.
- **The fix rotted every doc that explained the bug.** Found 2026-08-08 during the post-merge
  `verify-knowledge` run: four files still described the stub in the **present tense** as live prod
  behaviour — `knowledge-sync/SKILL.md` ("*~30 tables are wired to this same stub — treat
  `updated_at` as untrustworthy on any of them*"), its `MEMORY.md`, `verify-knowledge/SKILL.md`'s
  own gating rationale, and the **live daily** `knowledge-freshness-agent.md`. Each had demoted
  `max(updated_at)` to advisory *because the column could not move*; measured on prod that day,
  **231 of 237** `donny_knowledge` rows have `updated_at > created_at` — it moves. Every decision
  was still right, so only the stated reasons were rewritten (and date-stamped). Two lessons:
  **(1)** all three validator checks stayed green throughout, because none of these files live under
  `docs/wiki/` — the knowledge layer is wider than the wiki. **(2)** the tell is a doc asserting prod
  behaviour in the present tense with a confirmation date; **that date is an expiry, not a
  warranty**. When a change alters prod behaviour, grep the repo for the *claim*, not the subsystem.

## See Also

- [[Content Delivery State Machine]] — the sibling `recorded ≠ actual` prod drift, and the precedent for verifying `pg_proc` over `schema_migrations`
- [[Dragon Rewards Engine (DRE)]] — the `occurred_at` / `go_live_at` gate this protects
- [[Payout Finalization & Re-entrancy]] — `payout_executed_at`, the same narrow-anchor pattern applied to money
- [[Creator Groups (Crews)]] — `content_submitted_at`, the anchor this one was copied from
- `knowledge-sync` / [[Validator Skills → Loops Session]] — the verification step whose contradiction surfaced the defect
