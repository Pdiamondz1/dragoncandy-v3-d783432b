# Session — Light-theme polish Phase 2 (2026-07-18)

**PR:** #282 (merged + deployed). Branch `feat/light-theme-polish-phase2`. Frontend-only; no
schema/edge-fn/secret change. Continues the light-theme polish that Phase 1 started
([[Light-Theme Polish Phase 1 Session]]) by adopting the same shared [[Light-App Kit]] across the
next three surface groups: **messaging, DragonShare/Dragon Feed, and public profiles.**

## Goal
Phase 1 built the kit (`src/components/app/`: `PageBody`/`AppCard`/`AppChip`/`AppStatusBadge` + the
`dc-secondary` button variant) and adopted it on the dashboards + campaigns + browse. Phase 2 is pure
**rollout** — no new primitives, just adoption on the surfaces Phase 1 deferred, so the whole app reads
as one on-brand, consistent, de-grayed light theme instead of a polished core surrounded by
hand-rolled, gray, radius-drifted screens.

## What shipped (3 commits, all presentational — no logic/routing/copy change)

**Messaging** (`64e38b07`) — retired the inconsistent **`bg-teal-50` "teal island"** page background on
`DirectMessagesPage` / `DirectConversationPage` / `CampaignMessagesPage` in favor of clean white +
`PageBody`; converted the ad-hoc bordered panels in `CampaignMessagesPage` to `AppCard`. De-gray:
message-input fills (`bg-stone-100` → `bg-white border-dc-teal/20`), the offline presence dot
(`bg-gray-500` → `bg-dc-teal/30`), and `CampaignConversationHeader`'s raw `blue/gray/purple` status
color-dict → `AppStatusBadge` tones. Thread/empty-state panels moved from a **flat `teal-50` wash** to a
subtle **`bg-dc-teal/[0.04]` tint** — the "subtle separation, not a full wash" rule (this is exactly the
`AppCard variant="inset"` tint). Chat **bubble colors (pink inbound / teal outbound) untouched by design.**

**DragonShare + Dragon Feed** (`eeb25693`) — adopted `PageBody`/`AppCard`/`AppChip` across
`Business/CreatorDragonShare`, `Business/CreatorDragonFeed`, `DragonShareBrowseRestaurants`, and the
`RestaurantBrowseHeader` / `DragonSharePostCard` components for card + tab/filter-chip consistency.

**Public profiles** (`9c683dfe`) — `PublicCreatorProfile` + `PublicBusinessProfile` adopt
`AppCard`/`AppStatusBadge`. The **pink hero and its white text stay untouched** (on-brand). Unified the
`rounded-3xl`/`rounded-2xl` white profile cards below the hero (profile-card overlay, stats row, about,
reviews, not-found state) into `AppCard`, killing the radius drift. De-gray: skeleton-loader fills
(`bg-gray-300` → `bg-dc-teal/10`), the broken-portfolio-image placeholder fill, the **Busy** availability
badge (`bg-gray-300/text-gray-600` → `AppStatusBadge tone="neutral"`), and the Message button's gray
border/hover (→ `variant="dc-secondary"`). Plain `gray-900/600/500/400` heading/body text left as-is per
the established "leave gray secondary text" convention.

## New durable gotcha (added to [[Light-App Kit]]) — AppCard is NOT a forwardRef component

`PublicBusinessProfile` has a `reviewsRef` used as a scroll-to-reviews click target. `AppCard` doesn't
forward a `ref`, so wrapping that specific card in `AppCard` would silently drop the ref and break the
scroll target. Fix: **keep the `ref` on a plain wrapping `<div>`** (leave that one card un-migrated, or
nest the `AppCard` inside the ref'd div) rather than converting it to `AppCard`. Rule: when a card needs
a `ref` (scroll anchor, measurement, focus), don't convert *that* node to `AppCard` — keep the ref on a
plain element. This joins the two Phase-1 gotchas (nested-button trap; `AppCard`-`p-0`-over-shadcn-`Card`).

## Defensible keeps (not de-grayed — intentional)
- **Green "Available" availability badge** (`bg-green-500 text-white`) — green = the "available now"
  semantic; only the neutral **Busy** state moved to `AppStatusBadge tone="neutral"`. (Sibling of the
  Phase-1 "emerald-inside-teal / social-platform colors" keeps.)
- **Chat bubbles** — pink inbound / teal outbound are the messaging brand identity, untouched.
- **Pink profile hero + white hero text** — on-brand, untouched.

## Process / verification
Subagent-driven execution (one implementer per surface group, two-stage review each). `npm run build`
green; 4/4 kit primitive unit tests still pass; **residual de-gray grep zero** across the Phase-2
surfaces; **Codex second review clean**. Public creator profile visually checkpointed on prod
(`dragoncandy.io/creator/dominick-commesso`) — clean white cards, teal/pink accents, amber "Rising" tier
pill, pink-divider stats row, no gray patches, no washed surfaces. Authenticated messaging/DragonShare
dashboards are founder-verified on prod (Claude can't sign in). Deployed as bundle `index-DN6f20XI.js`.

## Deferred to Phase 3 (only if requested)
Settings, org/billing/payments, promotions, and the Outstand surfaces — the remaining out-of-flow shared
components. Phase 2 closes messaging + DragonShare + public profiles.

## Files
Messaging: `pages/{DirectMessagesPage,DirectConversationPage,CampaignMessagesPage}` +
`components/messages/{ConversationMessageThread,MessageInputEnhanced,MessageList,UserPresenceIndicator}` +
`components/messaging/CampaignConversationHeader`. DragonShare: `pages/{Business,Creator}DragonShare`,
`pages/{Business,Creator}DragonFeed`, `pages/DragonShareBrowseRestaurants`,
`components/dragonshare/{RestaurantBrowseHeader,DragonSharePostCard}`. Profiles:
`pages/{PublicCreatorProfile,PublicBusinessProfile}`.
