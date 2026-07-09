# Creator Groups + Private Group Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business build a standing private group ("crew") of creators and post free campaigns visible only to that crew, which members one-tap apply to with no payment.

**Architecture:** Two new tables (`creator_groups`, `creator_group_members`) anchored on the business user + one new column `campaigns.group_id`. Private visibility rides the existing `campaigns` SELECT RLS chokepoint via a new `is_active_group_member` SECURITY DEFINER helper (mirroring `has_collaboration_on_campaign`). Group campaigns are free (`fixed_price = 0`), which removes the only remaining apply-time gate (Stripe readiness fires solely on paid). The paid escrow/marketplace flow is untouched except one additive deny-list guard. Built in two phases: Phase 1 = the roster (standalone shippable); Phase 2 = group-scoped free posting end-to-end.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind + shadcn/ui, React Query, Supabase (Postgres + RLS + Deno edge functions), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-creator-groups-private-campaigns-design.md`

**Branch:** `feat/creator-groups-private-campaigns`

---

## Conventions for this plan

- **Migration timestamps:** use `20260709HHMMSS`-style names *after* the latest existing migration. Before creating each migration, run `ls supabase/migrations | tail -3` and pick a timestamp strictly greater than the last. If a founder/Lovable migration landed with a later stamp, bump yours above it.
- **Applying migrations:** apply via the Supabase MCP `apply_migration` (prod) only at the deploy step. During development, keep migrations as files; a maintainer with staging access may dry-run them on a branch. **Migrations land before any frontend that reads the new columns/tables.**
- **Types:** after the Phase 1 and Phase 2 DDL is applied, regenerate `src/integrations/supabase/types.ts` via the MCP `generate_typescript_types` (or `supabase gen types`). Until then, new tables/columns won't be in `Database` types — hooks may need a narrow local type or a `// @ts-expect-error` note (prefer regenerating types before writing the hooks that consume them).
- **Notifications:** always `supabase.functions.invoke('create-notification', { body: {...} })` — never `send-notification-email`. Copy the body shape from `src/hooks/useCampaignInvitations.ts:85-98`.
- **Design tokens:** `dc-*` tokens only, pill buttons, teal/pink — no gray. Desktop = `lg:`/`xl:`; mobile = base classes.
- **Commit after each task.** End commit messages with the standard trailer used on this branch.
- **No `any`**, handle loading/error states, `.select()` explicit field lists (never `select *`).

---

## File Structure

### Phase 1 — Roster

| File | Create/Modify | Responsibility |
|---|---|---|
| `supabase/migrations/<ts>_creator_groups_tables.sql` | Create | `creator_groups` + `creator_group_members` tables, indexes, `updated_at` triggers, ENABLE RLS |
| `supabase/migrations/<ts>_creator_groups_functions.sql` | Create | `is_active_group_member`, `is_creator_group_owner`, `respond_to_group_invitation` + grants |
| `supabase/migrations/<ts>_creator_groups_rls.sql` | Create | RLS policies for the two new tables |
| `src/lib/groups/groupMembers.ts` | Create | Pure helpers: partition members by status, `activeMemberIds`, invite-notification payload builder |
| `src/lib/groups/groupMembers.test.ts` | Create | Vitest for the pure helpers |
| `src/hooks/useCreatorGroups.ts` | Create | Business: list/create/rename/delete groups (templated on `useBrandShortlist.ts`) |
| `src/hooks/useCreatorGroupMembers.ts` | Create | Business: list members, `inviteCreators`, `removeMember` + `group_invitation` notification |
| `src/hooks/useCreatorGroupInvitations.ts` | Create | Creator: pending memberships, `accept`/`decline` via `respond_to_group_invitation` + notify owner |
| `src/pages/CreatorGroupsPage.tsx` | Create | Business: list of groups + create (route `/dashboard/business/groups`) |
| `src/pages/CreatorGroupDetailPage.tsx` | Create | Business: members + invite + remove (route `/dashboard/business/groups/:id`) |
| `src/components/groups/InviteCreatorsSheet.tsx` | Create | Creator picker (reuse `useCreatorBrowse` + `ShortlistDrawer` patterns) |
| `src/components/groups/GroupInviteCard.tsx` | Create | Creator: accept/decline card (reuse Invitations-tab styling) |
| `src/App.tsx` | Modify (~L68 imports, ~L233 routes) | Register the two new business routes + a creator "crews" surface entry |
| `src/pages/CreatorCampaignMarketplace.tsx` | Modify (later, Phase 2) | Host the creator crew surfaces |

### Phase 2 — Group-scoped free posting

