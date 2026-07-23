# Content-delivery state-machine drift repair + auto-approval revival (2026-07-23, PR #325)

## What prompted it

The founder asked to explore "content-delivery stabilization" — the launch-gating
workstream (PROJECT_CONTEXT §5 In flight). Three parallel Explore agents mapped the
content-handoff state machine, the payment/payout flow, and the known-bug inventory.
The headline finding was not a scattered bug list but a **schema-drift incident**.

## The incident: a phantom-applied migration

`20260425000000_collaboration_state_machine` (and `20260408100002_revision_limit_trigger`)
are recorded in `supabase_migrations.schema_migrations` as applied, but several of their
objects **did not exist in the prod database** (`recorded ≠ actual`). Verified missing via
`pg_proc` / `information_schema` / `pg_trigger` on prod 2026-07-23:

- `transition_content_status()` — the RPC called by `auto-approve-content`, `reject-content`,
  and `resolve-dispute`. All three were failing at the RPC call.
- `content_disputes` table (+ indexes + RLS).
- `enforce_revision_limit()` + `trg_enforce_revision_limit` (the max-2-revisions guard).
- `recompute_final_approval()` + `trg_recompute_final_approval` (joint-approval sync).
- `increment_budget_spent` / `decrement_budget_spent` + `campaigns.budget_spent`.
- The expanded `content_status` CHECK — prod still had the **original 5-value** set
  (`pending, in_progress, submitted, revision_requested, approved`), forbidding
  `auto_approved / rejected / disputed / resolved`.

