---
title: Creator Groups (Crews)
type: concept
created: 2026-07-09
updated: 2026-07-10
sources: [docs/superpowers/specs/2026-07-09-creator-groups-private-campaigns-design.md, docs/superpowers/plans/2026-07-09-creator-groups-private-campaigns.md, 2026-07-09-creator-groups.md, docs/superpowers/specs/2026-07-10-crews-phase2-activity-design.md, docs/superpowers/plans/2026-07-10-crews-phase2-activity.md]
tags: [campaigns, creators, rls, private-visibility, groups, marketplace, notifications, activity-feed]
---

# Creator Groups (Crews)

A **Creator Group** ("crew") is a business's standing, private roster of creators. The business
posts a campaign scoped to a crew, and **only the crew's active members see it and can apply with
one tap and no payment**. It's the ambassador / organic-collab lane, distinct from — and layered
on top of — the paid [[Campaign Lifecycle]] marketplace, which is left byte-for-byte unchanged.

## Why it exists

Before this, a business could save creators to a private `brand_shortlists` list and bulk-invite
them to a *public* campaign, but there was **no persistent group** and campaign visibility was
**binary**: `status='published'` = visible to the entire creator marketplace, else invisible. Crews
add (a) a standing roster and (b) a **private, group-scoped visibility mode** — a campaign visible
only to a chosen subset of creators.

## Model

- **`creator_groups`** — `owner_id` is the **business user** (`auth.uid()`), mirroring
  `brand_shortlists.brand_id`, *not* an `org_id` (creators aren't org members; org-shared crews are
  a forward-compatible later step). Columns `name`, `description`.
- **`creator_group_members`** — invite→accept lifecycle `status ∈ invited/active/declined/removed`
  (mirrors `org_members.invitation_status`), `UNIQUE(group_id, creator_id)`. A creator becomes a
  member by **opting in** (business invites → creator accepts) — two-sided, consent-based.
- **`campaigns.group_id`** — `REFERENCES creator_groups(id) ON DELETE RESTRICT`. Non-null ⇒ a
  private crew campaign. **RESTRICT is load-bearing**: `SET NULL` would silently flip a private
  campaign public.

## Private visibility & the apply gates

Visibility rides the existing `campaigns` SELECT chokepoint via the SECURITY-DEFINER anti-recursion
pattern — `is_active_group_member` is SECURITY DEFINER, mirroring `has_collaboration_on_campaign`
(see [[SECURITY DEFINER Advisor Triage]]):

```
user_id = auth.uid()
OR (status = 'published' AND (group_id IS NULL OR is_active_group_member(group_id, auth.uid())))
OR has_collaboration_on_campaign(id, auth.uid())
```

The **`status = 'published'` gate on the member branch is essential** — without it a taken
(`active`) or draft crew campaign would leak to non-selected members. The owner (`user_id`) and the
selected creator (`has_collaboration_on_campaign`) keep access after it goes active.

**Both apply gates must be tightened to the same rule** — the SECURITY DEFINER RPC
`apply_to_campaign` (which bypasses RLS and is the real gate) **and** `can_create_application` (the
RLS `WITH CHECK` for direct `campaign_applications` inserts). Each requires active membership **AND**
`status='published'` on the group branch (the pending-`campaign_invitations` branch is preserved).

**Cross-owner targeting** is blocked by a `BEFORE INSERT OR UPDATE OF group_id` trigger,
`enforce_campaign_group_ownership`: a campaign's `group_id` must reference a crew owned by
`campaigns.user_id`. A trigger (not per-policy `WITH CHECK`) covers every write path — including
service-role and any future permissive policy.

## Free = one-tap

Crew campaigns are **free** (`fixed_price = 0`). This is what makes apply genuinely one-tap: the
Stripe `ReadinessGate` only fires when `fixed_price > 0`. Free also uncouples escrow — the accept
RPC activates a free crew campaign without held escrow, `useProjectComplete` skips the payout invoke
only for `escrow_status='none'`, and **every escrow-checkout entry point is guarded** (central
no-op in `initiateCheckout`, plus UI-level hides). Paid group campaigns are a documented Phase-3
data-flip (set `fixed_price>0`), not a rewrite — every seam already branches on `fixed_price=0`.

## Backend guardrails (DB-enforced invariants)

