# Creator Groups + Private Group Campaigns (v1, free collabs) — Design

> Status: approved design (brainstorming). Next: spec review → implementation plan.
> Date: 2026-07-09 · Branch: `feat/creator-groups-private-campaigns`

## 1. Problem & goal

A business wants a standing, private **group** ("crew") of creators it trusts. The business posts a
campaign **to the group**, and *only* those creators see it and can apply with **one tap and no
transaction**.

Today none of this exists as a first-class concept:
- A business can save individual creators to a private `brand_shortlists` list and **bulk-invite** them
  to a *public* campaign (`ShortlistDrawer` → `useBulkInvite`), but there is **no persistent group**.
- Campaign visibility is **binary**: `status = 'published'` ⇒ visible to the **entire** creator
  marketplace; anything else ⇒ visible to nobody. There is no "private / group-only" mode.

**Key discovery — most of the "no transaction" machinery already exists.** Applying is *already* a pure
DB insert (`apply_to_campaign` RPC via `useCreateApplication`) with **no payment**. The *only* remaining
apply-time friction is the Stripe-Connect `ReadinessGate`, which fires **solely when `fixed_price > 0`**.
So the genuinely new work is: (a) a standing group + membership, (b) group-scoped **private** visibility,
and (c) making group campaigns **free** (`fixed_price = 0`) so the last apply gate disappears.

**Goal:** a business builds a crew once, posts free-collab campaigns to it repeatedly; crew creators see
a private "My Crews" feed and one-tap apply; nothing touches the public marketplace or the paid/escrow
flow.

Aligned to the north star (*less typing = more margin*): a crew member applies in **one tap, zero
payment setup**. Musk's algorithm: this **deletes** the escrow/payout/Stripe-onboarding steps for a
whole class of collaborations and **reuses** the existing apply UI verbatim.