Already-present (left untouched so a later version isn't regressed): `insert_payment_event`,
`set_content_submitted_at`, and the `submitted_at` / `content_submitted_at` / `dispute_reason`
/ `dispute_outcome` / `final_approval_status` columns.

Nothing was harming users yet (pre-revenue; manual "Approve & Pay" works because it
raw-writes `approved`, which the old CHECK allowed) — but it was a hard launch blocker.

## Auto-approval was dead THREE independent ways (all fixed)

1. **Wrong timestamp anchor.** The cron filtered `.not('submitted_at','is',null)` and timed
   the window off `submitted_at`. But the client submit paths (`SubmitForReviewButton`,
   `useProjectComplete`) raw-`.update()` `content_status='submitted'` and **never set
   `submitted_at`** — only the (missing) RPC did. The `set_content_submitted_at` trigger
   reliably stamps **`content_submitted_at`** on every entry to `submitted` (incl. resubmits),
   so the fix is to key the cron off `content_submitted_at` — a strict superset (the trigger
   co-stamps it whenever the RPC would set `submitted_at`). Live proof: all prod collaborations
   had `submitted_at = NULL`; the cron had matched **zero rows** and auto-approval had never
   once fired.
2. **No scheduler.** There was **no `pg_cron` job** invoking `auto-approve-content` at all
   (7 jobs scheduled, not this one). The original plan doc had flagged this as a manual step
   that was never done. Scheduled it `*/15 * * * *` via the Vault + `net.http_post` fleet
   pattern (new `auto_approve_content_url` Vault secret + `aios_ingest_key` bearer),
   **source-controlled as migration `20260723120003`** (mirroring `dre_award_cron` — Codex correctly
   flagged that the fleet schedules crons via migrations, so an ad-hoc SQL schedule wouldn't reproduce
   on a fresh deploy; the env-specific Vault URL secret stays an out-of-band prerequisite).
3. **Missing RPC + CHECK.** Even if reached, `transition_content_status` didn't exist and
   `auto_approved` violated the old CHECK — both restored by the migration.

## What shipped

**Migrations (idempotent):**
- `20260723120000_repair_collaboration_state_machine_drift.sql` — restores the missing
  objects. Storage policies **excluded** (the original step-7 tightening was superseded by
  `20260513000001_expand_deliverable_access_to_org_members`; the live deliverable SELECT
  policies are the later, functioning set). Adds a **REVOKE the original never shipped**:
  `transition_content_status` is `SECURITY DEFINER` and only runs its participant check when
  `p_actor_id IS NOT NULL` (a forgeable client value), so the default PUBLIC grant was a
  **cross-actor write IDOR** — any anon/authenticated caller could POST
  `{p_new_status:'auto_approved', p_actor_id:null}` for someone else's collaboration.
  `REVOKE EXECUTE … FROM public, anon, authenticated` closes it; all three callers use the
  service-role client so nothing breaks (data-exposure-reviewer HIGH finding).
- `20260723120001_allow_reject_from_submitted_after_max_revisions.sql` — the restored graph
  faithfully reproduced the original, where `rejected` was reachable **only** from
  `revision_requested`. If a creator resubmits after the 2nd revision (→ `submitted`), the
  business was trapped in approve-only (`enforce_revision_limit` blocks a 3rd revision, the
  machine blocked reject). Permit `submitted → rejected` when `revision_count >= 2` — purely
  additive; the `rejected` side-effect already auto-transitions to `disputed`
  (Codex P2, fixed).
- `20260723120002_backfill_final_approval_status.sql` — one-time backfill of 15 stale rows
  (all non-sponsored, already `accepted`, 0 active sponsorships → none functionally stuck,
  since the non-sponsored accept path drives the collaboration off `status`, not
  `final_approval_status`). Updates `final_approval_status` only (the recompute trigger is
  scoped to `brand/restaurant_approval_status`, so it does not fire).
- `20260723120003_auto_approve_content_cron.sql` — schedules the `auto-approve-content` pg_cron job
  `*/15` (mirroring `dre_award_cron`), so the scheduler is source-controlled and reproduces on a fresh
  deploy. `cron.schedule` upserts by name, so it's idempotent with the job created ad-hoc in-session.
- `20260723120004_backfill_active_submitted_content_anchor.sql` — belt-and-suspenders backfill of
  `content_submitted_at` for any active `submitted` row missing the anchor, via
  `COALESCE(content_submitted_at, submitted_at, updated_at, created_at)` (0 rows in prod — nothing is in
  `submitted` and `submitted_at` is dead — but makes the revived cron robust for any environment/state
  that DOES have a pre-trigger stuck row; Codex's suggested remedy, using the effective anchor).

**Edge function `auto-approve-content` (deployed v60):** times off `content_submitted_at`;
auth switched to the shared `isAuthorizedIngest` gate (accepts the injected service-role key
OR `AIOS_INGEST_SECRET`) so the Vault + `net.http_post` cron works without a strict-key 401 —
the same fragility that broke the AIOS 3am routines during a key-format rotation.

## Verification (all done in-session)

- Migration dry-run inside `BEGIN; … ROLLBACK;` before applying; every object confirmed after
  the real apply; IDOR closed (`has_function_privilege('authenticated'…)=false`,
  `service_role=true`, ACL `{postgres=X/postgres, service_role=X/postgres}`).
- Filter fix proven end-to-end (rolled back): a fresh submission is stamped
  `content_submitted_at` and matched by the cron's new filter.
- Reject fix proven (rolled back): `submitted + revision_count=2 → disputed` succeeds;
  `revision_count=1 → rejected` blocked with `Invalid status transition`.
- Backfill: 0 stale rows remain; the 15 accepted rows now read `final_approval_status='approved'`.
- Edge deploy v60: both `_shared` deps bundled, `verify_jwt=false`, bad-bearer → 401.
- Cron job 8 active (`*/15`), correct Vault URL + `aios_ingest_key` bearer.

## Gotchas / durable lessons

- **`schema_migrations` recording ≠ objects exist on this prod DB.** Verify object existence
  directly (`pg_proc`/`information_schema`/`pg_trigger`), not just the migrations table, before
  assuming a "shipped" feature works. Sibling to the known staging drift, but here on PROD.
- **`service_role` keeps its own direct EXECUTE grant** (Supabase default privileges) independent
  of the PUBLIC grant, so `REVOKE … FROM public` does NOT strip it. Codex's "REVOKE breaks
  service_role" P1 was empirically false — verified via `has_function_privilege` + the ACL.
- **`content_submitted_at` is the reliable submit anchor, `submitted_at` is effectively dead**
  (only the RPC ever set it, which the client never calls). Downstream code should key off
  `content_submitted_at`.
- **The app already depended on the missing trigger.** `useManageApplication.ts` comments
  "trigger handles final_approval_status" — so restoring `trg_recompute_final_approval` fixes the
  accept flow rather than regressing it. A missing object can be a silent dependency.
- **`AIOS_INGEST_SECRET` IS the service-role key** (`aios_ingest_key` = "Copy of the service-role
  key"), so accepting it via `isAuthorizedIngest` is not a privilege broadening (Codex P2 dismissed).
- Codex ran 4 rounds; every finding was independently verified against the live ACL/data before
  being fixed or dismissed — a dependency chain (each fix surfaced the next real thing), not churn.

## Out of scope / follow-ups

The exploration also mapped a broader content-delivery + payment fragility backlog (payout-
succeeds-but-DB-inconsistent returns 200; Stripe pay-and-approve tab desync; DragonShare boost
checkout has no polling fallback; broken deliverable thumbnails via `getPublicUrl` on the private
bucket; `posting_schedule_status='failed'` violates its CHECK; live-mode go-live items) — left for
follow-up PRs. This session repaired the state-machine drift + revived auto-approval only.

## Affected

- Migrations: `20260723120000/1/2/3/4` · Edge fn: `auto-approve-content` (v60) · pg_cron: `auto-approve-content` (job 8, scheduled by migration `…120003`) · Vault: `auto_approve_content_url`.
- Reviews: edge-function-reviewer PASS, data-exposure-reviewer HIGH fixed, Codex — every finding verified against the live ACL/data before fix or dismissal: service_role-grant IDOR (fixed + GRANT), reject-from-submitted (fixed), cron-via-migration (fixed, `…120003`), legacy-anchor backfill (fixed via `…120004` — Codex's own suggested remedy, since the `submitted_at` fallback it also proposed is ineffective here: `submitted_at` is NULL on every row). A dependency chain, not churn.
- Cross-refs: [[Content Delivery State Machine]], [[Service-Role Data Exposure]], [[Stripe Webhook Revival Session]], [[AIOS Runtime Spend Source of Truth]].
