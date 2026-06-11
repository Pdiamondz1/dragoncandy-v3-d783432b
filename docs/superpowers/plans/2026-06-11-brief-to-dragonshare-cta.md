# Brief → DragonShare CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All work happens ONLY inside the worktree `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\autoresearch` — never edit the main checkout `C:\GIT\dragoncandy-v3-d783432b` directly.**

**Goal:** Add a "Make it & submit to {restaurant}" CTA on the content brief that deep-links into the DragonShare submit flow with the restaurant pre-selected (desktop + mobile), and record `dragonshare_posts.source_brief_id` to capture brief→submission conversion.

**Architecture:** Ledger-first. One nullable FK column lands first. Then thread a `sourceBriefId` from the brief card → DragonShare page (read+validate `?brief=`) → both submit forms → `useDragonShareSubmitForm` → `useSubmitDragonSharePost` insert. The page's existing `?restaurant=` pre-fill is reused; the mobile sheet's missing pre-fill is fixed along the way. `sourceBriefId` is **captured into form state** when it first arrives (mirroring how `selectedOrg` is captured) so it survives the page's URL-param cleanup.

**Tech Stack:** Supabase Postgres; React 18 + React Query + react-router-dom; TypeScript strict (the build is the gate — no new unit-testable pure logic).

**Spec:** `docs/superpowers/specs/2026-06-11-brief-to-dragonshare-cta-design.md`
**Branch:** `feat/brief-to-dragonshare-cta`. **Environments:** staging `mhffqrawgizhprbobcta` → prod `zocahiffooqdybdhguqv`.

---

## File Structure

| Path | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/20260611140000_dragonshare_source_brief.sql` | `dragonshare_posts.source_brief_id` FK + index | Create |
| `src/hooks/useDragonShare.ts` | `useSubmitDragonSharePost`: accept + insert `source_brief_id` | Modify |
| `src/hooks/useDragonShareSubmitForm.ts` | accept `sourceBriefId`, capture it, send it in the mutation | Modify |
| `src/components/dragonshare/DragonShareInlineForm.tsx` | accept `sourceBriefId` prop → hook | Modify |
| `src/components/dragonshare/DragonShareSubmitSheet.tsx` | accept `preselectedOrg` + `sourceBriefId` (mobile plumbing) | Modify |
| `src/pages/CreatorDragonShare.tsx` | read+validate `?brief=`, pass org + `sourceBriefId` to both forms | Modify |
| `src/components/donny/ContentIdeaCard.tsx` | the CTA + `useNavigate` | Modify |

---

## Task 1: `dragonshare_posts.source_brief_id` migration (ledger-first)

**Files:** Create `supabase/migrations/20260611140000_dragonshare_source_brief.sql`

- [ ] **Step 1: Write the migration**
```sql
-- Link a DragonShare submission back to the content brief that prompted it (Phase B Slice 2).
-- Nullable: most submissions don't originate from a brief. on delete set null: deleting a brief
-- never blocks/destroys a post.
alter table public.dragonshare_posts
  add column if not exists source_brief_id uuid references public.content_briefs(id) on delete set null;

create index if not exists idx_dragonshare_posts_source_brief
  on public.dragonshare_posts (source_brief_id);
```

- [ ] **Step 2: Apply to STAGING + verify** — MCP `execute_sql` (project `mhffqrawgizhprbobcta`), then:
```sql
select column_name, data_type from information_schema.columns
where table_name='dragonshare_posts' and column_name='source_brief_id';
```
Expected: one row, `uuid`.

- [ ] **Step 3: Advisors** — MCP `get_advisors` (security) on staging; confirm no new findings for `dragonshare_posts` (additive nullable column on an already-RLS'd table — none expected).

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260611140000_dragonshare_source_brief.sql
git commit -m "feat(db): dragonshare_posts.source_brief_id (Phase B Slice 2 brief->submission link)"
```

---

## Task 2: Thread `source_brief_id` through the submit hooks

**Files:** Modify `src/hooks/useDragonShare.ts`, `src/hooks/useDragonShareSubmitForm.ts`

- [ ] **Step 1: `useSubmitDragonSharePost` — accept + insert the field** (`src/hooks/useDragonShare.ts`)

In the mutation arg type (the object after `mutationFn: async (post: {`), add the field:
```ts
      source_brief_id?: string | null;
```
(place it alongside `content_file_path?`, `caption?`, etc.)

In the `.insert({ ... })` object, add after `content_file_path: post.content_file_path ?? null,`:
```ts
          source_brief_id: post.source_brief_id ?? null,
```

- [ ] **Step 2: `useDragonShareSubmitForm` — accept, capture, send** (`src/hooks/useDragonShareSubmitForm.ts`)

Change the signature:
```ts
export function useDragonShareSubmitForm(sourceBriefId?: string | null) {
```

Add capture state near the other `useState` declarations (after `submittedOrgName`):
```ts
  // Capture the originating brief id when it first arrives — it must survive the
  // page clearing the ?brief= URL param (same reason selectedOrg is captured).
  const [capturedBriefId, setCapturedBriefId] = useState<string | null>(null);
  useEffect(() => {
    if (sourceBriefId) setCapturedBriefId(sourceBriefId);
  }, [sourceBriefId]);
```

