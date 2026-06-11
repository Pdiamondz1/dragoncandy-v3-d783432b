# Brief → DragonShare "Make it & submit" CTA + brief→submission link (Content Engine Phase B, Slice 2) — Design Spec

**Date:** 2026-06-11
**Status:** Approved Design
**Approach:** Turn the brief from a dead-end into a one-tap action; record the brief→submission conversion
**Phase:** Content Engine Phase B, Slice 2 (acts on the Slice 1 brief)
**Prerequisites:** Slice 1 shipped (`content_briefs` + `content-strategy-recommend` + `ContentIdeaCard`, live in prod); the DragonShare creator submit flow with its existing `?restaurant=<orgId>` pre-fill (desktop).

---

## Overview

Slice 1 generates a great content brief but leaves the creator nowhere to go. Slice 2 adds the **next
action**: a **"Make it & submit to {restaurant}"** CTA on the brief that deep-links into the existing
**DragonShare submit flow** with the restaurant **pre-selected**, and records **which brief produced which
submission**. This converts the brief into the front door of DragonShare (where the restaurant boosts the
content — the 80/20 monetization path) and captures the **brief→action conversion** — the first half of
closing the self-improving loop, with minimal new surface area.

**What this deletes:** the brief dead-end, and re-finding the restaurant in the submit flow.
**What this simplifies:** create→submit collapses to one tap from the brief.
**What it automates:** the brief→submission link (`source_brief_id`), making "did creators act on briefs?" queryable.
**Keystrokes removed:** from "navigate to DragonShare and search for the restaurant" to **one tap** — the restaurant arrives pre-selected (on both desktop and mobile, the latter newly fixed).

---

## Decisions (brainstorm, 2026-06-11)

| Decision | Choice |
|----------|--------|
| Loop depth | **CTA + brief→submission link.** Record that a brief led to a DragonShare submission. The *performance* half (submission → `social_post_log` → `content_performance`) is **deferred** (the next-next slice). |
| Caption pre-fill | **Deferred.** The DragonShare submit form has **no caption field** today (deliberate upload-first single-screen flow); adding one is a product change to *every* submission, beyond this slice. Caption pre-fill lands when/if a caption field is added. |
| Mobile pre-fill | **Fix in this slice.** Today only the **desktop** inline form receives `preselectedOrg`; the **mobile** `DragonShareSubmitSheet` opens but does **not** pre-select the restaurant. Slice 2 wires the org (and `sourceBriefId`) through the sheet so pre-fill works on both. |
| Where the link lives | **`dragonshare_posts.source_brief_id`** (FK → `content_briefs`). The submission is the natural single write moment, and the `briefId` is in the URL then. (`content_briefs.social_post_log_id` stays reserved for the deferred performance link.) |
| Canonical key | **`organization_id`** end to end (`content_briefs.organization_id` = `dragonshare_posts.target_org_id` = the id `RestaurantTypeahead`/`search_restaurants` returns). |

---

## Architecture

```
ContentIdeaCard (brief shown; has selected `org` + response `brief_id`)
  → CTA "Make it & submit to {org.name}"  (rendered only when brief_id is present)
  → useNavigate() → `/dashboard/creator/dragonshare?restaurant=<orgId>&brief=<briefId>`
        │
        ▼
CreatorDragonShare page
  - usePreselectedOrg() already resolves ?restaurant=<orgId> → preselectedOrg (via get_restaurant_by_org_id RPC)
  - NEW: read ?brief=<briefId> (same useSearchParams spot); fetch that content_briefs row (RLS read-own)
         → use it ONLY to validate: it exists (creator's own) AND brief.organization_id === resolved org id
         → derive sourceBriefId (else null/ignored)
  - pass preselectedOrg + sourceBriefId down to BOTH the desktop inline form AND the mobile sheet (props)
        │
        ▼
DragonShareInlineForm (desktop)            DragonShareSubmitSheet (mobile) — NEW: accept + forward the props
  - each consumes preselectedOrg via the existing useEffect → form.setSelectedOrg(preselectedOrg)
  - NEW: each forwards sourceBriefId into the submit call
        │
        ▼
useDragonShareSubmitForm.handleSubmit → useSubmitDragonSharePost (existing mutation)
  - NEW: include source_brief_id in the dragonshare_posts insert payload (null for normal submissions)
        ▼
dragonshare_posts row { ..., target_org_id, source_brief_id }   ← brief→submission link recorded
```