| File | Create/Modify | Responsibility |
|---|---|---|
| `supabase/migrations/<ts>_campaigns_group_id.sql` | Create | `ALTER TABLE campaigns ADD COLUMN group_id ... ON DELETE RESTRICT` + partial index |
| `supabase/migrations/<ts>_group_campaign_gates.sql` | Create | Modified `campaigns` SELECT policy + modified `can_create_application` |
| `supabase/migrations/<ts>_apply_to_campaign_group_guard.sql` | Create | `apply_to_campaign` RPC: group-eligibility guard |
| `supabase/migrations/<ts>_group_campaign_lifecycle.sql` | Create | Accept-RPC escrow OR-branch + `enforce_active_campaign_limit` group exclusion |
| `src/components/campaigns/GroupTargetSelect.tsx` | Create | "Post to: Public marketplace \| <group>" selector |
| `src/hooks/useCampaignCreator.ts` | Modify (~L368-389) | Add `group_id`; when set, force free terms + `creator_count:1`; notify members on launch |
| `src/pages/CampaignCreator.tsx` | Modify | Render `GroupTargetSelect` |
| `src/hooks/useGroupCampaigns.ts` | Create | Creator: fetch the member's group campaigns (select **incl. `group_id`**) |
| `src/hooks/usePublicCampaigns.ts` | Modify (~L49) | Add `.is('group_id', null)` so group campaigns never appear publicly |
| `src/pages/CreatorCampaignMarketplace.tsx` | Modify (~L28, ~L172, ~L408) | Add "My Crews" tab rendering group campaigns via existing swipe/detail/apply |
| `src/hooks/useProjectComplete.ts` | Modify (~L110) | Deny-list payout guard (exclude free `escrow_status='none'`) |

---

# PHASE 1 — Roster

## Task 1: Migration — group tables

**Files:**
- Create: `supabase/migrations/<ts>_creator_groups_tables.sql`

- [ ] **Step 1: Determine the timestamp.** Run `ls supabase/migrations | tail -3`; choose a name strictly greater (e.g. `20260709120000_creator_groups_tables.sql`).

- [ ] **Step 2: Write the migration.**

```sql
-- Standing per-business creator groups ("crews") + membership.
CREATE TABLE public.creator_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_creator_groups_owner ON public.creator_groups(owner_id);

CREATE TABLE public.creator_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.creator_groups(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','active','declined','removed')),
  invited_by uuid REFERENCES public.profiles(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, creator_id)
);
CREATE INDEX idx_cgm_group ON public.creator_group_members(group_id);
CREATE INDEX idx_cgm_creator ON public.creator_group_members(creator_id);

-- Reuse the existing updated_at trigger fn (confirm its name — grep migrations for
-- "update_updated_at" / the fn used on campaigns; commonly public.handle_updated_at()).
CREATE TRIGGER trg_creator_groups_updated_at BEFORE UPDATE ON public.creator_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_cgm_updated_at BEFORE UPDATE ON public.creator_group_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.creator_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_group_members ENABLE ROW LEVEL SECURITY;
```

> Before finalizing: `grep -rl "BEFORE UPDATE" supabase/migrations | head` and confirm the exact updated_at trigger function name (`handle_updated_at` vs `update_updated_at_column` vs `set_updated_at`). Use the one already used by `campaigns`/`campaign_invitations`. If none is standard, drop the triggers and set `updated_at` from the hooks instead.

