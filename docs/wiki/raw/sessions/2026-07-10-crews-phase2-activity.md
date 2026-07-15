# Session: Crews Phase 2 — Crew Activity & Team Notifications (2026-07-10)

Branch: `feat/crews-phase2-activity` (worktree DC-Crews-P2). Follow-up to Crews v1 (PR #226).

## What shipped
A private per-crew **activity feed** (`crew_activity`) + role-aware **notification fan-out** over the
campaign lifecycle, so a business and its crew engage over campaigns and are notified on
requests/content updates in a team-oriented way.

- **`crew_activity`** table (SELECT-only for clients) + **asymmetric RLS**: owner sees all; a creator
  sees `(visibility='crew' AND is_active_group_member) OR participant_id=auth.uid()`. Creator B never
  sees creator A's business-visibility rows (privacy keystone, independently proven).
- **`record_crew_activity(campaign, event, collaboration?)`** — the single forge-proof SECURITY
  DEFINER write path: per-event authz matrix on `auth.uid()`, server-derived participant/visibility/
  metadata, returns facts, no-op off the crew path.
- **Notification de-dup**: `create-notification` always bells, so the pure map
  (`src/lib/crews/crewActivityNotifications.ts`) fires ONE genuinely-new payload — `content_submitted →
  owner`. All other events are row-only. The wrapper (`recordCrewActivity.ts`) notifies only when the
  RPC returns non-null.
- **Owner email** for content_submitted: category **`campaigns`** (not `content`, which defaults email
  off) → `crew_content_submitted` template in `send-notification-email`. `create-notification` +
  `send-notification-email` redeployed (verify_jwt preserved: true / false respectively).
- **Six instrumented lifecycle sites** (best-effort `void`, post-transition).
- **Two feed surfaces**: `useCrewActivity` (business) + `useMyCrewActivity` (creator) → `CrewActivityFeed`.

## Idempotency loop (10 Codex rounds → converged)
1. R1: `completed` is mutual (owner OR participant) — fixed authz.
2. R2/R3: `content_submitted` forge-fake-state — gated on `content_status='submitted'`.
3. R4: content_submitted owner email wasn't wired (spec said "email to owner") — added, category campaigns.
4. R4/R5/R6: idempotency evolved client-updated_at → 30s debounce → **cycle anchor**
   `campaign_collaborations.content_submitted_at` (trigger stamps only on the transition into
   `submitted`; the table's `handle_updated_at` trigger is a **no-op**, so client updated_at is
   untrustworthy). Allows resubmit-after-revision, drops replays.
5. R7: `completed` state-gated on `status='completed'` (blocks premature forge). Owner-only events
   (hired/content_approved/revision_requested) rely on the owner-only gate.
6. R8: **one-shot** dedup for campaign_posted/application_received/hired/completed.
7. R9: **atomic** — `pg_advisory_xact_lock` on `(campaign, event, participant)` around each
   check-and-insert (no concurrent double-email).
8. R10: clean. Independent adversarial review: ship-ready.

## Files / migrations
- Migrations `20260710120000`–`20260710120010` (crew_activity table + RLS; record_crew_activity RPC
  evolution; `content_submitted_at` column + `trg_set_content_submitted_at`). All additive, applied to prod.
- Frontend: `src/lib/crews/{crewActivityNotifications,recordCrewActivity}.ts` (+ test), hooks
  `useCrewActivity`/`useMyCrewActivity`, `CrewActivityFeed`, 6 instrumented sites,
  `src/types/notifications.ts` (+ `content_submitted` type + `crew_content_submitted` email map),
  `src/integrations/supabase/types.ts` (content_submitted_at), `useProjectComplete.ts` select-list fix.
- Edge fns: `create-notification` (v33), `send-notification-email` (v240) — content_submitted email.

## Gotchas
- `create-notification` is **verify_jwt=TRUE** on prod — redeploy WITHOUT `--no-verify-jwt`.
- `campaign_collaborations.handle_updated_at` trigger is a **no-op** — never anchor logic on client
  `updated_at`.
- category `content` defaults email OFF; use `campaigns` for a high-signal owner email that sends by default.

Spec: `docs/superpowers/specs/2026-07-10-crews-phase2-activity-design.md`.
Plan: `docs/superpowers/plans/2026-07-10-crews-phase2-activity.md`.
Concept: `docs/wiki/concepts/creator-groups.md` (Phase 2 section).
