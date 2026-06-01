# DragonShare Submit → Review → Pay Flow Fixes

**Date:** 2026-06-01
**Status:** Draft

## Problem Statement

DragonShare is DragonCandy's amplification engine: a content creator uploads
organic content (photo/video) and submits it to a specific restaurant/brand,
who can then pay ("boost") to cross-post it across connected social channels.
Payment runs through Stripe Connect with an 80/20 creator/platform split.

Live testing against `dragoncandy.io` (creator `damewillie@gmail.com`,
restaurant `dwilliams@harbormill.net` / "Harbormill") surfaced eight defects
that break the core submit → review → pay loop on both sides. This spec covers
fixing all eight as one coherent body of work, implemented as sequential tasks.

### Defects observed

**Creator side**
1. Uploading content first, then tagging the restaurant, causes the uploaded
   content to disappear — the creator must re-upload.
2. A submitted post displays "Unknown org" even though it was correctly sent to
   Harbormill; the creator should see the real restaurant name.
3. After a successful submission nothing confirms it — the form sits unchanged,
   with no clear "done" or way to start a new DragonShare.
4. There is no place for the creator to learn whether the restaurant approved &
   paid, or gracefully declined. Rejections must not discourage the creator from
   submitting again.

**Restaurant/Brand side**
1. Received content is fully visible with no protection. It should be viewable
   but watermarked (like a campaign preview) before the business decides to pay.
2. There is no explicit pay-or-reject decision. The business can only "Report"
   (an abuse flag). They need to either pay (then post/download) or decline
   without paying; a declined post leaves their queue and is not shown again
   unless the creator re-submits it.
3. Boost amounts are limited to fixed chips ($25/$50/$100/$250). The business
   should be able to enter a specific custom amount.
4. When the business already has a social account connected (Instagram in the
   test case), DragonShare shows "Connect social accounts" instead of
   recognizing the existing connection.

## Root Cause Analysis

Findings from reading the current implementation:

- **Creator #1 (upload disappears):** Mobile-specific. The mobile submit sheet
  (`src/components/dragonshare/DragonShareSubmitSheet.tsx`, the `Sheet`
  `onOpenChange` handler) calls `form.reset()` on *every* close. Radix `Sheet`
  treats interact-outside events (mobile keyboard open, focus shift, or scroll
  while using the restaurant typeahead) as a close, which fires the reset and
  wipes the in-progress upload. The desktop inline form
  (`src/components/dragonshare/DragonShareInlineForm.tsx`) holds the same form
  state but never resets on interaction, so it is expected to be stable. Both
  viewports must be verified live.

- **Creator #2 ("Unknown org"):** The post is correctly linked — `target_org_id`
  holds a valid `organizations.id` (the insert has an FK to `organizations`, so
  it could not have succeeded otherwise). The creator's post query
  (`src/hooks/useDragonShare.ts`, `useCreatorDragonSharePosts`) joins
  `target_org:organizations(id, name, logo_url)`. RLS on `organizations` only
  permits *active members* of an org to read its row
  (policy `org_select_active_members`). The creator is not a member of the
  restaurant's org, so the embedded join returns null and the card renders the
  `'Unknown org'` fallback (`src/pages/CreatorDragonShare.tsx`). A column-safe
  public read path is required.

- **Restaurant #4 (social not recognized):** ID-family mismatch. Connected
  social accounts are stored in `business_outstand_accounts` keyed by
  `business_id = business_profiles.id`. The amplification hook
  (`src/hooks/useAmplificationPreview.ts`) queries
  `business_outstand_accounts.business_id = orgId`, where `orgId` is an
  `organizations.id`. These never match, so the query is always empty and the UI
  shows "Connect social accounts." A mapping `organizations.id` →
  owner's `business_profiles.id` → accounts is required.

