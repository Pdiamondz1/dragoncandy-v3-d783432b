# Brief → DragonShare "Make it & submit" CTA + brief→submission link (Content Engine Phase B, Slice 2) — Design Spec

**Date:** 2026-06-11
**Status:** Approved Design
**Approach:** Turn the brief from a dead-end into a one-tap action; record the brief→submission conversion
**Phase:** Content Engine Phase B, Slice 2 (acts on the Slice 1 brief)
**Prerequisites:** Slice 1 shipped (`content_briefs` + `content-strategy-recommend` + `ContentIdeaCard`, live in prod); the DragonShare creator submit flow with its existing `?restaurant=<orgId>` pre-fill.

---

## Overview

Slice 1 generates a great content brief but leaves the creator nowhere to go. Slice 2 adds the **next action**:
a **"Make it & submit to {restaurant}"** CTA on the brief that deep-links into the existing **DragonShare
submit flow** with the restaurant **and the brief's caption pre-filled**, and records **which brief produced
which submission**. This converts the brief into the front door of DragonShare (where the restaurant boosts
the content — the 80/20 monetization path) and captures the **brief→action conversion** — the first half of
closing the self-improving loop, with near-zero new surface area (the pre-fill mechanism already exists).

**What this deletes:** the brief dead-end, and re-typing the restaurant + caption in the submit form.
**What this simplifies:** create→submit collapses to one tap from the brief.
**What it automates:** the brief→submission link (`source_brief_id`), making "did creators act on briefs?" queryable.
**Keystrokes removed:** from "navigate to DragonShare, search the restaurant, write a caption" to **one tap** (the CTA) — restaurant + caption arrive filled in.

---

## Decisions (brainstorm, 2026-06-11)

| Decision | Choice |
|----------|--------|
| Loop depth | **CTA + brief→submission link.** Record that a brief led to a DragonShare submission. The *performance* half (submission → `social_post_log` → `content_performance`) is **deferred** (the next-next slice). |
| Caption pre-fill | **In.** Pre-fill the submit form's caption with the brief's `sample_caption` (only if the field is empty). North-Star: near-zero typing. |
| Where the link lives | **`dragonshare_posts.source_brief_id`** (FK → `content_briefs`). The submission is the natural single write moment, and we know the `briefId` then. (`content_briefs.social_post_log_id` stays reserved for the deferred performance link.) |
| Canonical key | **`organization_id`** end to end (`content_briefs.organization_id` = `dragonshare_posts.target_org_id` = the id `RestaurantTypeahead`/`search_restaurants` returns). |

---

## Architecture

```
ContentIdeaCard (brief shown)
  → CTA "Make it & submit to {businessName}"
  → navigate(`/dashboard/creator/dragonshare?restaurant=<orgId>&brief=<briefId>`)
        │
        ▼
CreatorDragonShare page
  - usePreselectedOrg() already resolves ?restaurant=<orgId> → preselectedOrg (auto-selects the restaurant)
  - NEW: read ?brief=<briefId> → fetch that content_briefs row (RLS read-own) →
         (a) defensive check: brief.organization_id === resolved org id
         (b) thread sourceBriefId + brief.sample_caption into the submit form
        │
        ▼
DragonShareInlineForm / DragonShareSubmitSheet (existing)
  - restaurant pre-selected (existing behavior)
  - NEW: caption pre-filled from sample_caption IF the caption field is empty (don't clobber edits)
  - NEW: carries sourceBriefId into the submit mutation
        │
        ▼
useSubmitDragonSharePost (existing mutation)
  - NEW: include source_brief_id in the dragonshare_posts insert
        ▼
dragonshare_posts row { ..., target_org_id, source_brief_id }  ← brief→submission link recorded
```

### Deliverables

| # | Deliverable | Type |
|---|-------------|------|
| C1 | `dragonshare_posts.source_brief_id` column (FK → `content_briefs`, nullable) | DB migration (ledger-first) |
| C2 | CTA on the brief card → deep-link with `restaurant` + `brief` params | Frontend (`ContentIdeaCard`) |
| C3 | `CreatorDragonShare` reads `?brief=`, fetches the brief, threads `sourceBriefId` + caption pre-fill | Frontend |
| C4 | Submit form + mutation carry `source_brief_id`; caption pre-fill (empty-only) | Frontend |

---

## C1 — `dragonshare_posts.source_brief_id` (ledger-first)

```sql
alter table public.dragonshare_posts
  add column if not exists source_brief_id uuid references public.content_briefs(id) on delete set null;

create index if not exists idx_dragonshare_posts_source_brief
  on public.dragonshare_posts (source_brief_id);
```