### Deliverables

| # | Deliverable | Type |
|---|-------------|------|
| C1 | `dragonshare_posts.source_brief_id` column (FK → `content_briefs`, nullable) + index | DB migration (ledger-first) |
| C2 | CTA on the brief card (`ContentIdeaCard`) → deep-link with `restaurant` + `brief` params | Frontend |
| C3 | `CreatorDragonShare`: read `?brief=`, validate the brief, derive `sourceBriefId`; pass org + `sourceBriefId` to **both** forms | Frontend |
| C4 | `DragonShareSubmitSheet` accepts `preselectedOrg` + `sourceBriefId` (mobile plumbing); both forms forward `sourceBriefId`; mutation + `useSubmitDragonSharePost` insert `source_brief_id` | Frontend |

---

## C1 — `dragonshare_posts.source_brief_id` (ledger-first)

```sql
alter table public.dragonshare_posts
  add column if not exists source_brief_id uuid references public.content_briefs(id) on delete set null;

create index if not exists idx_dragonshare_posts_source_brief
  on public.dragonshare_posts (source_brief_id);
```

- Nullable (most submissions won't originate from a brief). `on delete set null` so deleting a brief never
  blocks/destroys a post. No RLS change: `dragonshare_posts` insert is already creator-scoped; this is one
  nullable column the creator sets on their own insert.
- **Conversion query** this enables:
  `select count(distinct source_brief_id) from dragonshare_posts where source_brief_id is not null` relative to
  `count(*) from content_briefs` → brief→submission conversion.

---

## C2 — CTA on the brief card

In `ContentIdeaCard`'s `BriefView` (which already has the selected `org` with `.id`/`.name`, and the response
`data.brief_id`), add a primary CTA below the rationale:

- Label: **"Make it & submit to {org.name}"** (teal pill, design-system; `lg:` desktop / base mobile).
- Action: `useNavigate()` (add the `react-router-dom` import) →
  `navigate(\`/dashboard/creator/dragonshare?restaurant=${org.id}&brief=${data.brief_id}\`)`.
- **Render only when `data.brief_id` is present.** If null (rare — persist failed but the brief still
  returned), the CTA is simply absent; the copy buttons still work (graceful degrade).

---

## C3 — `CreatorDragonShare` reads + validates the brief

`CreatorDragonShare.tsx` already has `usePreselectedOrg()` reading `?restaurant=` (resolving via the
`get_restaurant_by_org_id` RPC and deleting the param after). Extend, in the same `useSearchParams` spot:

1. Read `?brief=<briefId>`; consume/clean it like `?restaurant=`.
2. Fetch the brief (React Query): `select organization_id from content_briefs where id = :briefId`. RLS
   already restricts to the creator's own briefs, so a non-owner/garbage id returns nothing → no link
   (graceful).
3. **Derive `sourceBriefId`:** use `briefId` **only if** the row exists **and**
   `organization_id === <resolved preselected org id>` (guards a stale/hand-edited URL). Otherwise leave it
   null — the restaurant pre-fill still works.
4. Pass `preselectedOrg` and `sourceBriefId` to **both** the desktop inline form and the mobile sheet.

(We fetch only to validate ownership + org-match — there is no caption to read this slice.)

---

## C4 — Form plumbing + the insert

- **`DragonShareSubmitSheet` (mobile) — new props.** Today it takes only `{ open, onOpenChange }` and is
  rendered without an org, so the restaurant is **not** pre-selected on mobile. Add `preselectedOrg?` (forward
  it into the same `useEffect`→`form.setSelectedOrg` consumption the inline form uses) and `sourceBriefId?`.