- **Restaurant #3 (custom amount):** Backend already supports it. `create_boost()`
  (in the DragonShare migration) and the `boost-payment` edge function both
  accept a `'custom'` tier with an amount clamped to $5–$500. The presets are
  hardcoded in `src/types/dragonshare.ts` (`BOOST_TIERS`); only a custom-amount
  UI is missing.

- **Missing flows:** Watermarked preview, the explicit pay/pass decision,
  post-payment download, the submit confirmation, and any creator notifications
  do not currently exist and must be built.

### Backend/deploy constraints

- Lovable auto-deploys **frontend only** on push to `main`. All SQL (RLS,
  RPCs, migrations) and edge-function changes must be applied to the live
  Supabase project separately (Supabase MCP/CLI) **and** committed as migration
  files under `supabase/migrations/`.
- Some RPCs already used by the app (e.g. `search_restaurants`,
  `get_restaurant_by_org_id`) exist only in the live database, not in repo
  migrations. Confirm their live definitions before extending behavior.
- Never drop or rename columns; add new columns as nullable. Assume RLS on all
  tables; new read paths must be column-safe (no leaking billing/Stripe fields).

## Design Decisions (confirmed with product owner)

- **Watermark:** visual overlay only (display-time CSS). No storage migration,
  no server-side baking in this work. Accepted that the raw file remains at a
  public URL; true protection (private bucket + signed URLs + server-baked
  watermark) is a noted future follow-up, not in scope here.
- **Reject:** soft-decline + notify. No hard delete. The creator can re-submit
  the same content afterward.
- **Creator updates:** surface in **both** the existing in-app notification bell
  **and** the DragonShare post card status.
- **Custom amount:** keep the four presets and add a "Custom" option ($5–$500).
- **Business decision:** primary actions are **Boost** (pay) or **Pass**
  (decline); keep a de-emphasized **Report** for genuine abuse, separate from
  Pass.
- **After payment:** keep the existing auto cross-post AND offer a **Download**
  of the clean (watermark-free) file.
- **Submit confirmation:** a success modal with a **"Share another"** action.

## Scope

In scope: the eight defects above, plus the supporting backend (resolver RPCs,
two new nullable columns, a decline RPC, and a notification on boost payout).

Out of scope (explicitly): true content protection via signed URLs / server-side
watermarking; email/SMS notifications (in-app only); any change to the Stripe
split, pricing, or the boost-payment charge logic itself; admin verification of
posts (the trust-then-flag model stays).

## Implementation — Sequential Tasks

Each task is implemented and verified independently: build → verify in
production (desktop and mobile) → push, before starting the next. Desktop UI
changes use `lg:`/`xl:` Tailwind prefixes; mobile uses base classes. The Brand
role reuses the same card components as the restaurant role
(`BusinessDragonShare` / `BrandDragonShare`).

### Task 1 — Backend resolvers: org name + social-by-org *(Creator #2, Restaurant #4)*

Foundational; resolves two visible bugs through backend mapping.

- New security-definer RPC `resolve_dragonshare_orgs(p_org_ids uuid[])`
  returning only `(id, name, logo_url, org_type)` for non-deleted orgs. This is
  preferred over a broad `organizations` SELECT policy, which (being row-level)
  would also expose billing/Stripe columns. First verify whether a
  `public_organizations` view already exists live exposing these safe columns;
  if so, reuse it rather than adding a new RPC.
- New security-definer RPC `get_org_connected_platforms(p_org_id uuid)` that
  maps `organizations.id` → owner user (via `org_members` owner role or
  `profiles.org_id`) → `business_profiles.id` → `business_outstand_accounts`
  (`status = 'active'`), returning `(platform, platform_handle)`.
- Frontend:
  - `src/hooks/useDragonShare.ts` (`useCreatorDragonSharePosts`): replace the
    RLS-blocked `target_org:organizations(...)` embed with a call to the
    resolver — batch the distinct `target_org_id`s and merge name/logo into each
    post object.
  - `src/hooks/useAmplificationPreview.ts`: replace the org branch's
    `business_id = orgId` query with `get_org_connected_platforms(orgId)`.
  - `src/pages/CreatorDragonShare.tsx`: drop the `'Unknown org'` literal once
    names resolve; keep a graceful fallback only for genuinely missing orgs.

