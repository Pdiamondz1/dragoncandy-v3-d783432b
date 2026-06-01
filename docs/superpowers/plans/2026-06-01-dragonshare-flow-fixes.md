# DragonShare Submit → Review → Pay Flow Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix eight DragonShare defects across the Creator and Restaurant/Brand sides so the submit → review → pay/pass → notify loop works end-to-end and trustworthily.

**Architecture:** React 18 + TS frontend with React Query hooks over a Supabase backend. Two visible bugs ("Unknown org", social-not-recognized) are fixed with security-definer resolver RPCs that bridge an `organizations.id` ↔ `business_profiles.id` mismatch. A soft-decline flow adds two nullable columns + a security-definer RPC. Creator notifications reuse the existing `create-notification` edge function. All UI changes respect the desktop (`lg:`/`xl:`) vs mobile (base classes) split.

**Tech Stack:** React 18, TypeScript (strict), Vite, Tailwind (`dc-*` tokens), shadcn/ui (Radix), React Query, Supabase (Postgres + RLS + Deno edge functions), Stripe Connect, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-01-dragonshare-flow-fixes-design.md`

---

## Deploy & Verification Conventions (read once)

- **Frontend** deploys by pushing to `main` (Lovable auto-deploys). **SQL and edge functions do NOT** — apply them to the live Supabase project via the Supabase MCP (`mcp__plugin_supabase_supabase__*`, authenticate first) or CLI, **and** commit the migration file to `supabase/migrations/`.
- After each task: `npm run typecheck` && `npm run lint` && `npm run test` && `npm run build` must pass before commit/push.
- After a frontend deploy, poll the deployed bundle hash before verifying in prod, then verify with browser automation on **both** desktop and mobile viewports and confirm **no console errors**. Test accounts: creator `damewillie@gmail.com`, restaurant `dwilliams@harbormill.net` (password in project memory `reference_browser_credentials`).
- One change per task. Do not start the next task until the current one is ~95% verified.
- Migration filename convention: `supabase/migrations/<UTC-timestamp>_<slug>.sql` (e.g. `20260601120000_dragonshare_org_resolvers.sql`). Use a timestamp later than `20260526200000`.

## File Structure (created / modified)

**New files**
- `supabase/migrations/2026XXXXXXXXXX_dragonshare_org_resolvers.sql` — Task 1 RPCs
- `supabase/migrations/2026XXXXXXXXXX_dragonshare_decline.sql` — Task 6 columns + RPC
- `src/hooks/useResolveDragonShareOrgs.ts` — Task 1 (org-name resolver hook)
- `src/lib/dragonshareOrgs.ts` + `.test.ts` — Task 1 (pure merge helper)
- `src/components/dragonshare/DragonShareSubmitSuccessDialog.tsx` — Task 3
- `src/lib/boostAmount.ts` + `.test.ts` — Task 4 (custom-amount validation)
- `src/components/dragonshare/WatermarkedMedia.tsx` — Task 5
- `src/hooks/useDeclineDragonSharePost.ts` — Task 6
- `src/lib/dragonsharePostState.ts` + `.test.ts` — Task 6/7 (card-state derivation)

**Modified files**
- `src/hooks/useDragonShare.ts` — Task 1 (creator query), Task 6 (org query filter)
- `src/hooks/useAmplificationPreview.ts` — Task 1 (social-by-org RPC)
- `src/pages/CreatorDragonShare.tsx` — Task 1 (org name), Task 7 (card status)
- `src/components/dragonshare/DragonShareSubmitSheet.tsx` — Task 2 (reset fix), Task 3
- `src/components/dragonshare/RestaurantTypeahead.tsx` — Task 2 (interact-outside)
- `src/components/dragonshare/DragonShareInlineForm.tsx` — Task 3
- `src/hooks/useDragonShareSubmitForm.ts` — Task 3 (success state)
- `src/components/dragonshare/DragonSharePostCard.tsx` — Task 4, 5, 6
- `src/types/dragonshare.ts` — Task 4 (custom helper types if needed)
- `src/types/notifications.ts` — Task 7 (`dragonshare_declined` type)
- `supabase/functions/_shared/fulfill-boost.ts` — Task 7 (boost-paid notification)

---

## Task 1: Backend resolvers — org name + social-by-org *(Creator #2, Restaurant #4)*

**Files:**
- Verify-first (no write): live schema check
- Create: `supabase/migrations/<ts>_dragonshare_org_resolvers.sql`
- Create: `src/lib/dragonshareOrgs.ts`, `src/lib/dragonshareOrgs.test.ts`
- Create: `src/hooks/useResolveDragonShareOrgs.ts`
- Modify: `src/hooks/useDragonShare.ts` (`useCreatorDragonSharePosts`)
- Modify: `src/hooks/useAmplificationPreview.ts`
- Modify: `src/pages/CreatorDragonShare.tsx`

- [ ] **Step 0: Verify live schema (decide RPC vs existing view + owner mapping)**

Authenticate the Supabase MCP, then run (read-only) against the live DB:
```sql
-- a) does a safe public org view already exist?
select table_name from information_schema.views
where table_schema = 'public' and table_name in ('public_organizations');
-- b) canonical owner mapping for an org → business_profiles.id
--    inspect both candidate paths for Harbormill's org:
select om.org_id, om.user_id, om.role, om.invitation_status
from org_members om where om.role = 'owner' and om.invitation_status = 'active' limit 5;
select bp.id as business_profile_id, bp.user_id from business_profiles bp limit 5;
-- confirm business_outstand_accounts.business_id references business_profiles.id
```
Decision rule: if `public_organizations` exists and exposes `(id, name, logo_url, org_type)` safely, the org-name RPC may select from it; otherwise create `resolve_dragonshare_orgs`. Use **`org_members` owner role** as the single canonical org→owner source (matches `create_boost`'s membership model). Also confirm whether an org can have **multiple** active `owner` members — if so, `get_org_connected_platforms` unions their connected accounts (acceptable; the `select distinct` dedupes identical platform/handle rows). Record the decision in the migration's header comment.

- [ ] **Step 1: Write the resolver migration**

Create `supabase/migrations/<ts>_dragonshare_org_resolvers.sql`:
```sql
-- DragonShare resolvers: bridge organizations.id <-> business_profiles.id.
-- Owner mapping canonical source: org_members (role='owner', active).

