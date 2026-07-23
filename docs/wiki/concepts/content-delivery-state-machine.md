---
title: Content Delivery State Machine
type: concept
created: 2026-05-23
updated: 2026-07-23
sources: [docs/content-delivery-system-flows.md, docs/wiki/raw/sessions/2026-07-23-content-state-machine-drift-repair.md, docs/wiki/raw/sessions/2026-07-23-posting-schedule-failed-status.md]
tags: [state-machine, content-delivery, collaboration]
---

# Content Delivery State Machine

The core of DragonCandy's marketplace — manages what happens after a
creator is hired for a campaign.

## States

```
pending → in_progress → submitted → approved/auto_approved → payment released
                                  → revision_requested (max 2) → submitted (loop)
                                  → rejected → disputed → resolved
```

## Status Transitions

| From | To | Trigger |
|------|-----|---------|
| pending | in_progress | Creator starts work |
| in_progress | submitted | Creator submits content |
| submitted | approved | Restaurant approves |
| submitted | auto_approved | Review timer expires |
| submitted | revision_requested | Restaurant requests changes (max 2) |
| revision_requested | submitted | Creator resubmits |
| revision_requested + exhausted | rejected | Restaurant rejects after all revisions |
| submitted + `revision_count ≥ 2` | rejected | Restaurant rejects a resubmission past the revision budget (added 2026-07-23 — see Drift Repair below) |
| rejected | disputed | Auto-transition |
| disputed | resolved | Admin resolves (refund/partial/approved) |

> The transitions above are enforced by the SECURITY DEFINER `transition_content_status()`
> RPC, which is **service-role-only** (called by `auto-approve-content`, `reject-content`,
> `resolve-dispute` through the service-role client) and `REVOKE`d from `public/anon/authenticated`.
> The **client never calls the RPC** — the creator/business UI does raw `.update()`s — so the
> RPC's validation only actually guards the three edge-function paths, not the UI writes.

## Alternative Path: Dual Completion

Either party can request completion:
1. Party A clicks "Mark Complete" → their `*_completion_status = 'requested'`
2. Party B clicks "Approve Completion" → both set to `'approved'`
3. System: collaboration → completed, content → approved, payment released

## Key Invariants

- Escrow must be held before collaboration is created
- Max 2 revision requests total
- Auto-approval timers vary by delivery tier ([[DragonDash]])
- Rejection auto-transitions to dispute — no content goes unpaid without mediation

## Prod Drift Incident & Repair (2026-07-23, PR #325)

This machine was **recorded as shipped but silently non-functional on prod for months.**
The migration that defines it (`20260425000000_collaboration_state_machine`, + the revision
guard `20260408100002`) was recorded in `schema_migrations` as applied, yet its objects were
**missing from the prod database** (`recorded ≠ actual` — a phantom-applied migration).
Missing: `transition_content_status`, `content_disputes`, `enforce_revision_limit` (+trigger),
`recompute_final_approval` (+trigger), the budget RPCs + `campaigns.budget_spent`, and the
expanded `content_status` CHECK (prod still had the original 5 values, forbidding
`auto_approved/rejected/disputed/resolved`). So auto-approval, `reject-content`, and
`resolve-dispute` all failed at the RPC call; only manual "Approve & Pay" (a raw write to
`approved`) worked.

**Auto-approval was dead three independent ways**, all fixed:
1. The cron timed the review window off `submitted_at`, which the client submit paths never set
   (only the missing RPC did). Fixed to key off **`content_submitted_at`** — the column the
   `set_content_submitted_at` trigger reliably stamps on every entry to `submitted` (a strict
   superset of `submitted_at`). The old filter had matched **zero rows** — auto-approval had
   never once fired.
2. **No `pg_cron` job existed** to invoke `auto-approve-content`. Scheduled `*/15` via the Vault
   + `net.http_post` fleet pattern; the function's auth moved to the shared `isAuthorizedIngest`
   gate so it accepts the `aios_ingest_key` bearer without a strict-key 401.
3. The RPC + the CHECK values it writes were missing — restored by the migration.

**IDOR closed as part of the repair:** `transition_content_status` is SECURITY DEFINER and only
runs its participant check when `p_actor_id IS NOT NULL` (a forgeable client value). The
original migration shipped **no REVOKE**, so the default PUBLIC grant let any anon/authenticated
caller drive another actor's collaboration. The repair adds
`REVOKE EXECUTE … FROM public, anon, authenticated` (`service_role` keeps its own direct grant,
so the three callers are unaffected — see [[Service-Role Data Exposure]]).

**Lesson:** on this prod DB, `schema_migrations` recording is not proof the objects exist —
verify directly (`pg_proc`/`information_schema`/`pg_trigger`) before assuming a documented
feature works. Full narrative: the 2026-07-23 drift-repair session source.

**Sibling CHECK-gap in the post-approval scheduling leg (2026-07-23, PR #326).** The same
recorded-vs-intended pattern hit `campaigns.posting_schedule_status`: `confirm-posting-schedule`
writes `'failed'` when every post fails to schedule, and `CampaignScheduleSection` already renders
a "Schedule Failed" card for it — but the CHECK from `20260527100000` never allowed `'failed'`, so
the UPDATE silently violated the constraint (only `console.error`'d), leaving the status stuck at
`pending_review` and the built UI unreachable. Migration `20260723130000` adds `'failed'` to the
CHECK (DB-only; code already writes + renders it). Same lesson: verify the actual prod CHECK against
what the code writes/renders. See the posting-schedule-failed-status session source.

## See Also

- [[Campaign Lifecycle]]
- [[DragonDash]]
- [[Stripe Connect]]
- [[Service-Role Data Exposure]]
- [[Content Delivery System Flows]]