**Files:** new migration(s) under `supabase/migrations/`; `useDragonShare.ts`;
`useAmplificationPreview.ts`; `CreatorDragonShare.tsx`.

**Verify:** creator card shows "Harbormill"; restaurant boost card and
`BoostConfirmationSheet` recognize the connected Instagram (no "Connect" prompt).

### Task 2 — Fix upload-persists bug *(Creator #1)*

- `DragonShareSubmitSheet.tsx`: stop calling `form.reset()` on incidental
  closes. Reset only on **explicit cancel** (X / deliberate dismiss) and **after
  successful submit**. Prevent the restaurant typeahead from triggering Radix
  interact-outside closes — either scope `RestaurantTypeahead`'s outside-click
  handling or guard the Sheet's `onPointerDownOutside` / `onInteractOutside`
  while the dropdown is open.
- Reproduce on **both** viewports before/after using browser automation. Desktop
  is expected stable but must be confirmed.

**Files:** `DragonShareSubmitSheet.tsx`; possibly `RestaurantTypeahead.tsx`.

### Task 3 — Submit success confirmation *(Creator #3)*

- New shared `DragonShareSubmitSuccessDialog` (shadcn `Dialog`): "Sent to
  {Restaurant}! They'll review and can boost it." with a primary **"Share
  another"** (resets the form) and a secondary "Done".
- Wire into both `DragonShareInlineForm` (desktop) and `DragonShareSubmitSheet`
  (mobile), replacing the toast-only path in
  `src/hooks/useDragonShareSubmitForm.ts` (`handleSubmit`). Pass the resolved
  restaurant name through for the message.

**Files:** new dialog component; `useDragonShareSubmitForm.ts`;
`DragonShareInlineForm.tsx`; `DragonShareSubmitSheet.tsx`.

### Task 4 — Custom boost amount *(Restaurant #3)*

- Add a **"Custom"** chip to the tier row in `DragonSharePostCard` that reveals
  an amount input with $5–$500 client-side validation. Submit
  `tier_label: 'custom'` plus `amount_cents` through the existing
  `BoostConfirmationSheet` → `boost-payment` path (already supported
  end-to-end). Keep `BOOST_TIERS` for the presets.

**Files:** `DragonSharePostCard.tsx`; minor `types/dragonshare.ts` if a helper
type is needed.

### Task 5 — Watermarked preview *(Restaurant #1)*

- New `WatermarkedMedia` component wrapping the existing `VideoThumbnail` / `img`
  with a diagonal tiled "DragonCandy • PREVIEW" overlay (CSS,
  `pointer-events-none`, responsive sizing for base + `lg:`).
- Use it for the content preview in `DragonSharePostCard` while the post is
  **not yet boosted**; render clean media once `boost_status === 'boosted'`.
  Display-only — no change to stored files.

**Files:** new `WatermarkedMedia` component; `DragonSharePostCard.tsx`.

### Task 6 — Pay-or-Pass decision + post-pay Download *(Restaurant #2, after-pay)*

- **DB:** add nullable `declined_at timestamptz` and `declined_by uuid` to
  `dragonshare_posts` (additive). New security-definer RPC
  `decline_dragonshare_post(p_post_id uuid)` that sets the decline fields, logs a
  `dragonshare_events` row, and inserts the creator notification (see Task 7).
- **Org query:** `useOrgDragonSharePosts` adds `.is('declined_at', null)` so a
  passed post leaves the queue.
- **UI:** in `DragonSharePostCard`, the primary actions become **Boost**
  (presets/custom) and **Pass** (calls the decline RPC, optimistic removal).
  Keep a small, de-emphasized **Report** (existing `useFlagDragonSharePost`) for
  abuse.