- [ ] **Step 3: Static-check the SQL** for typos (no apply yet — apply happens at the deploy task). Verify table/column names match the spec §4 exactly.

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/<ts>_creator_groups_tables.sql
git commit -m "feat(groups): creator_groups + creator_group_members tables"
```

## Task 2: Migration — group functions

**Files:**
- Create: `supabase/migrations/<ts>_creator_groups_functions.sql`

- [ ] **Step 1: Write the migration** (functions reference the tables from Task 1).

```sql
-- Membership check — SECURITY DEFINER to avoid RLS recursion (mirrors has_collaboration_on_campaign).
CREATE OR REPLACE FUNCTION public.is_active_group_member(p_group_id uuid, p_creator_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creator_group_members m
    WHERE m.group_id = p_group_id AND m.creator_id = p_creator_id AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_creator_group_owner(p_group_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creator_groups g
    WHERE g.id = p_group_id AND g.owner_id = p_user_id
  );
$$;

-- Creator-only accept/decline; RAISE if no pending invite so removed/declined can't self-reactivate.
CREATE OR REPLACE FUNCTION public.respond_to_group_invitation(p_group_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.creator_group_members
     SET status = CASE WHEN p_accept THEN 'active' ELSE 'declined' END,
         responded_at = now(), updated_at = now()
   WHERE group_id = p_group_id AND creator_id = auth.uid() AND status = 'invited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending group invitation';
  END IF;
END;
$$;

-- GRANT/REVOKE discipline (spec §5):
-- is_active_group_member is used inside the anon-reachable campaigns SELECT policy (Phase 2) —
--   do NOT revoke from anon; just grant authenticated (default anon grant stays).
GRANT EXECUTE ON FUNCTION public.is_active_group_member(uuid, uuid) TO authenticated;
-- The other two are NOT anon-reachable — full revoke + grant authenticated.
REVOKE EXECUTE ON FUNCTION public.is_creator_group_owner(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.is_creator_group_owner(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_to_group_invitation(uuid, boolean) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.respond_to_group_invitation(uuid, boolean) TO authenticated;
```

- [ ] **Step 2: Commit.**

```bash
git add supabase/migrations/<ts>_creator_groups_functions.sql
git commit -m "feat(groups): membership/owner helpers + accept-invite RPC"
```

## Task 3: Migration — group table RLS

**Files:**
- Create: `supabase/migrations/<ts>_creator_groups_rls.sql`

- [ ] **Step 1: Write the migration** (policies reference the Task-2 helpers).

```sql
-- creator_groups: owner manages; active members can read (so the crew name shows in the creator feed).
CREATE POLICY cg_owner_all ON public.creator_groups
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY cg_member_select ON public.creator_groups
  FOR SELECT USING (public.is_active_group_member(id, auth.uid()));

-- creator_group_members: owner of the parent group manages all rows; creator reads own rows.
CREATE POLICY cgm_owner_all ON public.creator_group_members
  FOR ALL USING (public.is_creator_group_owner(group_id, auth.uid()))
  WITH CHECK (public.is_creator_group_owner(group_id, auth.uid()));
CREATE POLICY cgm_self_select ON public.creator_group_members
  FOR SELECT USING (creator_id = auth.uid());
```

> Note: accept/decline is done via `respond_to_group_invitation` (SECURITY DEFINER), NOT a self-UPDATE policy, so a creator can only move `invited → active|declined`, never re-activate after `removed`.

- [ ] **Step 2: Commit.**

```bash
git add supabase/migrations/<ts>_creator_groups_rls.sql
git commit -m "feat(groups): RLS for creator_groups + creator_group_members"
```

## Task 4: Pure helpers (TDD)

**Files:**
- Create: `src/lib/groups/groupMembers.ts`
- Test: `src/lib/groups/groupMembers.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { partitionMembers, activeMemberIds, buildGroupInviteNotification } from './groupMembers';

type M = { creator_id: string; status: 'invited'|'active'|'declined'|'removed' };
const members: M[] = [
  { creator_id: 'a', status: 'active' },
  { creator_id: 'b', status: 'invited' },
  { creator_id: 'c', status: 'active' },
  { creator_id: 'd', status: 'removed' },
];

describe('groupMembers', () => {
  it('partitions by status', () => {
    const p = partitionMembers(members);
    expect(p.active.map(m => m.creator_id)).toEqual(['a', 'c']);
    expect(p.invited.map(m => m.creator_id)).toEqual(['b']);
    expect(p.removed.map(m => m.creator_id)).toEqual(['d']);
  });
  it('lists active ids only', () => {
    expect(activeMemberIds(members)).toEqual(['a', 'c']);
  });
  it('builds a create-notification body for a group invite', () => {
    const body = buildGroupInviteNotification({
      creatorId: 'x', groupName: 'My Crew', groupId: 'g1', actorId: 'owner1',
    });
    expect(body.recipientId).toBe('x');
    expect(body.type).toBe('group_invitation');
    expect(body.category).toBe('campaigns');
    expect(body.actionUrl).toContain('/dashboard/creator');
    expect(body.body).toContain('My Crew');
    expect(body.data).toEqual({ group_id: 'g1' });
  });
});
```

- [ ] **Step 2: Run it, verify it fails.** `npx vitest run src/lib/groups/groupMembers.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `groupMembers.ts`.**

```ts
export type GroupMemberStatus = 'invited' | 'active' | 'declined' | 'removed';
export interface GroupMemberLike { creator_id: string; status: GroupMemberStatus; }

export function partitionMembers<T extends GroupMemberLike>(members: T[]) {
  return {
    active:   members.filter(m => m.status === 'active'),
    invited:  members.filter(m => m.status === 'invited'),
    declined: members.filter(m => m.status === 'declined'),
    removed:  members.filter(m => m.status === 'removed'),
  };
}

export function activeMemberIds(members: GroupMemberLike[]): string[] {
  return members.filter(m => m.status === 'active').map(m => m.creator_id);
}

export function buildGroupInviteNotification(args: {
  creatorId: string; groupName: string; groupId: string; actorId: string;
}) {
  return {
    recipientId: args.creatorId,
    type: 'group_invitation',
    category: 'campaigns' as const,
    title: 'Crew invitation',
    body: `You've been invited to join the crew "${args.groupName}"`,
    actionUrl: `/dashboard/creator/campaigns?crews=1`,
    actorId: args.actorId,
    icon: 'invitation',
    data: { group_id: args.groupId },
    emailData: { groupName: args.groupName },
  };
}
```

- [ ] **Step 4: Run tests, verify pass.** `npx vitest run src/lib/groups/groupMembers.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/groups/groupMembers.ts src/lib/groups/groupMembers.test.ts
git commit -m "feat(groups): pure member/notification helpers + tests"
```

## Task 5: Business hooks — `useCreatorGroups`

**Files:**
- Create: `src/hooks/useCreatorGroups.ts`

- [ ] **Step 1: Implement**, templated on `src/hooks/useBrandShortlist.ts` (same react-query + toast + invalidation shape). Provide: `groups` list (`.eq('owner_id', user.id)`), `createGroup({name, description})`, `renameGroup`, `deleteGroup`. Query key `['creator-groups', user?.id]`; `enabled: !!user`. Explicit `.select('id, owner_id, name, description, created_at, updated_at')`. Handle the `deleteGroup` error where a group still owns campaigns (Phase 2 `ON DELETE RESTRICT` → FK error `23503`): toast "Remove or reassign this crew's campaigns first."

- [ ] **Step 2: Typecheck + build.** `npm run typecheck && npm run build` → clean (types must include `creator_groups`; regenerate first if not).

- [ ] **Step 3: Commit.** `git commit -am "feat(groups): useCreatorGroups hook"`

## Task 6: Business hooks — `useCreatorGroupMembers`

**Files:**
- Create: `src/hooks/useCreatorGroupMembers.ts`

- [ ] **Step 1: Implement.** `useCreatorGroupMembers(groupId)`:
  - Query members joined to creator profile: `.from('creator_group_members').select('id, group_id, creator_id, status, invited_at, responded_at, creator:creator_id ( ... )')` — enrich name/avatar like `useCreatorPendingInvitations` does (separate `profiles`/`creator_profiles` fetch keyed by `creator_id`). Query key `['creator-group-members', groupId]`.
  - `inviteCreators(creatorIds: string[])`: `insert` `{group_id, creator_id, status:'invited', invited_by: user.id}` rows (upsert on `(group_id, creator_id)` to be idempotent — on conflict, do nothing / ignore duplicate error). Then for each newly-invited creator, fire `create-notification` using `buildGroupInviteNotification` (fetch group `name` first). Reuse the invoke shape from `useInviteCreator` (`useCampaignInvitations.ts:85`).
  - `removeMember(creatorId)`: `update {status:'removed'}` where `group_id + creator_id`.
  - Invalidate `['creator-group-members', groupId]` on success.

- [ ] **Step 2: Typecheck + build** → clean.

- [ ] **Step 3: Commit.** `git commit -am "feat(groups): useCreatorGroupMembers (invite/remove + notify)"`

## Task 7: Creator hook — `useCreatorGroupInvitations`

**Files:**
- Create: `src/hooks/useCreatorGroupInvitations.ts`

- [ ] **Step 1: Implement**, modeled on `useCreatorPendingInvitations` + `useDeclineInvitation` (`useCampaignInvitations.ts:121-239`):
  - Query pending memberships for the current creator: `.from('creator_group_members').select('id, group_id, invited_at, group:group_id ( id, name, owner_id )').eq('creator_id', user.id).eq('status','invited')`. Enrich owner business name via a `business_profiles` fetch on `owner_id`. Query key `['creator-group-invitations', user?.id]`.
  - `accept(groupId)` / `decline(groupId)`: call `supabase.rpc('respond_to_group_invitation', { p_group_id: groupId, p_accept: <bool> })`. On success invalidate the query (and `['group-campaigns']` for Phase 2) and toast. On accept, fire a `create-notification` back to the group `owner_id` (type `group_invite_accepted`, category `campaigns`).

- [ ] **Step 2: Typecheck + build** → clean.

- [ ] **Step 3: Commit.** `git commit -am "feat(groups): useCreatorGroupInvitations (accept/decline)"`

## Task 8: Business pages — groups list + detail

**Files:**
- Create: `src/pages/CreatorGroupsPage.tsx`, `src/pages/CreatorGroupDetailPage.tsx`
- Create: `src/components/groups/InviteCreatorsSheet.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `CreatorGroupsPage`** — list `useCreatorGroups().groups` as cards (name, member count, description) with a "New crew" create dialog (name + optional description). Empty state: "Build a crew — invite creators you trust, then post free collabs just to them." Each card links to `/dashboard/business/groups/:id`. Loading + error states. `dc-*` tokens, pill buttons.

- [ ] **Step 2: `CreatorGroupDetailPage`** — read `:id` param; show group name (editable), members via `useCreatorGroupMembers(id)` grouped by status using `partitionMembers` (Active / Pending / show a "Removed" collapsed section), a per-member "Remove" action (confirm), and an "Invite creators" button opening `InviteCreatorsSheet`. Loading/error states.

- [ ] **Step 3: `InviteCreatorsSheet`** — reuse `useCreatorBrowse` for search + the avatar/list/multi-select "peek bar" patterns from `src/components/brand-browse/ShortlistDrawer.tsx`. Seed suggestions from `useBrandShortlist().shortlist`. Multi-select → confirm → `inviteCreators(selectedIds)`. Exclude creators already `active`/`invited` in this group (pass current members in).

- [ ] **Step 4: Routes** — in `src/App.tsx` add the lazy imports near L68 and routes near L233 (mirror the `CreatorBrowse` line exactly):

```tsx
const CreatorGroupsPage = lazy(() => import("./pages/CreatorGroupsPage"));
const CreatorGroupDetailPage = lazy(() => import("./pages/CreatorGroupDetailPage"));
// ...
<Route path="/dashboard/business/groups" element={<ProtectedRoute><BusinessRoute><CreatorGroupsPage /></BusinessRoute></ProtectedRoute>} />
<Route path="/dashboard/business/groups/:id" element={<ProtectedRoute><BusinessRoute><CreatorGroupDetailPage /></BusinessRoute></ProtectedRoute>} />
```

Add a nav entry to the business dashboard/menu pointing at `/dashboard/business/groups` (find where "Find Creators"/`/dashboard/business/creators` is linked and add a sibling "Crews" link).

- [ ] **Step 5: Build.** `npm run build && npm run typecheck` → clean.

- [ ] **Step 6: Commit.** `git commit -am "feat(groups): business crew management pages + invite sheet + routes"`

## Task 9: Creator crew surface — accept/decline

**Files:**
- Create: `src/components/groups/GroupInviteCard.tsx`
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`

- [ ] **Step 1: `GroupInviteCard`** — reuse the Invitations-tab card styling; shows crew name + inviting business + Accept / Decline buttons wired to `useCreatorGroupInvitations().accept/decline`.

- [ ] **Step 2: Surface it.** In `CreatorCampaignMarketplace.tsx`, extend the `Tab` union (L28) to add `'crews'`, add a tab entry (near L172) labeled "Crews" with a badge = pending group-invitation count, and render (near L408) a `crews` panel: pending `GroupInviteCard`s at top. (The group-campaign *feed* is added in Phase 2 into this same panel.)

- [ ] **Step 2b: Honor the deep-link.** `buildGroupInviteNotification` (Task 4) sets `actionUrl` to `/dashboard/creator/campaigns?crews=1`, so make the page read that query param on mount and set the initial `activeTab` to `'crews'` when `crews=1` is present (use the existing `useSearchParams`/`location.search` pattern already in this file for `?invited=true`, if present). This ensures the bell notification lands the creator on the Crews tab. Keep the param and the tab id in sync.

- [ ] **Step 3: Build.** `npm run build && npm run typecheck` → clean.

- [ ] **Step 4: Commit.** `git commit -am "feat(groups): creator Crews tab + accept/decline invites"`

## Task 10: Phase 1 deploy + verify (checkpoint)

- [ ] **Step 1:** Apply Task 1–3 migrations to prod via MCP `apply_migration` (in order: tables → functions → rls). Regenerate `src/integrations/supabase/types.ts`.
- [ ] **Step 2:** Run MCP `get_advisors({ type: 'security' })`. Confirm: no new *anon-callable* SECURITY DEFINER leak on `is_creator_group_owner`/`respond_to_group_invitation` (they're revoked from anon); `search_path` set on all three; the two new tables show RLS enabled with policies. Expect the generic "SECURITY DEFINER" notice — acceptable, matches `has_collaboration_on_campaign`.
- [ ] **Step 3:** Manual: as a business, create a crew and invite a creator; as that creator, see the invite (bell + `Crews` tab) and Accept → row flips to `active`; Decline path → `declined`, no access. Confirm the business sees the member as Active.
- [ ] **Step 4:** Commit any type regen. **Phase 1 is independently shippable here.**

---

# PHASE 2 — Group-scoped free posting

## Task 11: Migration — `campaigns.group_id`

**Files:**
- Create: `supabase/migrations/<ts>_campaigns_group_id.sql`

- [ ] **Step 1: Write.**

```sql
ALTER TABLE public.campaigns
  ADD COLUMN group_id uuid REFERENCES public.creator_groups(id) ON DELETE RESTRICT;
CREATE INDEX idx_campaigns_group_id ON public.campaigns(group_id) WHERE group_id IS NOT NULL;
```

> `ON DELETE RESTRICT` is load-bearing: `SET NULL` would turn a private campaign public (leak vector). All existing rows are `group_id IS NULL`, so public behavior is unchanged.

- [ ] **Step 2: Commit.** `git commit -am "feat(groups): campaigns.group_id (private-campaign scope)"`

## Task 12: Migration — visibility + apply gates

**Files:**
- Create: `supabase/migrations/<ts>_group_campaign_gates.sql`

- [ ] **Step 1: Write** (modifies the current `campaigns` SELECT policy from `20260511100000` and `can_create_application` from `20260520010000`).

```sql
-- Campaigns SELECT: public rows unchanged; group rows visible to active members only; no public leak.
DROP POLICY IF EXISTS "Users can view accessible campaigns" ON public.campaigns;
CREATE POLICY "Users can view accessible campaigns" ON public.campaigns FOR SELECT USING (
  user_id = auth.uid()
  OR (status = 'published' AND group_id IS NULL)
  OR (group_id IS NOT NULL AND public.is_active_group_member(group_id, auth.uid()))
  OR public.has_collaboration_on_campaign(id, auth.uid())
);

-- Apply gate: public branch gets group_id IS NULL; add an active-member branch for group campaigns.
-- (Pin search_path here too — the original 20260520010000 omitted it; adding it clears a likely
--  pre-existing function_search_path_mutable advisor while the fn is open.)
CREATE OR REPLACE FUNCTION public.can_create_application(p_campaign_id uuid, p_creator_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = p_creator_id AND role = 'content_creator')
    AND (
      EXISTS (SELECT 1 FROM public.campaigns
              WHERE id = p_campaign_id AND status = 'published' AND group_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.campaigns c
              WHERE c.id = p_campaign_id AND c.group_id IS NOT NULL
                AND public.is_active_group_member(c.group_id, p_creator_id))
      OR EXISTS (SELECT 1 FROM public.campaign_invitations
              WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id AND status = 'pending')
    )
  );
$$;
```

> The `campaign_invitations` branch is intentionally dead for v1 group campaigns (§5) — kept only to preserve the existing public/invite contract.

- [ ] **Step 2: Commit.** `git commit -am "feat(groups): private visibility + member apply gate"`

## Task 13: Migration — `apply_to_campaign` group guard

**Files:**
- Create: `supabase/migrations/<ts>_apply_to_campaign_group_guard.sql`

- [ ] **Step 1:** `CREATE OR REPLACE` the full `apply_to_campaign` from `20260525000001` (copy it verbatim), inserting the guard immediately **after** the identity check (after line 24) and **before** the INSERT. The RPC is SECURITY DEFINER and bypasses `can_create_application`, so this is the real server-side gate.

```sql
  -- Group campaigns: only active members (or an explicitly pending-invited creator) may apply.
  IF EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id AND group_id IS NOT NULL) THEN
    IF NOT (
         public.is_active_group_member(
           (SELECT group_id FROM campaigns WHERE id = p_campaign_id), p_creator_id)
      OR EXISTS (SELECT 1 FROM campaign_invitations
                 WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id AND status = 'pending')
    ) THEN
      RAISE EXCEPTION 'Not eligible to apply to this group campaign';
    END IF;
  END IF;