In `handleSubmit`, add `source_brief_id` to the `mutateAsync` payload:
```ts
      await submitMutation.mutateAsync({
        target_org_id: selectedOrg.id,
        content_type: contentType ?? 'photo',
        post_url: postUrl.trim() || null,
        platform: detectedPlatform,
        content_file_path: uploadedUrl,
        source_brief_id: capturedBriefId,
      });
```

In `reset()`, also clear it (so a later un-prompted submission isn't mis-attributed):
```ts
    setCapturedBriefId(null);
```

- [ ] **Step 3: Build** — `npm run build` → green (TS strict).

- [ ] **Step 4: Commit**
```bash
git add src/hooks/useDragonShare.ts src/hooks/useDragonShareSubmitForm.ts
git commit -m "feat(dragonshare): thread source_brief_id through submit hooks"
```

---

## Task 3: Form components accept `sourceBriefId` + fix mobile pre-fill

**Files:** Modify `src/components/dragonshare/DragonShareInlineForm.tsx`, `DragonShareSubmitSheet.tsx`

- [ ] **Step 1: `DragonShareInlineForm` — pass `sourceBriefId` to the hook**

Extend `Props` and the hook call:
```ts
interface Props {
  preselectedOrg?: RestaurantSearchResult | null;
  sourceBriefId?: string | null;
}

export function DragonShareInlineForm({ preselectedOrg, sourceBriefId }: Props) {
  const form = useDragonShareSubmitForm(sourceBriefId);
```
(The existing `preselectedOrg` `useEffect` is unchanged.)

- [ ] **Step 2: `DragonShareSubmitSheet` — add the missing pre-fill (mobile) + `sourceBriefId`**

Add `useEffect` to the React import:
```ts
import { useState, useEffect } from 'react';
```
Add the type import (alongside the existing imports):
```ts
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';
```
Extend `Props` and consume both new props (mirroring the inline form):
```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedOrg?: RestaurantSearchResult | null;
  sourceBriefId?: string | null;
}

export function DragonShareSubmitSheet({ open, onOpenChange, preselectedOrg, sourceBriefId }: Props) {
  const form = useDragonShareSubmitForm(sourceBriefId);
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);

  useEffect(() => {
    if (preselectedOrg && !form.selectedOrg) {
      form.setSelectedOrg(preselectedOrg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedOrg]);
```
(Rest of the component unchanged.)

- [ ] **Step 3: Build** — `npm run build` → green.

- [ ] **Step 4: Commit**
```bash
git add src/components/dragonshare/DragonShareInlineForm.tsx src/components/dragonshare/DragonShareSubmitSheet.tsx
git commit -m "feat(dragonshare): forms accept sourceBriefId; fix mobile sheet restaurant pre-fill"
```

---

## Task 4: Page reads/validates `?brief=`; the CTA

**Files:** Modify `src/pages/CreatorDragonShare.tsx`, `src/components/donny/ContentIdeaCard.tsx`

- [ ] **Step 1: `usePreselectedOrg` — also read + validate `?brief=`** (`src/pages/CreatorDragonShare.tsx`)

Replace the `usePreselectedOrg` function with:
```ts
function usePreselectedOrg() {
  const [searchParams, setSearchParams] = useSearchParams();
  const restaurantId = searchParams.get('restaurant');
  // Capture once so it survives the param cleanup below.
  const [briefId] = useState(() => searchParams.get('brief'));

  const { data: org } = useQuery({
    queryKey: ['preselected-org', restaurantId],
    queryFn: async (): Promise<RestaurantSearchResult | null> => {
      if (!restaurantId) return null;
      const { data, error } = await supabase.rpc('get_restaurant_by_org_id', {
        target_org_id: restaurantId,
      });
      if (error || !data || data.length === 0) return null;
      return data[0] as RestaurantSearchResult;
    },
    enabled: !!restaurantId,
  });

  // Validate the brief is the creator's own (RLS) AND targets the same org.
  const { data: briefOrgId } = useQuery({
    queryKey: ['preselected-brief', briefId],
    queryFn: async (): Promise<string | null> => {
      if (!briefId) return null;
      const { data, error } = await supabase
        .from('content_briefs')
        .select('organization_id')
        .eq('id', briefId)
        .maybeSingle();
      if (error || !data) return null;
      return data.organization_id as string;
    },
    enabled: !!briefId,
  });

  const sourceBriefId = briefId && org && briefOrgId === org.id ? briefId : null;

  useEffect(() => {
    if (restaurantId && org) {
      const next = new URLSearchParams(searchParams);
      next.delete('restaurant');
      next.delete('brief');
      setSearchParams(next, { replace: true });
    }
  }, [org, restaurantId, searchParams, setSearchParams]);

  return { org: org ?? null, sourceBriefId };
}
```
Add `useState` to the existing `react` import if not already present (it is: `import { useState, useEffect } from 'react';`).

- [ ] **Step 2: Consume the new return shape + pass to both forms**

Where the page calls it, change:
```ts
  const preselectedOrg = usePreselectedOrg();
```
to:
```ts
  const { org: preselectedOrg, sourceBriefId } = usePreselectedOrg();
```
Pass to the desktop form:
```tsx
<DragonShareInlineForm preselectedOrg={preselectedOrg} sourceBriefId={sourceBriefId} />
```
And the mobile sheet:
```tsx
<DragonShareSubmitSheet open={submitOpen} onOpenChange={setSubmitOpen} preselectedOrg={preselectedOrg} sourceBriefId={sourceBriefId} />
```
(The existing `useEffect([preselectedOrg])` that auto-opens the mobile sheet still works — `preselectedOrg` is now the destructured `org`.)

- [ ] **Step 3: The CTA** (`src/components/donny/ContentIdeaCard.tsx`)

Add the import:
```ts
import { useNavigate } from 'react-router-dom';
```
In `ContentIdeaCard`, add `const navigate = useNavigate();` near the other hooks. Then, after the `{data && <BriefView ... />}` line, add the CTA (both `org` and `data` are in scope here):
```tsx
      {data?.brief_id && org && (
        <Button
          onClick={() => navigate(`/dashboard/creator/dragonshare?restaurant=${org.id}&brief=${data.brief_id}`)}
          className="mt-4 w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold"
        >
          Make it &amp; submit to {org.name}
        </Button>
      )}
```

- [ ] **Step 4: Build** — `npm run build` → green.

- [ ] **Step 5: Commit**
```bash
git add src/pages/CreatorDragonShare.tsx src/components/donny/ContentIdeaCard.tsx
git commit -m "feat(recommender): 'Make it & submit' CTA + DragonShare ?brief= validation"
```

---

## Task 5: End-to-end verification & deploy (staging → prod)

**Files:** none — verification. (Frontend deploys via Lovable on merge; only the migration needs MCP apply to prod.)

- [ ] **Step 1: Build hygiene** — `npm run build` green; `npm run lint` clean for the touched files.

- [ ] **Step 2: Staging migration** — confirm Task 1 applied to staging (column exists).

- [ ] **Step 3: Manual flow (staging preview or local `npm run dev` against prod data is unreliable — prefer the staging preview build).** As a creator:
  - Generate a brief (Slice 1) → tap **"Make it & submit to {restaurant}"**.
  - **Desktop:** the DragonShare inline form shows the restaurant chip pre-selected.
  - **Mobile (viewport < 1024px):** the sheet auto-opens AND the restaurant chip is pre-selected (the newly fixed plumbing — verify the chip, not just that the sheet opened).
  - Upload content (or paste a link) → Submit.

- [ ] **Step 4: Verify the link** — MCP `execute_sql` (staging):
```sql
select id, creator_id, target_org_id, source_brief_id, submitted_at
from dragonshare_posts order by submitted_at desc limit 3;
```
Expected: the new row has `source_brief_id` = the brief's id. Then the conversion query:
```sql
select count(distinct source_brief_id) filter (where source_brief_id is not null) as briefs_converted,
       (select count(*) from content_briefs) as total_briefs
from dragonshare_posts;
```

- [ ] **Step 5: Defensive + regression checks (staging).**
  - Navigate with a `?brief=<id>` whose `organization_id` ≠ `?restaurant=` (or a foreign id) → confirm `source_brief_id` is NOT set on the resulting submission (restaurant still pre-fills).
  - A normal DragonShare submission (open the sheet via "+ Share Content", no brief) still works → `source_brief_id` is null.

- [ ] **Step 6: Promote to PROD.** Apply `20260611140000_dragonshare_source_brief.sql` to prod via MCP `execute_sql`; verify the column. (Frontend ships when the PR merges → Lovable redeploys.)

- [ ] **Step 7: Push + PR.** `git push -u origin feat/brief-to-dragonshare-cta`; open a PR (no auto-merge — human ship gate). Note in the PR that the frontend appears in prod after merge + Lovable redeploy.

- [ ] **Step 8: Prod smoke** (after merge + redeploy): one brief → CTA → submit → confirm a prod `dragonshare_posts` row with `source_brief_id` set.

---

## Definition of Done
- `dragonshare_posts.source_brief_id` exists in staging + prod (nullable FK + index).
- CTA on the brief deep-links with `restaurant` + `brief`; renders only when `brief_id` present.
- Restaurant pre-fills on **desktop and mobile** (mobile sheet plumbing fixed).
- A brief-originated submission stores `source_brief_id`; a normal one stores null; a mismatched/foreign `?brief=` stores null.
- `npm run build` green; no `lg:` desktop regressions; both viewports tested.
- No auth/RLS/schema-drop changes; caption pre-fill + the performance loop remain deferred.

## Post-merge
- Refresh local main (worktree workflow). Stray-untracked-file collisions: move aside, re-run `git merge --ff-only origin/main`.
- Next-next slice: caption field + caption pre-fill; and the performance half (`dragonshare_posts` ↔ `social_post_log` ↔ `content_performance`).