- **`DragonShareInlineForm` (desktop)** already consumes `preselectedOrg`; add `sourceBriefId?` passthrough.
- **Threading mechanism (concrete):** the page passes values as **props**; each form component consumes them
  via a `useEffect` (mirroring how `preselectedOrg` is already consumed) — the page does **not** reach into
  the hook's state. `sourceBriefId` is held alongside the form's submit inputs and included in the submit call.
- **`useDragonShareSubmitForm` / `useSubmitDragonSharePost`** (`src/hooks/useDragonShare.ts`): add
  `source_brief_id?: string | null` to the submit arg type and include `source_brief_id: <value> ?? null` in
  the `dragonshare_posts` insert object literal. One additive field; absent → null for normal submissions.

No change to the rest of the flow (upload, platform detection, boost-or-pass, notify, the `sessionStorage`
draft) — `source_brief_id` rides along as one nullable field.

---

## Reuse / guardrails

- **Reuse:** the DragonShare submit flow + its `?restaurant=` desktop pre-fill (`usePreselectedOrg`,
  `DragonShareInlineForm` `preselectedOrg` consumption), `RestaurantTypeahead`, `useSubmitDragonSharePost`,
  React Query, `useNavigate`.
- **Ledger-first:** C1 migration lands + reviewed before the mutation writes `source_brief_id`.
- **RLS-safe:** no policy changes; the creator reads their own brief and inserts their own post. The FK
  guarantees `source_brief_id` references a real brief; the C3 ownership+org validation keeps it meaningful.
- **Design system:** `dc-*` tokens, pill CTA, teal/pink, **no gray**; desktop `lg:`/`xl:`, mobile base; test both.
- **No auth/schema drops.** One nullable additive column.

---

## Explicitly deferred (the next-next slice)

- **Caption pre-fill** — requires first adding a caption field to the DragonShare upload-first submit form (a
  product change affecting all submissions); deferred so this slice stays minimal.
- **The performance half of the loop:** bridging `dragonshare_posts` → `social_post_log` →
  `content_performance` so the brief links to the *engagement* its content earned (and
  `content_briefs.social_post_log_id` gets populated). Needs a new correlation column (e.g.
  `social_post_log.dragonshare_post_id`) wired into the Outstand-publish path, and depends on a boost +
  publish actually happening.
- Restaurant-side / aggregate brief analytics surfaces.

---

## Verification

Staging-first (`mhffqrawgizhprbobcta`):
1. Apply C1; run `get_advisors`.
2. As a creator: generate a brief (Slice 1) → tap **"Make it & submit"** → confirm DragonShare opens with the
   **restaurant pre-selected** — on **desktop (inline form)** and **mobile (sheet)** (the mobile case is newly
   fixed; verify the restaurant chip actually shows, not just that the sheet opens).
3. Submit → confirm the new `dragonshare_posts` row has `source_brief_id` = the brief's id.
4. Run the brief→submission conversion query (C1) and see the count reflect the submission.
5. Defensive check: a `?brief=` whose `organization_id` ≠ `?restaurant=` (or a foreign/garbage id) → no link
   stored, restaurant still pre-fills.
6. Regression: a normal DragonShare submission (no `?brief=`) still works and stores `source_brief_id = null`.
7. `npm run build` green; then promote to prod and smoke-test one brief→submit.

---

## See also

- `docs/superpowers/specs/2026-06-10-creator-content-brief-recommender-design.md` — Slice 1 (the brief).
- `docs/wiki/concepts/self-improving-app.md` — the loop this advances.
- `supabase/migrations/20260427000000_dragonshare.sql` — `dragonshare_posts` (`target_org_id`, `creator_id`).
- `src/pages/CreatorDragonShare.tsx` — `usePreselectedOrg` (the existing desktop `?restaurant=` pre-fill).
- `src/hooks/useDragonShare.ts` — `useSubmitDragonSharePost` (the insert).
- `src/components/dragonshare/{DragonShareInlineForm,DragonShareSubmitSheet}.tsx` — the two submit surfaces.