```

- [ ] **Step 2: Commit.** `git commit -am "feat(groups): apply_to_campaign server-side group-eligibility guard"`

## Task 14: Migration — lifecycle (escrow OR + limit exclusion)

**Files:**
- Create: `supabase/migrations/<ts>_group_campaign_lifecycle.sql`

- [ ] **Step 1:** `CREATE OR REPLACE accept_application_with_collaboration` (copy `20260527000001` verbatim) changing only the escrow guard at line 50:

```sql
  IF v_campaign.escrow_status = 'held'
     OR (v_campaign.group_id IS NOT NULL AND COALESCE(v_campaign.fixed_price, 0) = 0) THEN
    UPDATE campaigns SET status = 'active', updated_at = now() WHERE id = v_app.campaign_id;
  END IF;
```

- [ ] **Step 2:** `CREATE OR REPLACE enforce_active_campaign_limit` (copy the body from `20260507000002` verbatim) excluding group campaigns from both the guard and the count:

```sql
  IF NEW.status = 'published' AND NEW.group_id IS NULL AND (OLD.status IS DISTINCT FROM 'published') THEN
    ...
    SELECT count(*) INTO v_current
    FROM campaigns
    WHERE user_id = NEW.user_id
      AND status IN ('published', 'active')
      AND group_id IS NULL
      AND id IS DISTINCT FROM NEW.id;
    ...
