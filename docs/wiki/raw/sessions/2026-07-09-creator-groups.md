# Creator Groups + Private Group Campaigns (session, 2026-07-09)

Branch `feat/creator-groups-private-campaigns` (26 commits). Schema **live on prod**
(applied via Supabase MCP + smoke-verified); frontend deploys via Lovable on merge.
Spec: `docs/superpowers/specs/2026-07-09-creator-groups-private-campaigns-design.md`.
Plan: `docs/superpowers/plans/2026-07-09-creator-groups-private-campaigns.md`.

## What shipped

A business builds a standing, private **group ("crew")** of creators, posts a campaign
scoped to that crew, and only the crew's active members see it and can **one-tap apply with
no payment**. Built brainstorm → spec (reviewed) → plan (reviewed) → subagent-driven execution
→ whole-branch + Codex review.

**Phase 1 — Roster:**
- Tables `creator_groups` (owner = business user, mirrors `brand_shortlists.brand_id = auth.uid()`)
  and `creator_group_members` (invite→accept lifecycle `invited/active/declined/removed`, mirrors
  `org_members.invitation_status`).
- SECURITY DEFINER helpers mirroring `has_collaboration_on_campaign` (anti-RLS-recursion):
  `is_active_group_member`, `is_creator_group_owner`, `respond_to_group_invitation` (creator-only
  accept/decline), and `get_creator_pending_group_invitations` (lets an *invited* creator read
  their own pending invites WITH crew+business name — they can't read the members-only
  `creator_groups` row yet).
- Business pages `/dashboard/business/groups` (+ `/:id`), `InviteCreatorsSheet` (reuses
  `useCreatorBrowse('brand')` + `ShortlistDrawer` patterns), creator "Crews" tab in
  `CreatorCampaignMarketplace` with accept/decline + `?crews=1` deep-link.

**Phase 2 — Group-scoped free posting:**
- `campaigns.group_id uuid REFERENCES creator_groups(id) ON DELETE RESTRICT` (RESTRICT, never
  SET NULL — SET NULL would flip a private campaign public).
- Private visibility via the existing `campaigns` SELECT chokepoint: `published AND (group_id IS
  NULL OR is_active_group_member(...))` + owner + collaborator.
- Free collabs = `fixed_price = 0` → removes the Stripe `ReadinessGate` (only fires when
  `fixed_price > 0`) → genuinely one-tap apply.
- Escrow uncoupled for free crews: accept RPC activates without escrow; `useProjectComplete`
  deny-list skips payout only for `escrow_status='none'`; every escrow-checkout call guarded.
- "Post to a crew" in the campaign creator (forces free terms), creator "My Crews" feed
  (`useGroupCampaigns`), public-browse filter `.is('group_id', null)`. Paid/public path byte-unchanged.

## Key decisions

- **Group anchored on the business USER, not org** — creators aren't org members; mirrors
  `brand_shortlists`. Forward-compatible with org-shared crews later.
- **Group campaigns stay `status='published'`** (no new `campaign_status` enum value) and every
  public path is gated on `group_id IS NULL`. Existing rows are all `group_id IS NULL` → public
  behavior byte-unchanged.
- **Free/unpaid collab for v1** protects the profit engine (paid work still flows through the
  unchanged escrow/take-rate marketplace); every seam branches on `fixed_price=0`/no-escrow so
  paid group campaigns are a documented Phase-3 data-flip, not a rewrite.

## Gotchas (durable — mostly Codex-caught)

- **`campaigns.creator_count` does NOT exist on prod** (the `ADD COLUMN` migration was never
  applied — schema drift), so writing it top-level 500s the insert. Single-winner is enforced by
  `enforce_single_slot_campaign` reading `(ai_analysis->>'creator_count')::int` from the **JSONB** —
  so set `ai_analysis.creator_count = 1`, never a top-level column. **Verify columns against prod
  (`information_schema.columns`), not migration files** — this repo's prod schema has drifted.