-- 1) Public-safe org name/logo resolver (fixes creator "Unknown org").
create or replace function resolve_dragonshare_orgs(p_org_ids uuid[])
returns table (id uuid, name text, logo_url text, org_type text)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.name, o.logo_url, o.org_type
  from organizations o
  where o.id = any(p_org_ids)
    and o.deleted_at is null;
$$;

grant execute on function resolve_dragonshare_orgs(uuid[]) to authenticated;

-- 2) Connected social platforms for an org (fixes "Connect social accounts").
create or replace function get_org_connected_platforms(p_org_id uuid)
returns table (platform text, platform_handle text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct boa.platform, boa.platform_handle
  from org_members om
  join business_profiles bp on bp.user_id = om.user_id
  join business_outstand_accounts boa on boa.business_id = bp.id
  where om.org_id = p_org_id
    and om.role = 'owner'
    and om.invitation_status = 'active'
    and boa.status = 'active';
$$;

grant execute on function get_org_connected_platforms(uuid) to authenticated;
```
> Adjust column names only if Step 0 shows `organizations` lacks `deleted_at` (the team-accounts migration defines it). If `public_organizations` is reused instead, select from it in `resolve_dragonshare_orgs`.

- [ ] **Step 2: Apply to live DB and smoke-test the RPCs**

Apply via Supabase MCP (apply migration), then verify:
```sql
select * from resolve_dragonshare_orgs(array['<harbormill-org-id>']::uuid[]);
select * from get_org_connected_platforms('<harbormill-org-id>');
```
Expected: first returns Harbormill's `(id, name='Harbormill', logo_url, org_type='restaurant')`; second returns at least `('instagram', <handle>)`.

- [ ] **Step 3: Write the failing test for the pure merge helper**

Create `src/lib/dragonshareOrgs.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mergeResolvedOrgs, type ResolvedOrg } from './dragonshareOrgs';

const orgs: ResolvedOrg[] = [
  { id: 'o1', name: 'Harbormill', logo_url: 'l1', org_type: 'restaurant' },
];

describe('mergeResolvedOrgs', () => {
  it('attaches the resolved org to each post by target_org_id', () => {
    const posts = [{ id: 'p1', target_org_id: 'o1' }, { id: 'p2', target_org_id: 'o2' }];
    const result = mergeResolvedOrgs(posts, orgs);
    expect(result[0].target_org).toEqual(orgs[0]);
    expect(result[1].target_org).toBeUndefined();
  });

  it('returns distinct org ids needing resolution', () => {
    const { distinctOrgIds } = mergeResolvedOrgs(
      [{ id: 'p1', target_org_id: 'o1' }, { id: 'p2', target_org_id: 'o1' }],
      [],
    );
    expect(distinctOrgIds).toEqual(['o1']);
  });
});
```

- [ ] **Step 4: Run the test — verify it fails**

Run: `npx vitest run src/lib/dragonshareOrgs.test.ts`
Expected: FAIL (module not found / `mergeResolvedOrgs` undefined).

- [ ] **Step 5: Implement the helper**

Create `src/lib/dragonshareOrgs.ts`:
```ts
export interface ResolvedOrg {
  id: string;
  name: string;
  logo_url: string | null;
  org_type: string;
}

export function mergeResolvedOrgs<T extends { target_org_id: string }>(
  posts: T[],
  orgs: ResolvedOrg[],
): (T & { target_org?: ResolvedOrg })[] & { distinctOrgIds: string[] } {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const merged = posts.map((p) => ({ ...p, target_org: byId.get(p.target_org_id) }));
  const distinctOrgIds = [...new Set(posts.map((p) => p.target_org_id))];
  // attach for callers that need the id list without re-deriving
  return Object.assign(merged, { distinctOrgIds });
}
```

- [ ] **Step 6: Run the test — verify it passes**

Run: `npx vitest run src/lib/dragonshareOrgs.test.ts` → Expected: PASS.

- [ ] **Step 7: Add the resolver hook**

Create `src/hooks/useResolveDragonShareOrgs.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ResolvedOrg } from '@/lib/dragonshareOrgs';

