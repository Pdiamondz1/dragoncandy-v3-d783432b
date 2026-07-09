---
title: Creator Groups (Crews)
type: concept
created: 2026-07-09
updated: 2026-07-09
sources: [docs/superpowers/specs/2026-07-09-creator-groups-private-campaigns-design.md, docs/superpowers/plans/2026-07-09-creator-groups-private-campaigns.md, 2026-07-09-creator-groups.md]
tags: [campaigns, creators, rls, private-visibility, groups, marketplace]
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

## Known Issues / gotchas

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