Review (Codex 14 rounds + an independent adversarial pass) hardened the invariants at the DB, not
just the UI — because a crew campaign also flows through *generic* campaign surfaces:

- `enforce_campaign_group_ownership` (trigger, `BEFORE INSERT OR UPDATE OF group_id`) — a campaign's
  `group_id` must reference a crew owned by `campaigns.user_id` (no cross-owner targeting).
- `campaigns_group_free` (CHECK) — `group_id IS NULL OR COALESCE(fixed_price,0)=0` (a crew campaign
  is always free; can't become a stuck "paid-looking" private campaign).
- `reject_group_campaign_invitation` (trigger, `BEFORE INSERT` on `campaign_invitations`) — no regular
  campaign-invite may be created for a crew campaign (crew is members-only; fires for service-role too).
- `forbid_application_campaign_change` (trigger, `BEFORE UPDATE` on `campaign_applications`) — an
  application's `campaign_id` can't be changed (closes a raw-UPDATE injection onto a crew campaign that
  bypassed the members-only INSERT gate; the UPDATE policy had `WITH CHECK = NULL`).
- `cgm_owner_insert`/`cgm_owner_update` (RLS) — owner writes are restricted to `status='invited'`
  (insert) / `invited|removed` (update); a member becomes `active` ONLY via `respond_to_group_invitation`
  (consent can't be forced).
- **Publish-notification leak:** `send-campaign-publish-notifications` (the generic "announce to the
  whole creator/brand base" edge fn) is group-blind by default — it now early-returns for group
  campaigns, and `useCampaignMutations` skips the invoke when `group_id` is set. Without this, publishing
  a crew campaign via the draft→edit→publish path emailed every creator its title+id.

## Phase 2 — Crew Activity & Team Notifications

Crews became a **team engagement layer**: a private per-crew activity feed plus role-aware
notification fan-out over the campaign lifecycle, so a business and its crew "engage over campaigns
quickly and are notified on requests / content updates in a team-oriented way."

- **`crew_activity`** — an append-only event log (`group_id`, `campaign_id`, `actor_id`,
  `participant_id`, `event_type` ∈ 7 lifecycle events, `visibility` ∈ `business`/`crew`, `metadata`
  jsonb). **SELECT-only for clients** (no client INSERT/UPDATE/DELETE policy); all writes go through
  one RPC.
- **Asymmetric RLS (role-aware privacy).** Owner sees the whole crew feed
  (`is_creator_group_owner(group_id, auth.uid())`); a creator sees `(visibility='crew' AND
  is_active_group_member(...)) OR participant_id = auth.uid()` — i.e. crew-wide announcements
  (`campaign_posted`, which carries a NULL participant + NULL creator_name) **plus only their own**
  business-visibility events. **Creator B never sees creator A's application/hire/content rows.** The
  explicit parenthesization is load-bearing.
- **`record_crew_activity(p_campaign_id, p_event_type, p_collaboration_id?)`** — the single
  **forge-proof** write path (SECURITY DEFINER, `SET search_path=public`, revoked from anon, granted
  to `authenticated`). The client passes only *what happened*; the RPC enforces a **per-event
  authorization matrix on `auth.uid()`**, re-derives `participant_id`/`visibility`/metadata
  server-side, and returns *facts*. No-ops (returns NULL) off the crew path so a call at a shared
  lifecycle site is inert on the paid/public marketplace.
- **Notification fan-out — de-dup by design.** `create-notification` *always* bells and only
  *conditionally* emails, and the standard lifecycle already bells most recipients. So the pure map
  `src/lib/crews/crewActivityNotifications.ts` emits a payload for exactly **one gap**:
  `content_submitted → the crew owner` (nobody was notified before when a crew creator submitted for
  review). Every other event is **row-only** (the standard path handles its bell). The thin wrapper
  `recordCrewActivity.ts` fans out only when the RPC returns non-null, so a suppressed/no-op call
  sends nothing.
- **content_submitted emails by default.** The payload is pinned to category **`campaigns`** (not
  `content`) precisely so the owner email sends by default — `content` defaults email *off*. It maps
  to a dedicated `crew_content_submitted` template. (The spec's table said "email to owner" while
  pinning it to `content`; resolved toward the feature's purpose.)
- **Idempotency (converged over a 10-round Codex loop).** Three layers, all server-side:
  1. **Cycle-scoped** for `content_submitted`: a nullable `campaign_collaborations.content_submitted_at`
     is stamped by a narrow `BEFORE UPDATE` trigger (`trg_set_content_submitted_at`) **only on the
     transition into `submitted`** (server `now()`); a submit is suppressed if a `content_submitted`
     row already exists at/after that marker — so a **resubmit-after-revision** (which re-stamps the
     marker) records, but a replay is dropped. This anchor is authoritative because the table's own
     `handle_updated_at` trigger is a **verified no-op** (so client-set `updated_at` can't be trusted).
  2. **One-shot** for `campaign_posted`/`application_received`/`hired`/`completed` (each happens once):
     suppress if a matching `(campaign, event, participant)` row exists. `content_approved`/
     `revision_requested` are excluded — owner-only + cyclic across review rounds.
  3. **Atomic**: a `pg_advisory_xact_lock` on the `(campaign, event, participant)` key wraps each
     check-and-insert, so concurrent calls can't both pass the EXISTS and double-insert (double-email).
- **State-gated authz.** `content_submitted` requires the caller's own collaboration to be
  `content_status='submitted'`; `completed` (the one non-owner-writable business event — owner OR
  participant, since completion is mutual) additionally requires `status='completed'`, blocking a
  premature forged completion. Owner-only events (`hired`/`content_approved`/`revision_requested`)
  rely on the owner-only gate (a non-owner is rejected outright).
- **Two feed surfaces:** business `useCrewActivity` (group-scoped) on the crew detail page; creator
  `useMyCrewActivity` (RLS-scoped, no group filter) as a strip in the marketplace Crews tab; both
  render the presentational `CrewActivityFeed`.
- **Six instrumented sites** (all `void recordCrewActivity(...)`, best-effort, post-transition):
  `useCreateApplication` (application_received), `useManageApplication` (hired), `SubmitForReviewButton`
  (content_submitted), `ContentReviewSection` (content_approved / revision_requested),
  `useProjectComplete` (completed), `useCampaignCreator` (campaign_posted).

## Known Issues / gotchas

- **`create-notification` is `verify_jwt=TRUE` on prod** (not false) — redeploy it **without**
  `--no-verify-jwt` or you silently flip its security posture. `send-notification-email` is
  `verify_jwt=false`. Ground-truth is `list_edge_functions`, not `config.toml`.
- **Verify columns against prod, not migration files.** `campaigns.creator_count` is in a migration
  but **not on prod** (schema drift); writing it top-level 500s the insert. Single-winner uses
  `enforce_single_slot_campaign`, which reads `(ai_analysis->>'creator_count')::int` from the JSONB
  — so set `ai_analysis.creator_count = 1`, never a top-level column.
- **`group_id` must be in every campaign `.select()`** the accept/escrow flow reads
  (`useCampaignQueries`, `useCollaboration`) — the type having it isn't enough; PostgREST won't
  return an unselected column, and an undefined `group_id` sends a free crew accept into the paid
  escrow flow.
- **`saveDraft` needs the crew overrides too** — else a crew campaign saved as a draft reverts to a
  paid public draft.
- **`create-notification` only emails mapped types.** `group_invitation` isn't in
  `NOTIFICATION_TYPE_TO_EMAIL_TYPE`, so invited creators get the in-app bell only (email is a
  deferred enhancement); copy must not over-promise.
- **Grant asymmetry:** `is_active_group_member` must stay anon-executable (it's in the
  anon-reachable campaigns SELECT policy); `is_creator_group_owner`, `respond_to_group_invitation`,
  `get_creator_pending_group_invitations` are revoked from anon.
- An **invited** creator can't read the members-only `creator_groups` row — surface pending-invite
  crew/business names via `get_creator_pending_group_invitations` (SECURITY DEFINER, gated on
  `creator_id = auth.uid()`).

## See Also

- [[Campaign Lifecycle]] — the paid marketplace flow crews layer on top of (unchanged for `group_id IS NULL`).
- [[SECURITY DEFINER Advisor Triage]] — the SECURITY-DEFINER-in-RLS pattern (and advisor posture) crews reuse.
- [[Notification Delivery]] — the `create-notification` choke point + type→email mapping.