- Nullable (most DragonShare submissions won't originate from a brief). `on delete set null` so deleting a
  brief never blocks/destroys a post. No RLS change: `dragonshare_posts` insert policy is already
  creator-scoped; this is one nullable column the creator sets on their own insert.
- **Conversion query** this enables:
  `select count(distinct source_brief_id) from dragonshare_posts where source_brief_id is not null` ÷
  `count(*) from content_briefs` → brief→submission conversion.

---

## C2 — CTA on the brief card

In `ContentIdeaCard`'s `BriefView` (which already has the selected `org` and the response `brief_id`), add a
primary CTA below the rationale:

- Label: **"Make it & submit to {org.name}"** (teal pill, design-system compliant; `lg:` desktop / base mobile).
- Action: `navigate(\`/dashboard/creator/dragonshare?restaurant=${org.id}&brief=${data.brief_id}\`)` via
  `useNavigate()` (react-router). Only render when `data.brief_id` is present.
- Secondary affordance unchanged (the existing copy buttons).

---

## C3 — `CreatorDragonShare` reads the brief

`CreatorDragonShare.tsx` already has `usePreselectedOrg()` reading `?restaurant=` and passing `preselectedOrg`
to the form. Extend:

1. Read `?brief=<briefId>` from the URL (same place `?restaurant=` is parsed; consume/clean it like the
   existing param).
2. Fetch the brief: `select organization_id, brief from content_briefs where id = :briefId` (React Query;
   RLS already restricts to the creator's own briefs — a non-owner/garbage id simply returns nothing →
   graceful no-op).
3. **Defensive check:** only use the brief if `brief.organization_id === <resolved preselected org id>`
   (guards against a mismatched/hand-edited URL). On mismatch, ignore the brief silently (restaurant pre-fill
   still works).
4. Thread two values into the submit form: `sourceBriefId` (the id) and `prefillCaption =
   brief.brief.sample_caption`.

`brief` is a JSONB column; `sample_caption` is `brief->>'sample_caption'`.

---

## C4 — Submit form + mutation

- **`DragonShareInlineForm` / `DragonShareSubmitSheet`** (and `useDragonShareSubmitForm`): accept optional
  `sourceBriefId?: string` and `prefillCaption?: string`. On mount, if `prefillCaption` is set **and the
  caption field is currently empty**, set it (never overwrite a caption the creator has already typed/edited).
- **`useSubmitDragonSharePost`** (in `useDragonShare.ts`): add `source_brief_id` to the `dragonshare_posts`
  insert payload (passed through from the form). When absent (normal DragonShare submissions), it's `null`.

No change to the rest of the submit flow (upload, platform detection, boost-or-pass, notify) — `source_brief_id`
rides along as one extra nullable field.

---

## Reuse / guardrails

- **Reuse:** the entire DragonShare submit flow + its existing `?restaurant=` pre-fill (`usePreselectedOrg`,
  `DragonShareInlineForm` `preselectedOrg`), `RestaurantTypeahead`, `useSubmitDragonSharePost`, React Query,
  `useNavigate`.
- **Ledger-first:** C1 migration lands and is reviewed before the mutation writes `source_brief_id`.
- **RLS-safe:** no policy changes; the creator reads their own brief and inserts their own post.
- **Design system:** `dc-*` tokens, pill CTA, teal/pink, **no gray**; desktop `lg:`/`xl:`, mobile base; test both.
- **No auth/schema drops.** One nullable additive column.

---

## Explicitly deferred (the next-next slice)

- **The performance half of the loop:** bridging `dragonshare_posts` → `social_post_log` →
  `content_performance` so the brief links to the *engagement* its content earned (and
  `content_briefs.social_post_log_id` gets populated). This needs a new correlation column (e.g.
  `social_post_log.dragonshare_post_id`) wired into the Outstand-publish path, and depends on a boost +
  publish actually happening — a meatier, separate effort.
- Restaurant-side / aggregate brief analytics surfaces.

---

## Verification

Staging-first (`mhffqrawgizhprbobcta`):
1. Apply C1; run `get_advisors`.
2. As a creator: generate a brief (Slice 1) → tap **"Make it & submit"** → confirm DragonShare opens with the
   **restaurant pre-selected** and the **caption pre-filled** from the brief.
3. Submit → confirm the new `dragonshare_posts` row has `source_brief_id` = the brief's id.
4. Caption-guard: pre-fill, then edit the caption, re-open — confirm the edit isn't clobbered (empty-only fill).
5. Defensive check: a `?brief=` whose `organization_id` ≠ `?restaurant=` is ignored (restaurant still pre-fills).
6. Desktop + mobile (mobile sheet auto-opens on pre-select).
7. `npm run build` green; then promote to prod and smoke-test one brief→submit.

---

## See also

- `docs/superpowers/specs/2026-06-10-creator-content-brief-recommender-design.md` — Slice 1 (the brief).
- `docs/wiki/concepts/self-improving-app.md` — the loop this advances.
- `supabase/migrations/20260427000000_dragonshare.sql` — `dragonshare_posts` (`target_org_id`).
- `src/pages/CreatorDragonShare.tsx` — `usePreselectedOrg` (the existing `?restaurant=` pre-fill).
- `src/hooks/useDragonShare.ts` — `useSubmitDragonSharePost` (the insert).