export function useResolveDragonShareOrgs(orgIds: string[]) {
  const sorted = [...new Set(orgIds)].sort();
  return useQuery({
    queryKey: ['dragonshare-resolved-orgs', sorted],
    queryFn: async (): Promise<ResolvedOrg[]> => {
      if (sorted.length === 0) return [];
      const { data, error } = await supabase.rpc('resolve_dragonshare_orgs', { p_org_ids: sorted });
      if (error) throw error;
      return (data ?? []) as ResolvedOrg[];
    },
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 8: Wire org names into the creator posts view**

In `src/hooks/useDragonShare.ts`, change `useCreatorDragonSharePosts` to drop the RLS-blocked embed (keep `boosts`):
```ts
.select('*, boosts:dragonshare_boosts(*)')
```
In `src/pages/CreatorDragonShare.tsx` (`CreatorDragonShare` component), after `const { data: posts } = useCreatorDragonSharePosts();` resolve names:
```ts
import { useResolveDragonShareOrgs } from '@/hooks/useResolveDragonShareOrgs';
import { mergeResolvedOrgs } from '@/lib/dragonshareOrgs';
// ...
const orgIds = (posts ?? []).map((p) => p.target_org_id);
const { data: resolvedOrgs } = useResolveDragonShareOrgs(orgIds);
const postsWithOrg = mergeResolvedOrgs(posts ?? [], resolvedOrgs ?? []);
```
Use `postsWithOrg` where `posts` was used for filtering/rendering, so `post.target_org?.name` is populated. Keep the `?? 'Unknown org'` fallback ONLY for genuinely unresolved orgs (it should no longer trigger for valid orgs).

- [ ] **Step 9: Fix social-by-org detection**

In `src/hooks/useAmplificationPreview.ts`, replace the `orgId` branch body with the RPC:
```ts
if (orgId) {
  const { data: orgAccounts } = await supabase.rpc('get_org_connected_platforms', { p_org_id: orgId });
  for (const acct of orgAccounts ?? []) {
    platforms.push({ platform: acct.platform, ownerName: acct.platform_handle ?? 'Business', ownerType: 'business' });
  }
}
```
Leave the `creatorId` branch (querying by `user_id`) unchanged — that path is correct.

- [ ] **Step 10: Typecheck, lint, test, build**

Run: `npm run typecheck && npm run lint && npm run test && npm run build` → Expected: all pass.

- [ ] **Step 11: Commit, push, deploy-verify**

```bash
git add supabase/migrations src/lib/dragonshareOrgs.ts src/lib/dragonshareOrgs.test.ts \
  src/hooks/useResolveDragonShareOrgs.ts src/hooks/useDragonShare.ts \
  src/hooks/useAmplificationPreview.ts src/pages/CreatorDragonShare.tsx
git commit -m "fix(dragonshare): resolve org name and connected social via security-definer RPCs"
```
Push. After deploy: creator card shows "Harbormill" (not "Unknown org"); restaurant boost card + `BoostConfirmationSheet` show connected Instagram. No console errors, both viewports.

---

## Task 2: Fix upload-persists bug *(Creator #1)*

**Files:**
- Modify: `src/components/dragonshare/DragonShareSubmitSheet.tsx`
- Modify (if needed): `src/components/dragonshare/RestaurantTypeahead.tsx`

- [ ] **Step 1: Reproduce on both viewports**

Using browser automation in prod, mobile viewport: open the creator DragonShare submit sheet, upload a file, then use the restaurant typeahead. Confirm the upload preview disappears (repro). Desktop: repeat with the inline form; confirm it does NOT disappear (expected stable). Record findings (use superpowers:systematic-debugging discipline).

> **Root cause note:** Radix `Sheet` unmounts its content on close, so any unwanted close destroys the form-hook state living inside the sheet. The fix has two parts: (a) stop the unconditional `form.reset()`, and (b) prevent unwanted closes *only while the restaurant typeahead dropdown is open* — without breaking the normal overlay-tap / X close path.

- [ ] **Step 2: Stop the unconditional reset on sheet close**

In `DragonShareSubmitSheet.tsx`, the current `Sheet`:
```tsx
<Sheet open={open} onOpenChange={(v) => { if (!v) form.reset(); onOpenChange(v); }}>
```
Replace with (no reset on close — `handleSubmit` success and the Task 3 dialog drive resets):
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
```

- [ ] **Step 3: Block close ONLY while the typeahead dropdown is open**

Do NOT blanket-`preventDefault()` — that would disable the overlay-tap close (the default Radix `SheetContent` X button is the only other close path and the sheet renders no custom close). Instead, surface the typeahead's open state and guard conditionally.

First, give `RestaurantTypeahead` an optional open-state callback. In `RestaurantTypeahead.tsx`, add to `Props`: `onOpenChange?: (open: boolean) => void;`. Then call it wherever `setOpen(...)` runs (the input `onChange`/`onFocus` set true; the outside-click handler and result `onSelect` set false) — e.g. wrap: `const setOpenState = (v: boolean) => { setOpen(v); onOpenChange?.(v); };` and use `setOpenState` everywhere `setOpen` is currently called. (Desktop `DragonShareInlineForm` passes no callback — default `undefined`, behavior unchanged.)

Then in `DragonShareSubmitSheet.tsx`, track it and guard:
```tsx
const [typeaheadOpen, setTypeaheadOpen] = useState(false);
// ...
<SheetContent
  side="bottom"
  className="..."  // unchanged
  onPointerDownOutside={(e) => { if (typeaheadOpen) e.preventDefault(); }}
  onInteractOutside={(e) => { if (typeaheadOpen) e.preventDefault(); }}
>
```
and pass `onOpenChange={setTypeaheadOpen}` to the `<RestaurantTypeahead ... />` inside the sheet.

- [ ] **Step 3b: Verify both close paths still work**

Confirm (mobile, in repro before pushing if possible, else in prod after): with the dropdown CLOSED, tapping the overlay and the X both close the sheet; with the dropdown OPEN, keyboard/focus/scroll does NOT close it and the upload preview survives.

- [ ] **Step 4: Typecheck/lint/build**

Run: `npm run typecheck && npm run lint && npm run build` → Expected: pass.

- [ ] **Step 5: Commit, push, deploy-verify**

```bash
git add src/components/dragonshare/DragonShareSubmitSheet.tsx src/components/dragonshare/RestaurantTypeahead.tsx
git commit -m "fix(dragonshare): keep uploaded content when tagging a restaurant (mobile sheet)"
```
Push. Verify in prod mobile: upload → tag restaurant → upload persists; desktop still works. No console errors.

---

## Task 3: Submit success confirmation *(Creator #3)*

**Files:**
- Create: `src/components/dragonshare/DragonShareSubmitSuccessDialog.tsx`
- Modify: `src/hooks/useDragonShareSubmitForm.ts`
- Modify: `src/components/dragonshare/DragonShareInlineForm.tsx`, `DragonShareSubmitSheet.tsx`

- [ ] **Step 1: Add success state to the form hook**

In `src/hooks/useDragonShareSubmitForm.ts`: add `const [submittedOrgName, setSubmittedOrgName] = useState<string | null>(null);`. In `handleSubmit`, on success capture the name before reset and DON'T auto-close:
```ts
const orgName = selectedOrg.name;
await submitMutation.mutateAsync({ /* unchanged */ });
setSubmittedOrgName(orgName);
reset();
// remove the toast + options?.onSuccess?.() auto-close here; dialog drives next action
```
Expose `submittedOrgName`, and `clearSubmitted: () => setSubmittedOrgName(null)` in the return object. Keep the `catch` toast.

- [ ] **Step 2: Build the success dialog**

Create `src/components/dragonshare/DragonShareSubmitSuccessDialog.tsx`:
```tsx
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

interface Props {
  open: boolean;
  orgName: string | null;
  onShareAnother: () => void;
  onDone: () => void;
}

export function DragonShareSubmitSuccessDialog({ open, orgName, onShareAnother, onDone }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDone(); }}>
      <DialogContent className="rounded-3xl text-center max-w-sm">
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="h-14 w-14 rounded-full bg-dc-teal/15 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-dc-teal" />
          </div>
          <h2 className="text-lg font-bold text-dc-text">Sent to {orgName ?? 'the restaurant'}!</h2>
          <p className="text-sm text-dc-text-muted">
            They'll review your content and can boost it. You'll get notified either way.
          </p>
          <div className="flex flex-col gap-2 w-full mt-2">
            <Button onClick={onShareAnother} className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold">
              Share another
            </Button>
            <Button onClick={onDone} variant="ghost" className="w-full rounded-full text-dc-text-muted">
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire into desktop inline form**

In `DragonShareInlineForm.tsx`, render the dialog driven by `form.submittedOrgName`:
```tsx
<DragonShareSubmitSuccessDialog
  open={!!form.submittedOrgName}
  orgName={form.submittedOrgName}
  onShareAnother={form.clearSubmitted}
  onDone={form.clearSubmitted}
/>
```
(On desktop both actions just clear the dialog; the form is already reset and ready for a new submission.)

- [ ] **Step 4: Wire into mobile sheet**

In `DragonShareSubmitSheet.tsx`, render the same dialog. `onShareAnother` keeps the sheet open (`form.clearSubmitted()`); `onDone` clears and closes the sheet:
```tsx
<DragonShareSubmitSuccessDialog
  open={!!form.submittedOrgName}
  orgName={form.submittedOrgName}
  onShareAnother={form.clearSubmitted}
  onDone={() => { form.clearSubmitted(); onOpenChange(false); }}
/>
```
Remove the old `onSuccess: () => onOpenChange(false)` reliance (success no longer auto-closes; the dialog drives it).

- [ ] **Step 5: Typecheck/lint/build, commit, push, deploy-verify**

Run checks; then:
```bash
git add src/components/dragonshare/DragonShareSubmitSuccessDialog.tsx \
  src/hooks/useDragonShareSubmitForm.ts \
  src/components/dragonshare/DragonShareInlineForm.tsx \
  src/components/dragonshare/DragonShareSubmitSheet.tsx
git commit -m "feat(dragonshare): success confirmation dialog with Share another"
```
Verify prod both viewports: after submit, dialog appears; "Share another" resets for a new submission; "Done" closes (mobile). No console errors.

---

## Task 4: Custom boost amount *(Restaurant #3)*

**Files:**
- Create: `src/lib/boostAmount.ts`, `src/lib/boostAmount.test.ts`
- Modify: `src/components/dragonshare/DragonSharePostCard.tsx`

- [ ] **Step 1: Write the failing validation test**

Create `src/lib/boostAmount.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateCustomBoost, dollarsToCents } from './boostAmount';

describe('validateCustomBoost', () => {
  it('accepts amounts within $5–$500', () => {
    expect(validateCustomBoost(5)).toEqual({ ok: true, cents: 500 });
    expect(validateCustomBoost(42)).toEqual({ ok: true, cents: 4200 });
    expect(validateCustomBoost(500)).toEqual({ ok: true, cents: 50000 });
  });
  it('rejects below $5, above $500, and non-finite', () => {
    expect(validateCustomBoost(4).ok).toBe(false);
    expect(validateCustomBoost(501).ok).toBe(false);
    expect(validateCustomBoost(NaN).ok).toBe(false);
  });
  it('rounds to whole cents', () => {
    expect(dollarsToCents(12.349)).toBe(1235);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run src/lib/boostAmount.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/boostAmount.ts`:
```ts
export const BOOST_MIN_CENTS = 500;
export const BOOST_MAX_CENTS = 50000;

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function validateCustomBoost(dollars: number):
  | { ok: true; cents: number }
  | { ok: false; reason: string } {
  if (!Number.isFinite(dollars)) return { ok: false, reason: 'Enter an amount' };
  const cents = dollarsToCents(dollars);
  if (cents < BOOST_MIN_CENTS) return { ok: false, reason: 'Minimum is $5' };
  if (cents > BOOST_MAX_CENTS) return { ok: false, reason: 'Maximum is $500' };
  return { ok: true, cents };
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `npx vitest run src/lib/boostAmount.test.ts` → Expected: PASS.

> **Card overlap note:** `DragonSharePostCard.tsx` is also edited by Tasks 5 and 6. Tasks are sequential and each commits independently, so **re-read the current file before editing** rather than trusting the spec's original line numbers. This task adds the Custom row to the boost-tier block; Task 5 swaps the preview to `WatermarkedMedia`; Task 6 adds Pass/Download to this same action region.

- [ ] **Step 5: Add the Custom UI to the card**

In `DragonSharePostCard.tsx`, add imports `import { Input } from '@/components/ui/input';` and `import { validateCustomBoost } from '@/lib/boostAmount';`, and local state near the top of the component:
```tsx
const [customOpen, setCustomOpen] = useState(false);
const [customVal, setCustomVal] = useState('');
const [customError, setCustomError] = useState<string | null>(null);
```
Inside the existing `canBoost` branch (the `<div className="flex items-center gap-1.5 lg:gap-2">…BOOST_TIERS.map…</div>`), wrap that tier row and append a Custom toggle + collapsible input directly below it:
```tsx
<div className="space-y-2">
  <div className="flex items-center gap-1.5 lg:gap-2">
    {/* existing BOOST_TIERS.map(...) stays here unchanged */}
    <div className="flex-1 flex flex-col items-center gap-0.5">
      <span className="text-[10px] invisible">POPULAR</span>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full w-full"
        onClick={() => { setCustomOpen((o) => !o); setCustomError(null); }}
      >
        Custom
      </Button>
    </div>
  </div>
  {customOpen && (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dc-text-muted">$</span>
          <Input
            type="number" min={5} max={500} inputMode="decimal"
            placeholder="5–500"
            value={customVal}
            onChange={(e) => { setCustomVal(e.target.value); setCustomError(null); }}
            className="rounded-full pl-6"
          />
        </div>
        {customError && <p className="text-[11px] text-dc-pink-accent mt-1">{customError}</p>}
      </div>
      <Button
        size="sm"
        className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white"
        onClick={() => {
          const v = validateCustomBoost(parseFloat(customVal));
          if (v.ok) { setSelectedTier({ cents: v.cents, label: 'custom' }); setCustomOpen(false); }
          else setCustomError(v.reason);
        }}
      >
        Boost
      </Button>
    </div>
  )}
</div>
```
`selectedTier` already feeds the existing `BoostConfirmationSheet` (which accepts `tierLabel='custom'`). Base classes only (the card already provides `lg:` spacing); no desktop-specific change needed.

- [ ] **Step 6: Typecheck/lint/test/build, commit, push, deploy-verify**

```bash
git add src/lib/boostAmount.ts src/lib/boostAmount.test.ts src/components/dragonshare/DragonSharePostCard.tsx
git commit -m "feat(dragonshare): custom boost amount ($5–$500)"
```
Verify prod (restaurant, both viewports): Custom reveals an input, validates, and a custom boost completes through the existing confirm sheet. No console errors.

---

## Task 5: Watermarked preview *(Restaurant #1)*

**Files:**
- Create: `src/components/dragonshare/WatermarkedMedia.tsx`
- Modify: `src/components/dragonshare/DragonSharePostCard.tsx`

- [ ] **Step 1: Build the WatermarkedMedia component**

Create `src/components/dragonshare/WatermarkedMedia.tsx`:
```tsx
import { Play } from 'lucide-react';
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';

interface Props {
  src: string;
  isVideo: boolean;
  /** when true, render the watermark overlay (pre-payment preview) */
  watermark: boolean;
  className?: string;
}

export function WatermarkedMedia({ src, isVideo, watermark, className }: Props) {
  return (
    <div className={`relative h-48 w-full overflow-hidden rounded-xl ${className ?? ''}`}>
      {isVideo ? (
        <>
          <VideoThumbnail src={src} className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="h-5 w-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        </>
      ) : (
        <img src={src} alt="Content preview" className="w-full h-full object-cover" />
      )}
      {watermark && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none select-none flex items-center justify-center overflow-hidden"
        >
          <div className="absolute inset-[-40%] flex flex-wrap gap-x-6 gap-y-8 rotate-[-30deg] opacity-[0.18]">
            {Array.from({ length: 40 }).map((_, i) => (
              <span key={i} className="text-dc-text text-xs lg:text-sm font-bold whitespace-nowrap tracking-wider">
                DragonCandy • PREVIEW
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Use it in the card**

> **Card overlap note:** builds on Task 4's edits to the same file — re-read the current `DragonSharePostCard.tsx` before editing.

In `DragonSharePostCard.tsx`, replace the inline content-preview block (`{contentUrl && (<div className="px-4 pb-3"><div className="relative h-48 ...">...</div></div>)}`) with:
```tsx
{contentUrl && (
  <div className="px-4 pb-3">
    <WatermarkedMedia src={contentUrl} isVideo={isVideoPost(post)} watermark={!isAlreadyBoosted} />
  </div>
)}
```
Clean media renders once `boost_status === 'boosted'` (`isAlreadyBoosted` already computed). Remove now-unused `Play`/`VideoThumbnail` imports if no longer referenced.

- [ ] **Step 3: Typecheck/lint/build, commit, push, deploy-verify**

```bash
git add src/components/dragonshare/WatermarkedMedia.tsx src/components/dragonshare/DragonSharePostCard.tsx
git commit -m "feat(dragonshare): watermark content preview before payment"
```
Verify prod (restaurant, both viewports): available posts show the diagonal watermark; boosted posts show clean media. No console errors.

---

## Task 6: Pay-or-Pass decision + post-pay Download *(Restaurant #2, after-pay)*

**Files:**
- Create: `supabase/migrations/<ts>_dragonshare_decline.sql`
- Create: `src/hooks/useDeclineDragonSharePost.ts`
- Create: `src/lib/dragonsharePostState.ts`, `.test.ts`
- Modify: `src/hooks/useDragonShare.ts` (`useOrgDragonSharePosts`)
- Modify: `src/components/dragonshare/DragonSharePostCard.tsx`

- [ ] **Step 1: Write the decline migration (columns + RPC)**

Create `supabase/migrations/<ts>_dragonshare_decline.sql`:
```sql
-- Soft-decline for DragonShare posts (business "Pass"). Additive only.
alter table dragonshare_posts add column if not exists declined_at timestamptz;
alter table dragonshare_posts add column if not exists declined_by uuid references auth.users(id);

create or replace function decline_dragonshare_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
begin
  select id, target_org_id, boost_status, declined_at, creator_id
  into v_post
  from dragonshare_posts
  where id = p_post_id
  for update;

  if v_post is null then
    raise exception 'Post not found';
  end if;

  -- caller must be owner/admin of the target org
  if not exists (
    select 1 from org_members
    where org_id = v_post.target_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and invitation_status = 'active'
  ) then
    raise exception 'Only org owners or admins can pass on posts';
  end if;

  if v_post.boost_status = 'boosted' then
    raise exception 'Post already boosted; cannot pass';
  end if;
  -- guard in-flight boosts (Stripe checkout open / off-session PI mid-flight):
  -- boost_status only flips to 'boosted' at fulfillment, so also block on a
  -- pending/captured boost row from any org member.
  if exists (
    select 1 from dragonshare_boosts
    where post_id = p_post_id and status in ('pending', 'captured')
  ) then
    raise exception 'A boost is in progress; cannot pass';
  end if;
  if v_post.declined_at is not null then
    return; -- idempotent
  end if;

  update dragonshare_posts
    set declined_at = now(), declined_by = auth.uid()
    where id = p_post_id;

  insert into dragonshare_events (event_type, actor_user_id, actor_org_id, post_id, payload)
  values ('post_declined', auth.uid(), v_post.target_org_id, p_post_id, '{}'::jsonb);
end;
$$;

grant execute on function decline_dragonshare_post(uuid) to authenticated;
```
> The creator decline **notification** is added in Task 7 via a follow-up `CREATE OR REPLACE` migration (so it lands with the `dragonshare_declined` type registration). Do not add the notification insert here.

- [ ] **Step 2: Apply to live DB + smoke test**

Apply migration via Supabase MCP. As the restaurant owner (or via SQL with a real `auth.uid()` context), confirm `decline_dragonshare_post('<available-post-id>')` sets `declined_at` and raises on a boosted post.

- [ ] **Step 3: Write failing test for card-state derivation**

Create `src/lib/dragonsharePostState.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveCreatorPostState } from './dragonsharePostState';

describe('deriveCreatorPostState', () => {
  it('paid when a transferred boost exists', () => {
    expect(deriveCreatorPostState({ boost_status: 'boosted', declined_at: null,
      boosts: [{ status: 'transferred', creator_payout_cents: 4000 }] }).kind).toBe('paid');
  });
  it('declined (soft) when declined_at set and not boosted', () => {
    expect(deriveCreatorPostState({ boost_status: 'available', declined_at: '2026-06-01', boosts: [] }).kind).toBe('declined');
  });
  it('pending otherwise', () => {
    expect(deriveCreatorPostState({ boost_status: 'available', declined_at: null, boosts: [] }).kind).toBe('pending');
  });
});
```

- [ ] **Step 4: Run — verify it fails**, then **Step 5: implement**

Run: `npx vitest run src/lib/dragonsharePostState.test.ts` → FAIL.
Create `src/lib/dragonsharePostState.ts`:
```ts
interface MinimalPost {
  boost_status: string;
  declined_at: string | null;
  boosts?: { status: string; creator_payout_cents: number }[];
}
export type CreatorPostState =
  | { kind: 'paid'; payoutCents: number }
  | { kind: 'declined' }
  | { kind: 'pending' };

export function deriveCreatorPostState(post: MinimalPost): CreatorPostState {
  const transferred = post.boosts?.find((b) => b.status === 'transferred');
  if (post.boost_status === 'boosted' && transferred) {
    return { kind: 'paid', payoutCents: transferred.creator_payout_cents };
  }
  if (post.declined_at) return { kind: 'declined' };
  return { kind: 'pending' };
}
```
Run again → PASS.

- [ ] **Step 6: Filter declined posts out of the org queue**

In `src/hooks/useDragonShare.ts` `useOrgDragonSharePosts`, add `.is('declined_at', null)` to the query chain (alongside the existing `.is('flagged_at', null)`).

- [ ] **Step 7: Add the decline hook**

Create `src/hooks/useDeclineDragonSharePost.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useDeclineDragonSharePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc('decline_dragonshare_post', { p_post_id: postId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Passed. The creator has been notified kindly.');
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
    },
    onError: () => toast.error('Could not pass on this post. Please try again.'),
  });
}
```

- [ ] **Step 8: Add Boost/Pass + Download to the card**

> **Card overlap note:** builds on Tasks 4 and 5 — re-read the current `DragonSharePostCard.tsx` first; the boost-tier region now contains the Custom row (Task 4) and the preview uses `WatermarkedMedia` (Task 5).

In `DragonSharePostCard.tsx`:
- Add imports `import { useDeclineDragonSharePost } from '@/hooks/useDeclineDragonSharePost';` and `import { Download } from 'lucide-react';`. Add `const declineMutation = useDeclineDragonSharePost();`.
- **Pass** — at the end of the `canBoost` action region (after the Custom row), add a Pass button. Disable while a boost is being confirmed (`selectedTier !== null`) or while pending:
```tsx
<Button
  variant="ghost"
  size="sm"
  className="w-full rounded-full text-dc-text-muted hover:text-dc-text mt-1"
  disabled={declineMutation.isPending || selectedTier !== null}
  onClick={() => declineMutation.mutate(post.id)}
>
  Pass — not a fit right now
</Button>
```
- **Report** — keep the existing footer Report button but shrink it so Boost/Pass dominate: change its label to icon-only or `text-[10px]`, keeping the existing `flagMutation` wiring untouched.
- **Download** — in the `isAlreadyBoosted` branch (currently just the "Boosted · $X" `Badge`), wrap the badge and add a Download anchor for the clean file:
```tsx
<div className="flex items-center justify-between gap-2">
  <Badge className="bg-teal-100 text-teal-700 border-teal-200">
    Boosted · ${((post.boosts?.[0]?.amount_cents ?? 0) / 100).toFixed(0)}
  </Badge>
  {contentUrl && (
    <a
      href={contentUrl}
      download
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-dc-teal hover:text-dc-teal-dark"
    >
      <Download className="h-3.5 w-3.5" /> Download
    </a>
  )}
</div>
```

- [ ] **Step 9: Typecheck/lint/test/build, commit, push, deploy-verify**

```bash
git add supabase/migrations src/hooks/useDeclineDragonSharePost.ts \
  src/lib/dragonsharePostState.ts src/lib/dragonsharePostState.test.ts \
  src/hooks/useDragonShare.ts src/components/dragonshare/DragonSharePostCard.tsx
git commit -m "feat(dragonshare): boost-or-pass decision and post-payment download"
```
Verify prod (restaurant, both viewports): Pass removes the card from Available; boosted posts expose Download; Report still works. No console errors.

---

## Task 7: Creator notifications + card status *(Creator #4)*

**Files:**
- Modify: `src/types/notifications.ts`
- Modify: `supabase/functions/_shared/fulfill-boost.ts`
- Create: `supabase/migrations/<ts>_dragonshare_decline_notification.sql` (follow-up `CREATE OR REPLACE` adding the decline notification)
- Modify: `src/pages/CreatorDragonShare.tsx`

- [ ] **Step 1: Register the new notification type**

Read `src/types/notifications.ts`. Add `'dragonshare_declined'` to the `NotificationType` union and map it to the `content` category wherever types are categorized (mirror how `dragonshare_boost` is categorized). Do NOT add it to the email-type map (content category, in-app only). If the `push_notifications.type` column has a DB CHECK constraint, add `dragonshare_declined` to it via a small additive migration; if `type` is free-text, no DB change needed (verify live).

- [ ] **Step 2: Notify creator on boost paid**

In `supabase/functions/_shared/fulfill-boost.ts`, after the post is marked boosted (after line ~74) and before the social hook, fire a non-blocking creator notification. **Placement matters:** keep it BELOW the `alreadyDone` early-return (line 29) so the function's idempotency also prevents a duplicate notification when `fulfillBoost` re-enters from the Stripe webhook after the off-session path already fulfilled.
```ts
try {
  const { data: orgRow } = await supabase
    .from("dragonshare_boosts").select("boosting_org_id").eq("id", boostId).single();
  let orgName = "A restaurant";
  if (orgRow?.boosting_org_id) {
    const { data: org } = await supabase
      .from("organizations").select("name").eq("id", orgRow.boosting_org_id).single();
    orgName = org?.name ?? orgName;
  }
  await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      recipientId: creatorId,
      type: "dragonshare_boost",
      category: "content",
      title: "Your post got boosted! 🎉",
      body: `${orgName} boosted your content — $${(creatorPayoutCents / 100).toFixed(0)} is on the way.`,
      actionUrl: "/dashboard/creator/dragonshare",
      icon: "dollar",
      data: { post_id: postId, boost_id: boostId },
    }),
  });
} catch (e) {
  console.warn("[fulfill-boost] creator notification failed (non-blocking):", e);
}
```
(`creatorPayoutCents` is already computed earlier in the function.)

- [ ] **Step 3: Notify creator on decline (follow-up migration)**

The Task 6 migration was already applied to the live DB in Task 6 Step 2, so do **not** edit it. Create a new follow-up migration `supabase/migrations/<ts>_dragonshare_decline_notification.sql` that re-defines the function with `CREATE OR REPLACE` (full body from Task 6 plus the notification insert before `end;`):
```sql
  insert into push_notifications (user_id, type, category, title, body, action_url, icon, data, sent_at)
  values (
    v_post.creator_id,
    'dragonshare_declined',
    'content',
    'Not selected this time',
    'A restaurant passed on this post — your content''s still great. Share more and keep earning!',
    '/dashboard/creator/dragonshare',
    'default',
    jsonb_build_object('post_id', p_post_id),
    now()
  );
```
Apply the follow-up migration to the live DB via Supabase MCP and commit it.

- [ ] **Step 4: Reflect outcomes on the creator card**

In `src/pages/CreatorDragonShare.tsx` `CreatorPostCard`, compute `const state = deriveCreatorPostState(post);` (from `src/lib/dragonsharePostState.ts`) and make it the single source for the outcome display. **Remove the existing ad-hoc paid render** (the `{boost && boost.status === 'transferred' && (<span>+${...}</span>)}` block, ~line 226) so there are not two competing "paid" renders, and drive all three states from `state`:
- `paid` → green `+${(state.payoutCents / 100).toFixed(0)}` (replaces the removed block).
- `declined` → a soft, non-alarming chip: "Not selected — share again" using brand-adjacent colors (e.g. `bg-dc-pink/10 text-dc-pink-accent`), NOT red/gray. Must not read as a hard "Rejected".
- `pending` → existing "Verified" state.
Adjust the tab filters so a declined post appears under a sensible tab (keep it under "Submitted" with the soft chip, since `status` stays `'verified'`).

- [ ] **Step 5: Typecheck/lint/test/build, commit, push, deploy-verify**

```bash
git add src/types/notifications.ts supabase/functions/_shared/fulfill-boost.ts \
  supabase/migrations src/pages/CreatorDragonShare.tsx
git commit -m "feat(dragonshare): notify creator on boost paid and graceful pass, reflect card status"
```
Deploy edge function `create-notification` consumers are unchanged; redeploy `fulfill-boost`'s caller functions (the function is shared — redeploy `boost-payment` and `stripe-webhook` which import it) via Supabase MCP/CLI. Push frontend. Verify end-to-end: a boost fires a creator bell notification + "Paid" card; a Pass fires a gentle bell notification + soft card chip and removes it from the restaurant queue. No console errors, both viewports, both roles.

---

## Final verification (after all tasks)

- Full creator loop: upload → tag → persists → submit → success modal → card shows real org name → (after restaurant acts) bell + card update.
- Full restaurant loop: watermarked preview → custom or preset Boost → Download available; or Pass → removed + creator notified; connected Instagram recognized throughout.
- `npm run typecheck && npm run lint && npm run test && npm run build` all green.
- No console errors in prod on desktop and mobile for both roles.
- Update `.claude/handoffs/` if work spans sessions; consider a `docs/wiki` ingest of the session per CLAUDE.md.