**Transaction model — why free for v1.** "No transaction" only *means* something if the whole gig is
free (apply is already free). Free (`fixed_price = 0`) removes the Stripe readiness gate ⇒ genuinely
one-tap. It **protects the profit engine** (per CLAUDE.md: don't dilute DragonDash): paid work still
flows through the **unchanged** escrow/take-rate marketplace; groups are the ambassador / organic-collab
lane, on-brand with DragonShare. Every seam branches on `fixed_price = 0` / no-escrow, so **paid group
campaigns become a data flip later, not a rewrite** (documented Phase 3 seam).

## 2. Chosen approach & guiding decisions

Reuse the existing campaign → apply → collaboration lifecycle wholesale; add the smallest possible group
layer on top.

- **Anchor a group on the business USER** (`creator_groups.owner_id = auth.uid()`), mirroring
  `brand_shortlists.brand_id` — **not** `org_id`. Creators aren't org members (the `organizations /
  org_units / org_members` stack is business *staff*), so an org anchor buys nothing and complicates RLS.
  Campaigns still auto-populate `org_id`/`org_unit_id` via the existing `trg_campaigns_auto_org` trigger,
  so org attribution survives on the campaign. Forward-compatible with org-shared crews later.
  *Rejected:* org-anchored groups (needs `get_user_org_ids()`-style RLS for a set that has no org
  semantics; premature).
- **Keep group campaigns at `status = 'published'`** and gate every public path on `group_id IS NULL`.
  *Rejected:* a new `campaign_status` enum value — `ALTER TYPE ... ADD VALUE` is transaction-hazardous
  and forces status-handling churn across the frontend (`getStatusBadgeClass`, `deriveCampaignPhase`,
  editability, every `.eq('status','published')`). All existing rows are `group_id IS NULL`, so public
  behavior stays **byte-for-byte** unchanged.
- **v1 group campaigns are free + single-winner**, reusing accept → collaboration → delivery →
  completion (sibling auto-decline included). Multi-creator group campaigns are out of scope.

## 3. Current state (verified in code)

- **Apply is transaction-free:** `src/hooks/useCreateApplication.ts` → RPC `apply_to_campaign`
  (`supabase/migrations/20260521000002_apply_to_campaign_atomic.sql`, extended `20260525000001`). The
  RPC is **SECURITY DEFINER and bypasses RLS** — it only checks `auth.uid() = p_creator_id`, then
  INSERTs into `campaign_applications`. So group eligibility must be enforced **inside the RPC**, not
  only in the RLS policy.
- **Apply gate RLS:** `campaign_applications` INSERT delegates to SECURITY DEFINER
  `can_create_application(campaign_id, creator_id)`
  (`supabase/migrations/20260520010000_fix_application_insert_policy_recursion.sql`) — true when the
  user is a `content_creator` AND (campaign `published` OR a pending `campaign_invitations` row).
- **Campaign visibility RLS chokepoint:** policy `"Users can view accessible campaigns"` in
  `supabase/migrations/20260511100000_fix_campaigns_rls_recursion.sql`:
  `USING (user_id = auth.uid() OR status = 'published' OR has_collaboration_on_campaign(id, auth.uid()))`.
  `has_collaboration_on_campaign` is the SECURITY DEFINER **anti-recursion pattern to mirror**.
- **Public browse hook:** `src/hooks/usePublicCampaigns.ts` filters `.eq('status','published')` and
  shows **all** published campaigns (no server-side targeting). Rendered by
  `src/pages/CreatorCampaignMarketplace.tsx` (tabs: All / Donny Picks / Invitations).
- **Accept flow:** `src/hooks/useManageApplication.ts` → RPC `accept_application_with_collaboration`
  (current `supabase/migrations/20260527000001_fix_accept_rpc_status_guard.sql`) sets app `accepted`,
  idempotently inserts `campaign_collaborations` (active), auto-declines siblings, and **only flips the
  campaign to `active` when `escrow_status = 'held'`** — the coupling to unwind.
- **Completion/payout:** `src/hooks/useProjectComplete.ts` invokes `release-creator-payout` whenever
  `escrow_status !== 'released'` (includes `'none'`). `supabase/functions/release-creator-payout/index.ts`
  hard-throws on `escrow_status='none'` (error swallowed, so completion still succeeds — but a pointless
  failing call).
- **Active-campaign limit:** `enforce_active_campaign_limit`
  (`supabase/migrations/20260507000002...`) raises when a user publishes beyond
  `active_campaign_limit` (default 1).
- **Closest existing "set of creators":** `brand_shortlists`
  (`supabase/migrations/20260406050000_brand_shortlists.sql`, `src/hooks/useBrandShortlist.ts`,
  `src/components/brand-browse/ShortlistDrawer.tsx`) — keyed to `brand_id = auth.uid()`, owner-only.
- **Membership-lifecycle precedent:** `org_members.invitation_status` (`'invited'|'active'|'suspended'`).
- **One-tap apply UI:** `src/components/campaigns/OneTapApplySheet.tsx`, `ApplyConfirmation.tsx`, sticky
  CTA — all via `useCreateApplication`, no `ReadinessGate` on the creator side at `fixed_price=0`.
- **Notifications:** must route through the `create-notification` edge function choke point (bell +
  email); never `send-notification-email` directly (cross-user self-auth gate 403s silently).

## 4. Data model (new)

```sql
CREATE TABLE creator_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_creator_groups_owner ON creator_groups(owner_id);

CREATE TABLE creator_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES creator_groups(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','active','declined','removed')),  -- mirrors org_members.invitation_status
  invited_by uuid REFERENCES profiles(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, creator_id)
);
CREATE INDEX idx_cgm_group ON creator_group_members(group_id);
CREATE INDEX idx_cgm_creator ON creator_group_members(creator_id);

ALTER TABLE campaigns
  ADD COLUMN group_id uuid REFERENCES creator_groups(id) ON DELETE RESTRICT;  -- RESTRICT, never SET NULL
CREATE INDEX idx_campaigns_group_id ON campaigns(group_id) WHERE group_id IS NOT NULL;
```

A campaign with non-null `group_id` is a private group campaign. `ON DELETE RESTRICT` is deliberate:
`SET NULL` would silently convert a private campaign into a public one (leak). `UNIQUE(group_id,
creator_id)` mirrors `brand_shortlists` and makes invite an idempotent upsert. `updated_at` uses the
existing shared trigger fn already on `campaigns`/`campaign_invitations`.

## 5. RLS & functions

New SECURITY DEFINER helpers mirroring `has_collaboration_on_campaign` (anti-recursion), all
`SET search_path = public`:

- `is_active_group_member(p_group_id uuid, p_creator_id uuid) → bool` — EXISTS active member row.
- `is_creator_group_owner(p_group_id uuid, p_user_id uuid) → bool` — EXISTS group with that owner.
- `respond_to_group_invitation(p_group_id uuid, p_accept bool) → void` — creator-only accept/decline
  (`invited → active|declined`, `RAISE` if no pending invite), so creators can't self-set arbitrary
  statuses (e.g. re-activate after `removed`).

**Grant discipline (critical asymmetry):**
- `is_active_group_member` is referenced inside the **anon-reachable** `campaigns` SELECT policy →
  **do NOT revoke from anon** (would break public/anon browse with `permission denied for function`);
  `GRANT EXECUTE TO authenticated` and leave anon's default grant. The `group_id IS NOT NULL AND ...`
  AND short-circuit means it's never evaluated for a public row.
- `is_creator_group_owner` + `respond_to_group_invitation` are **not** anon-reachable → full
  `REVOKE ... FROM public, anon; GRANT EXECUTE ... TO authenticated;` (per the definer-revoke rule).
- Add all three to the `ALTER FUNCTION ... SET search_path = public` housekeeping.

**Modified `campaigns` SELECT policy** (chokepoint):
```sql
USING (
  user_id = auth.uid()
  OR (status = 'published' AND group_id IS NULL)                              -- public: unchanged
  OR (group_id IS NOT NULL AND is_active_group_member(group_id, auth.uid()))  -- group members only
  OR has_collaboration_on_campaign(id, auth.uid())                            -- hired creators keep access
)
```

**New-table RLS:**
- `creator_groups` — owner FOR ALL (`owner_id = auth.uid()`) + member SELECT
  (`is_active_group_member(id, auth.uid())`, so the creator feed can show the crew name).
- `creator_group_members` — owner FOR ALL (`is_creator_group_owner(group_id, auth.uid())`) + creator
  self-SELECT (`creator_id = auth.uid()`). Accept/decline via the RPC, not a broad self-UPDATE policy.

**Modified `can_create_application`:** add `group_id IS NULL` to the public branch, plus a branch
`EXISTS campaign WHERE group_id IS NOT NULL AND is_active_group_member(group_id, p_creator_id)`.

**Modified `apply_to_campaign` RPC (the real gate — bypasses RLS):** after the `auth.uid() =
p_creator_id` check, add a guard — if the target campaign is group-scoped, require active membership
(or a pending `campaign_invitations` row) else `RAISE EXCEPTION`. Public/paid path (`group_id IS NULL`)
skips the block entirely.

## 6. Unwinding the escrow coupling (paid path stays byte-for-byte unchanged)

- **Reach ACTIVE collaboration without escrow** — in `accept_application_with_collaboration`, the
  campaign→`active` flip is gated on `escrow_status = 'held'`. Add one **additive** OR:
  `OR (v_campaign.group_id IS NOT NULL AND COALESCE(v_campaign.fixed_price,0) = 0)`. The collaboration
  INSERT + sibling auto-decline already run regardless of escrow.
- **Complete without payout** — tighten `useProjectComplete` to invoke `release-creator-payout` only
  when `escrow_status ∈ {'held','releasing'}`. **`release-creator-payout/index.ts` stays 100%
  unchanged** — it remains the money-safety hard gate and is simply never called for free campaigns.
  This is the clean seam: paid = `fixed_price>0` + escrow held → existing path; free = `group_id` +
  `fixed_price=0` → no escrow, no payout. A future paid group campaign just sets `fixed_price>0`.
- **Active-campaign-limit trigger** — exclude group campaigns (`AND group_id IS NULL` in both the
  guard and the running COUNT) so a standing crew is reusable across many campaigns without consuming
  the paid-marketplace quota. (Recommended; alternative is to count them.)

## 7. Frontend units (small, focused — reuse-heavy)

**Business — roster management**
- `src/hooks/useCreatorGroups.ts`, `src/hooks/useCreatorGroupMembers.ts` (new) — templated on
  `useBrandShortlist.ts`; `inviteCreators` inserts `status='invited'` rows then fires
  `create-notification` type `group_invitation`; `removeMember` sets `status='removed'`.
- `src/pages/CreatorGroupsPage.tsx` + `src/pages/CreatorGroupDetailPage.tsx` (new; routes under
  `/dashboard/business/groups`, guarded by `BusinessRoute`).
- `src/components/groups/InviteCreatorsSheet.tsx` (new) — reuse `useCreatorBrowse` + the avatar / list /
  peek-bar patterns from `ShortlistDrawer.tsx`; seed candidates from the existing shortlist.

**Business — post to a group**
- `src/components/campaigns/GroupTargetSelect.tsx` (new) — "Post to: Public marketplace | <group>",
  populated by `useCreatorGroups`.
- `src/hooks/useCampaignCreator.ts` + `src/pages/CampaignCreator.tsx` (edit) — add `group_id` to the
  editable campaign; when set, add `group_id` to the insert and force free terms (`fixed_price:0`,
  `pricing_type:'fixed'`, `delivery_fee:0`), keep `status:'published'`; on launch notify active members
  (`group_campaign_posted`). No `campaign_invitations` rows (membership already grants apply rights).

**Creator — accept/decline + feed**
- `src/hooks/useCreatorGroupInvitations.ts` (new) — pending memberships (join `creator_groups` for
  name/owner); `accept`/`decline` → `respond_to_group_invitation` + notify owner.
  `src/components/groups/GroupInviteCard.tsx` (new) — reuse the Invitations-tab card styling.
- `src/hooks/useGroupCampaigns.ts` (new) — `.not('group_id','is',null).eq('status','published')` (RLS
  restricts rows to the member's crews); enrich like `usePublicCampaigns`.
- `src/pages/CreatorCampaignMarketplace.tsx` (edit) — add a **"My Crews"** tab (mirror the Invitations
  tab) rendering group campaigns via existing `CampaignSwipeCard` + `CampaignDetailModal` +
  `OneTapApplySheet`.
- `src/hooks/usePublicCampaigns.ts` (edit) — add `.is('group_id', null)` so group campaigns never
  appear in the public "All" tab.

Apply is already one-tap and transaction-free for `fixed_price=0` — no `ReadinessGate` change on the
creator side.

## 8. Reuse vs build

- **Reuse as-is / minimally extended:** `apply_to_campaign` (add a guard block), `useCreateApplication`,
  `OneTapApplySheet`, `CampaignApplyForm`, `CampaignDetailModal`, `CampaignSwipeCard`,
  `useManageApplication` + accept RPC (add one OR), collaboration/delivery/completion flow,
  `create-notification`, `useCreatorBrowse`, `ShortlistDrawer` patterns, `useBrandShortlist` (as the
  hook template), `trg_campaigns_auto_org`, `getStatusBadgeClass`/`deriveCampaignPhase` (unchanged —
  group campaigns read as `published`/`active`).
- **Build new:** 2 tables + `campaigns.group_id`; 3 functions; RLS (2 new tables + modified `campaigns`
  SELECT + modified `can_create_application` + `apply_to_campaign` guard); 4 hooks, 2 pages, 3
  components; notification types `group_invitation`, `group_campaign_posted`.
- **Do NOT build (YAGNI seam documented):** paid group campaigns, group Stripe/escrow, multi-creator
  group campaigns, org-shared ownership, a dedicated `send-group-invitation` edge fn.

## 9. Risks / edge cases

1. **Leak vectors — all five MUST land together:** `campaigns.group_id` FK `ON DELETE RESTRICT`;
   `usePublicCampaigns` `.is('group_id',null)`; `can_create_application` public branch `group_id IS
   NULL`; `apply_to_campaign` server-side membership guard (RPC bypasses RLS); `campaigns` SELECT
   public branch `group_id IS NULL`.
2. **Grant asymmetry** (anon-reachable definer fn) — see §5. Wrong revoke breaks public browse.
3. **Removed member with in-flight application** — pending app persists (owner can still accept/reject;
   own-row RLS keeps it in the creator's list) but campaign detail hides via RLS and re-apply is
   blocked; already-accepted members keep access via `has_collaboration_on_campaign`. Intended;
   consider a warning on the remove action.
4. **Deploy ordering** — migrations first (helpers → tables → `group_id` → modified
   policies/RPCs/trigger), then frontend; regenerate `src/integrations/supabase/types.ts`. Run
   `get_advisors(security)` after the definer-fn DDL and confirm `search_path` + grants.
5. **Free-campaign UI polish** — `formatBudget` shows "Budget TBD" at `$0`; label group campaigns
   "Free collab" and suppress the counter-offer control.
6. **RLS recursion** — avoided via SECURITY DEFINER helpers (mirrors `has_collaboration_on_campaign`).
7. **Concurrent Lovable/founder PRs** — re-fetch origin/main + check collisions on the touched files
   (`usePublicCampaigns.ts`, `useCampaignCreator.ts`, `CreatorCampaignMarketplace.tsx`, apply/accept
   RPC migrations) before deploy/merge.

## 10. Build phases

- **Phase 1 — Roster (standalone, shippable):** 2 tables + RLS + 3 functions; business group
  pages/hooks/invite sheet; creator accept/decline "Crews" surface; `group_invitation` notifications.
  **No `campaigns` change.** Businesses build crews, creators opt in.
- **Phase 2 — Group-scoped free posting (end-to-end):** `campaigns.group_id` + modified `campaigns`
  SELECT RLS + `can_create_application` + `apply_to_campaign` guard + accept-RPC escrow OR +
  limit-trigger exclusion + `useProjectComplete` payout guard; "post to group" in the campaign creator;
  creator "My Crews" feed; `usePublicCampaigns` filter; `group_campaign_posted` notifications. Delivers
  one-tap free group campaigns.
- **Phase 3 — later (NOT now):** paid group campaigns (`group_id` + `fixed_price>0`, enabled by data
  via the existing escrow path), multi-creator group campaigns, org-shared crew ownership.

## 11. Verification (end-to-end)

1. **Migrations & advisors:** apply via Supabase MCP (staging/branch first); run
   `get_advisors(security)` — confirm no new anon-callable definer leak and `search_path` set;
   regenerate types.
2. **Roster:** as a business, create a group + invite a creator → creator sees the invite
   (`group_invitation` bell/email) and accepts → `active` member. Decline → `declined`, no access.
3. **Private visibility (core test):** post a free campaign to the group. Confirm (a) an active member
   sees it in "My Crews" and one-tap applies with **zero Stripe prompt**; (b) a NON-member creator does
   NOT see it in the public "All" tab and **cannot apply** (direct RPC call `RAISE`s); (c) it never
   appears in `usePublicCampaigns` results.
4. **Accept → active without escrow:** business accepts → `campaign_collaborations` active, campaign
   `status='active'`, no escrow/payout invoked; complete the project → no `release-creator-payout` call,
   no error.
5. **Paid flow untouched:** run one normal public paid campaign apply → accept → escrow → payout;
   confirm byte-for-byte unchanged.
6. **Build/tests:** `npm run build`, `npm run typecheck`, targeted vitest for any new pure helpers;
   Codex second review + `edge-function-reviewer` (if any edge fn touched) before PR.