```

> **CRITICAL — preserve the pinned `search_path`.** The body lives in `20260507000002` (which has NO
> `SET search_path`), but the search_path was pinned *later* in `20260507102621` via a separate
> `ALTER FUNCTION`. `CREATE OR REPLACE` resets every property not restated, so a verbatim copy would
> DROP `search_path` and reintroduce a `function_search_path_mutable` advisor on this SECURITY DEFINER
> fn — contradicting Task 18's advisor check. **Add `SET search_path = public` to the
> `CREATE OR REPLACE FUNCTION public.enforce_active_campaign_limit() ...` header** (or append
> `ALTER FUNCTION public.enforce_active_campaign_limit() SET search_path = public;` in this migration).
> Also re-assert `REVOKE EXECUTE ON FUNCTION public.enforce_active_campaign_limit() FROM anon, authenticated;`
> (from `20260507170005`) to be safe — `CREATE OR REPLACE` preserves grants, but restating is cheap.

- [ ] **Step 3: Commit.** `git commit -am "feat(groups): free group campaigns reach active w/o escrow; excluded from limit"`

## Task 15: Business — post to a group

**Files:**
- Create: `src/components/campaigns/GroupTargetSelect.tsx`
- Modify: `src/hooks/useCampaignCreator.ts` (~L368-389), `src/pages/CampaignCreator.tsx`

- [ ] **Step 1: `GroupTargetSelect`** — a select populated by `useCreatorGroups().groups`: default "Public marketplace", plus one option per crew. Emits `group_id | null`. Teal/pill styling. Include a helper caption when a crew is chosen: "Free collab — only this crew sees it; no payment."

- [ ] **Step 2: `useCampaignCreator`** — add `group_id: string | null` to the editable campaign state. In `launchMutation` (L368), when `group_id` is set, add to the insert payload: `group_id`, and force free terms `fixed_price: 0`, `pricing_type: 'fixed'`, `delivery_fee: 0`, `creator_count: 1` (defensive single-winner), keeping `status: 'published'`. After a successful launch to a group, fetch active members (`creator_group_members` where `group_id + status='active'`) and fire `create-notification` type `group_campaign_posted` (category `campaigns`) to each — do NOT create `campaign_invitations` rows.

- [ ] **Step 3: `CampaignCreator.tsx`** — render `GroupTargetSelect` on the launch/drop screen; wire its value into the hook state.

- [ ] **Step 4: Build.** `npm run build && npm run typecheck` → clean.

- [ ] **Step 5: Commit.** `git commit -am "feat(groups): post a free campaign to a crew"`

## Task 16: Creator — group-campaign feed + public filter

**Files:**
- Create: `src/hooks/useGroupCampaigns.ts`
- Modify: `src/hooks/usePublicCampaigns.ts` (~L49), `src/pages/CreatorCampaignMarketplace.tsx`

- [ ] **Step 1: `usePublicCampaigns`** — add `.is('group_id', null)` to the campaigns query (right after `.eq('status','published')`, L49) so group campaigns never surface in the public "All" tab (and, transitively, Donny Picks, which ranks over this array).

- [ ] **Step 2: `useGroupCampaigns`** — model on `usePublicCampaigns` but `.not('group_id','is',null).eq('status','published')` and **include `group_id` in the `.select(...)` list** (plus the crew name via a `creator_groups` fetch keyed by `group_id`). RLS already restricts rows to the member's crews. Also exclude taken campaigns via `get_unavailable_campaign_ids` like `usePublicCampaigns`. Query key `['group-campaigns', userId]`.

- [ ] **Step 3: Feed UI** — in the `crews` panel of `CreatorCampaignMarketplace.tsx` (added Task 9), render group campaigns below the pending invites using the existing `CampaignSwipeCard` + `CampaignDetailModal` + `OneTapApplySheet`. Label price as "Free collab" (guard `formatBudget`'s "$0"/"Budget TBD" case) and suppress the counter-offer control for group campaigns.

- [ ] **Step 4: Build.** `npm run build && npm run typecheck` → clean.

- [ ] **Step 5: Commit.** `git commit -am "feat(groups): creator My Crews campaign feed + public-browse filter"`

## Task 17: Payout guard (deny-list)

**Files:**
- Modify: `src/hooks/useProjectComplete.ts` (~L110)

- [ ] **Step 1:** Change the guard from `if (campaignEscrow?.escrow_status !== 'released')` to:

```ts
if (campaignEscrow?.escrow_status !== 'released' && campaignEscrow?.escrow_status !== 'none') {
```

This drops **only** the free (`escrow_status='none'`) payout call and preserves invocation for every paid state (`pending/held/releasing/refunded`). Do NOT switch to an allow-list. `release-creator-payout/index.ts` stays unchanged.

- [ ] **Step 2: Build.** `npm run build && npm run typecheck` → clean.

- [ ] **Step 3: Commit.** `git commit -am "fix(complete): skip payout invoke for free (escrow=none) campaigns"`

## Task 18: Phase 2 deploy + verify (checkpoint)

- [ ] **Step 1:** Apply Task 11–14 migrations to prod via MCP (in order: column → gates → apply-guard → lifecycle). Regenerate types.
- [ ] **Step 2:** `get_advisors({ type: 'security' })` → confirm no new leak; `search_path` intact; the modified SELECT policy present.
- [ ] **Step 3: Private-visibility core test** (spec §11.3): as a business, post a free campaign to a crew. Confirm (a) an **active member** sees it in "My Crews", price shows "Free collab", and one-tap apply completes with **zero Stripe prompt**; (b) a **non-member** creator does NOT see it in "All" and a direct `supabase.rpc('apply_to_campaign', ...)` for it **raises**; (c) it is absent from `usePublicCampaigns` results.
- [ ] **Step 4: Lifecycle test:** business accepts the application → `campaign_collaborations` row `active`, campaign `status='active'`, no escrow/payout; run completion → **no** `release-creator-payout` call (check network/logs), no error.
- [ ] **Step 5: Paid regression:** run one normal public paid campaign apply → accept → escrow → payout; confirm unchanged (only paid-path edit is the Task-17 deny-list, which still fires for held/releasing).

## Task 19: Final gates

- [ ] **Step 1:** `npm run build && npm run typecheck && npx vitest run src/lib/groups/` → all clean.
- [ ] **Step 2:** `edge-function-reviewer` — N/A (no edge function modified; `create-notification` is only *called*). Skip.
- [ ] **Step 3:** Codex second review: `codex review --base main --title "Creator groups + private group campaigns"`. Fix findings, re-run until clean.
- [ ] **Step 4:** `verify-prod` skill (both viewports, console errors) on the affected surfaces after deploy.
- [ ] **Step 5:** `knowledge-sync` skill (wiki concept page `creator-groups.md` + core-doc refresh + Donny RAG) as part of finishing the branch.
- [ ] **Step 6:** Open PR via `finishing-a-development-branch`.

---

## Notes & gotchas (carried from spec + repo memory)

- **Five leak vectors must all land (Phase 2):** `group_id` FK RESTRICT (T11); `usePublicCampaigns` `.is('group_id',null)` (T16); `can_create_application` public branch `group_id IS NULL` (T12); `apply_to_campaign` server guard (T13); `campaigns` SELECT public branch `group_id IS NULL` (T12).
- **Grant asymmetry (T2):** `is_active_group_member` must stay anon-executable (it's in the anon-reachable campaigns SELECT policy); the other two must be revoked from anon. Getting this backwards either leaks or breaks public browse with "permission denied for function".
- **Concurrent Lovable/founder PRs:** before the deploy tasks, re-fetch `origin/main` and check for collisions on `usePublicCampaigns.ts`, `useCampaignCreator.ts`, `CreatorCampaignMarketplace.tsx`, `useProjectComplete.ts`, and the apply/accept RPC migrations. `src/integrations/supabase/client.ts` and `types.ts` are Lovable-autogenerated — watch for regen churn.
- **Types before hooks:** regenerate `types.ts` after each phase's DDL so `creator_groups`/`creator_group_members`/`campaigns.group_id` are typed before the consuming hooks compile.
- **`removed` member with in-flight application:** intended behavior — pending app persists (owner can still act) but the campaign hides via RLS and re-apply is blocked; accepted members keep access via `has_collaboration_on_campaign`. Optional: warn on the remove action if the member has a pending application.