- **After payment:** when `boost_status === 'boosted'`, show a **Download**
  button (anchor to the clean `content_file_path` public URL with the `download`
  attribute) alongside the existing auto cross-post confirmation.

**Files:** new migration (columns + `decline_dragonshare_post`); `useDragonShare.ts`;
new decline hook; `DragonSharePostCard.tsx`.

### Task 7 — Creator notifications + card status *(Creator #4)*

- **Boost paid:** in `supabase/functions/_shared/fulfill-boost.ts`, after the
  payout transfer succeeds, create an in-app creator notification ("{Restaurant}
  boosted your post — +${payout}!") via the existing notification system
  (`create-notification`, `dragonshare_boost` type).
- **Declined:** the `decline_dragonshare_post` RPC (Task 6) inserts an
  encouraging creator notification ("{Restaurant} passed this time — your
  content's still great, share more!"). Copy is intentionally non-discouraging.
- **Card status:** `CreatorPostCard` (in `CreatorDragonShare.tsx`) reflects
  outcomes — "Paid +$X" (verify the existing transferred-boost display) and a
  soft "Not selected — share again" state when `declined_at` is set. Adjust the
  creator tab filtering so a declined post reads as a gentle state, not a hard
  "Rejected".
- In-app only — the `content` notification category defaults to
  `in_app: true, email: false`; no email wiring.

**Files:** `fulfill-boost.ts`; the decline RPC migration; `CreatorDragonShare.tsx`.

## Critical Files

- Creator: `src/pages/CreatorDragonShare.tsx`,
  `src/components/dragonshare/DragonShareInlineForm.tsx`,
  `src/components/dragonshare/DragonShareSubmitSheet.tsx`,
  `src/components/dragonshare/RestaurantTypeahead.tsx`,
  `src/hooks/useDragonShareSubmitForm.ts`
- Restaurant/Brand: `src/pages/BusinessDragonShare.tsx`,
  `src/components/dragonshare/DragonSharePostCard.tsx`,
  `src/components/dragonshare/BoostConfirmationSheet.tsx`,
  `src/components/dragonshare/AmplificationPreview.tsx`
- Shared/data: `src/hooks/useDragonShare.ts`,
  `src/hooks/useAmplificationPreview.ts`, `src/hooks/useFlagDragonSharePost.ts`,
  `src/types/dragonshare.ts`
- Backend: `supabase/functions/_shared/fulfill-boost.ts`,
  `supabase/functions/boost-payment/index.ts`, new `supabase/migrations/*`

## Testing & Verification

Per task, after the Lovable deploy completes:

- Poll the deployed bundle hash before verifying (Lovable deploys take minutes).
- Use browser automation with the test accounts; test **desktop and mobile**:
  - Creator (`damewillie@gmail.com`): upload → tag restaurant → upload persists;
    submit → success modal with "Share another"; card shows the real restaurant
    name; after a boost/pass, both the bell and the card update.
  - Restaurant (`dwilliams@harbormill.net`): content preview is watermarked
    pre-pay; the connected Instagram is recognized (no "Connect" prompt); Custom
    amount works; Pass removes the card from the queue; Boost → Download is
    available.
- Open Chrome DevTools and confirm **no console errors** for both roles and both
  viewports.
- `npm run build`, `npm run typecheck`, and `npm run test` green before each
  push. Add/extend unit tests where logic is testable (e.g., custom-amount
  validation, decline state derivation).
- Do not advance to the next task until the current one is ~95% verified.

## Risks & Open Questions

- **Resolver RPC vs existing view:** confirm whether `public_organizations`
  already exists before adding `resolve_dragonshare_orgs`, to avoid duplication.
- **Org → business_profiles ownership mapping:** confirm the canonical way to
  find a restaurant's owner (`org_members` owner role vs `profiles.org_id`); the
  social-by-org RPC depends on this being unambiguous for multi-member orgs.
- **Watermark is a deterrent, not protection:** the clean file stays publicly
  reachable; this is an accepted trade-off for this iteration and should be
  tracked as a follow-up.