- **Cross-owner crew targeting** was possible via a plain FK (INSERT/UPDATE policies only check
  `user_id = auth.uid()`). Fixed with a `BEFORE INSERT OR UPDATE OF group_id` trigger
  `enforce_campaign_group_ownership` — a trigger (not per-policy WITH CHECK) covers every write
  path incl. service-role and future policies.
- **Two apply gates must BOTH be tightened, and to the same rule:** `apply_to_campaign` (the
  SECURITY DEFINER RPC — bypasses RLS) AND `can_create_application` (the RLS WITH CHECK for direct
  `campaign_applications` inserts). Both needed `status='published'` on the group-member branch or a
  member could apply to a taken/draft crew campaign directly.
- **Visibility + apply must gate on `status='published'`**, not just membership — else a taken
  (`active`) or draft crew campaign leaks to non-selected members. Owner (`user_id`) and selected
  creator (`has_collaboration_on_campaign`) keep access after it goes active.
- **Escrow gates hide in many places** in the post-accept lifecycle: `ActivePhaseView` disabled
  deliverable uploads unless `escrow_status='held'`; `CampaignStatusBanner` shows a pay-escrow CTA;
  and `initiateCheckout` is called from `handlePayEscrow`, the applications-list modal-accept, and
  each `ApplicationCard`. A free crew campaign has `escrow_status='none'`, so ALL of these needed a
  `group_id`/free exception. The robust fix is a **central guard inside `initiateCheckout`** (fetch
  `group_id`, no-op for crews) since some callers (the proposals page) pass no campaign object.
- **`group_id` must be added to every campaign `.select()`** that hydrates a campaign the accept/
  escrow flow reads (`useCampaignQueries` × 2, `useCollaboration`) — the type having `group_id` isn't
  enough; PostgREST won't return an unselected column.
- **`saveDraft` needs the same crew overrides as launch** — else saving a crew campaign as a draft
  reverts it to a paid public draft.
- **`create-notification` emails only for types in `NOTIFICATION_TYPE_TO_EMAIL_TYPE`** (or an
  explicit `emailType`). `group_invitation` isn't mapped, so invited creators get only the in-app
  bell — copy must not over-promise email (crew-invite email is a deferred enhancement).
- **Grant asymmetry on the helpers:** `is_active_group_member` must stay anon-executable (it's in
  the anon-reachable campaigns SELECT policy — revoking breaks public browse); the others are
  revoked from anon. Verified via `has_function_privilege` + `get_advisors`.
- **Invited creator can't read the members-only `creator_groups` row** (cg_member_select requires
  active membership) — surface pending-invite crew names via the definer RPC gated on
  `creator_id = auth.uid()` (the "cross-visibility gated on the caller's own anchor" pattern).

## Process note

Codex second review ran **10 rounds** — every real finding fixed (auth trigger, creator_count,
upload gate, escrow-path guards, status gates, draft overrides, email copy), 2 verified false
positives pushed back with prod evidence (a "newer" migration that was older; a legacy policy
already dropped). Codex hit its usage limit before the final clean pass (resets ~4:02 PM).

## Affected

- Migrations `20260709120000`–`20260709120017` (tables, functions, RLS, `group_id`, gates,
  apply-guard, lifecycle, ownership trigger, status gates, legacy-policy drop, invitations RPC).
- Hooks: `useCreatorGroups`, `useCreatorGroupMembers`, `useCreatorGroupInvitations`,
  `useGroupCampaigns` (new); `useCampaignCreator`, `usePublicCampaigns`, `useCampaignQueries`,
  `useCollaboration`, `useProjectComplete`, `useEscrowCheckout` (edited).
- Components/pages: `CreatorGroupsPage`, `CreatorGroupDetailPage`, `InviteCreatorsSheet`,
  `GroupInviteCard`, `GroupTargetSelect` (new); `CreatorCampaignMarketplace`, `CampaignCreator`,
  `CampaignDetailsPage`, `CampaignStatusBanner`, `ApplicationsListFixed`, `ActivePhaseView` (edited).
- Lib: `src/lib/groups/groupMembers.ts` (+ tests). No edge function changed.
