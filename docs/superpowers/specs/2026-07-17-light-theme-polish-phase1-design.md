# Light-Theme Polish — Phase 1 Design

**Date:** 2026-07-17
**Branch:** `feat/light-theme-polish-phase1`
**Status:** Design (pre-implementation)

## 1. Context & Problem

The DragonCandy authenticated app was just reverted to its original **light** theme (after the
dark-app experiment was rolled back — see `docs/wiki/concepts/dark-luxe-app-theme.md`). That light
app is functional but **not polished**: it's inconsistent screen-to-screen and drifts off-brand.

Two audits established the real state:
- **Structural inconsistency (no shared primitives):** every screen hand-rolls its own card, page
  padding, and chips → ~5 different card-border treatments (`border-dc-teal/15` vs `2px dc-teal` vs
  `border-teal-200` vs `border-gray-200` vs none), radius drift (`rounded-xl`/`2xl`/`3xl`), two
  different teals used as button fills (`dc-teal-btn` #0F766E vs `dc-teal` #4DD9C0), section gaps
  ranging `space-y-4`→`space-y-14`, and double page-padding (pages re-pad inside the already-padded
  `DashboardLayout` shell). Two "twin" pages (the DragonShare pair) render differently.
- **Off-brand / gray:** the standing rule is "never use gray **backgrounds/banners/badges** — use
  brand-adjacent colors." ~286 gray backgrounds (mostly `bg-gray-50/100` card/input/chip fills; a few
  full-page: `BrandStylePicker` `bg-gray-400`, `FirstRunDashboard`, `ErrorBoundary`), gray "off"-state
  filter/segment chips, gray status badges, and a small off-brand accent set (`bg-blue-600` buttons,
  pink→purple gradients). (Gray *secondary text* is out of scope — `dc-text-muted` #555 is a gray by
  design and reads fine.)

Also: `DESIGN_SYSTEM.md`'s per-page background table (Browse = pink, messaging = gray) is **stale** —
the app is near-uniformly white.

## 2. Decisions (confirmed with the user)

1. **Target look = clean white + brand accents.** White/very-light page base, ONE consistent
   teal-bordered rounded card, teal + pink accents/chips, gray surfaces replaced with white/soft-tint.
   Update the stale `DESIGN_SYSTEM.md` to match.
2. **Foundation-first + phased.** Build a shared kit, apply to the highest-traffic surfaces first, then
   roll out. Phase 1 is this spec.
3. **De-gray = surfaces + badges only.** Gray backgrounds/badges/off-state chips → brand-adjacent;
   leave gray secondary text.

## 3. Goals & Non-Goals

**Goals (Phase 1):**
- A small **shared light-theme kit** (`PageBody`, `Card`, `Chip`, `StatusBadge`, standardized button
  usage) that codifies one on-brand style.
- Apply the kit to the **highest-traffic surfaces**: the 3 dashboards, campaigns
  (list/creator/details/marketplace/my-campaigns), browse.
- **Quick high-visibility wins:** the 3 full-page grays; the off-brand blue/purple buttons; Browse →
  white; the two campaign cards that disagree in the same file.
- Refresh `DESIGN_SYSTEM.md` to the clean-white reality.

**Non-Goals:**
- No dark-theme changes (landing/auth/onboarding/`/internal` untouched).
- No layout/UX/behavior/copy changes — presentational consistency only.
- No text-token normalization (the ~1,350 `text-gray-*` are out of scope).
- Not the remaining surfaces (messaging, DragonShare, settings, org/billing, promotions, outstand,
  profiles) — those are follow-on phases (§8).

## 4. The Shared Kit

New primitives in a light-app folder `src/components/app/` (small, focused, each independently
testable). **Named with an `App*` prefix (`AppCard`, `AppChip`, `AppStatusBadge`) to avoid collision
with the shadcn `Card` (imported in 68 files) and the existing `ApplicationStatusBadge`/`SyncStatusBadge`.**

### 4.1 `PageBody`
`<PageBody>` = `<div className="mx-auto w-full max-w-6xl space-y-8">{children}</div>`. It owns
**section rhythm and max-width only** — the `DashboardLayout` content wrapper keeps the **sole** page
padding (mobile `pt-4 pb-24 px-4`, desktop `p-6 lg:p-8`, incl. the mobile-nav `pb-24` clearance).
Pages adopt `PageBody` and **remove** their own `px-*`/`p-*`/`pb-*`/`space-y-*` wrappers. A
`maxWidth?: "6xl" | "4xl" | "full"` prop (default `"6xl"`) covers the few wider/narrower pages —
default `6xl` for all Phase-1 pages unless the current page already uses a visibly wider/full layout
(a per-page judgment the implementer records; when unsure, `6xl`). Kills the double-padding + the
`space-y` drift.

### 4.2 `AppCard`
`<AppCard>` = `rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm` + a `pad?: "5" | "6"` prop
(default `"5"`). Variant `variant?: "default" | "emphasis" | "inset"`: `emphasis` = `border-2
border-dc-teal` (selected/featured); `inset` = a nested/section surface `rounded-xl border
border-dc-teal/10 bg-dc-teal/[0.04]` (the soft-tint replacement for gray inset panels). This one
component replaces the ~5 hand-rolled card treatments + the radius drift. **A new primitive, NOT a
restyle of shadcn `ui/card.tsx`** — that's shared with dark surfaces; leave it. Files that still need
shadcn `CardHeader`/`CardContent` keep importing those from `@/components/ui/card` (no alias needed —
the names don't collide).

### 4.3 `AppChip` + `AppStatusBadge`
- `<AppChip active={bool}>` — the de-grayed filter/segment control: off = `bg-white border
  border-dc-teal/20 text-dc-text-muted hover:bg-dc-teal/5`, on = `bg-dc-teal/10 border border-dc-teal
  text-dc-teal-btn`. All `rounded-full`. Replaces every `bg-gray-100 text-gray-600` "off" chip.
- `<AppStatusBadge tone="teal|pink|amber|neutral">` — brand-tinted badges: teal
  (`bg-dc-teal/10 text-dc-teal-btn`), pink (`bg-dc-pink-accent/10 text-dc-pink-accent`), amber
  (`bg-amber-50 text-amber-700` — a warm neutral, allowed), neutral (`bg-dc-teal/5 text-dc-text-muted`
  — the de-grayed "neutral", never `bg-gray-*`). Replaces gray status pills. (Distinct from the
  domain-specific `ApplicationStatusBadge`/`SyncStatusBadge`, which can later adopt these tones.)

### 4.4 Buttons (standardize usage, no new component)
Filled primary → the existing `ui/button.tsx` `dc-primary` variant (one teal fill, `dc-teal-btn`
#0F766E — the accessible one); fix stray `bg-dc-teal` fills. Secondary CTA → a `dc-secondary`
variant added to `button.tsx`: `bg-white text-dc-pink-accent border-2 border-dc-teal/30
hover:bg-dc-teal/5 rounded-full` (replaces the `text-pink-500 border-gray-200 hover:bg-gray-50`
pattern). Ghost/outline → existing `dc-outline`/`dc-ghost`.

## 5. The De-Gray Palette (surfaces + badges)

| Gray today | Becomes |
|---|---|
| full-page `bg-gray-400/100/50` (`BrandStylePicker`, `FirstRunDashboard`, `ErrorBoundary`) | `bg-white` |
| card/section fill `bg-gray-50/100` | `<AppCard>` (`bg-white`) or `<AppCard variant="inset">` (`bg-dc-teal/[0.04]`) |
| input fill `bg-gray-100` | `bg-white border border-dc-teal/20` (raw `<input>`); shadcn `<Input>` → explicit `border-dc-teal/20 bg-white` |
| "off" filter/segment chip `bg-gray-100 text-gray-600` | `<AppChip>` (white + teal-tint) |
| gray status badge | `<AppStatusBadge>` (brand tone) |
| `border-gray-200/100` | `border-dc-teal/15` |
| off-brand `bg-blue-600` button (`CampaignAnalysisDisplay`, `RatingPrompt`) | `dc-primary` variant |
| pink→purple gradient (`StartContentButton`) | pink→teal (`from-dc-pink-accent to-dc-teal`) |
| purple/blue media-type badges (`MediaUploader`, `SponsorshipMarker`) | teal/pink `StatusBadge` |
| **gray secondary text** (`text-gray-500/400`) | **unchanged** (out of scope) |

Leave defensible non-brand colors: emerald *inside* teal gradients (`from-teal-400 to-emerald-400`),
and social-platform brand colors (Instagram/Facebook) in the posting/outstand surfaces (semantic).

## 6. Phase 1 Scope

Order: **(a) build the kit → (b) apply to surfaces → (c) quick wins.** Build + review + ship per group.

- **Kit:** `src/components/app/{PageBody,AppCard,AppChip,AppStatusBadge}.tsx` (+ co-located render
  tests) + the `dc-secondary` variant in `src/components/ui/button.tsx`.
- **Dashboards:** `pages/{Business,Creator,Brand}Dashboard.tsx` + the shared `components/dashboard/*`
  blocks (they drive all three) — adopt `PageBody` + `Card`; standardize the teal button fill;
  de-gray `ActivityFeedCard` accents.
- **Campaigns:** `pages/{CampaignsPage,CampaignCreator,CampaignDetailsPage,CreatorCampaignMarketplace,
  MyCampaignsPage}.tsx` + `components/{campaigns,campaign-creator,campaign-details}/*` — unify card
  border/radius (kill the `rounded-xl` builder family + the same-file `:378` vs `:413` mismatch),
  de-gray the chips/pills/badges, fix the off-brand buttons. **`components/campaigns/*` is 120+ files
  — touch only the components actually rendered by these five pages** (trace imports from each page),
  and use the residual grep (`bg-gray-`/`border-gray-`/`bg-blue-6`/`to-purple-`) over the touched
  tree as the done-criteria. Split campaigns into ~2 reviewable sub-batches (creator/builder flow;
  list/details/marketplace) if it runs large.
- **Browse:** `pages/CreatorBrowse.tsx` (→ `bg-white`, drop double-padding) + `components/creator-browse/*`
  (`CreatorCard` gray border → teal; `CreatorBrowseHeader` gray filter chips → `<Chip>`).
- **Quick wins:** `BrandStylePicker` / `FirstRunDashboard` / `ErrorBoundary` full-page gray → white;
  `CampaignAnalysisDisplay` / `RatingPrompt` blue buttons → `dc-primary`; `StartContentButton`
  pink→purple → pink→teal.
- **Docs:** rewrite the `DESIGN_SYSTEM.md` "Page-Specific Backgrounds" table + add a "Shared kit"
  subsection (PageBody/Card/Chip/StatusBadge + the de-gray palette).

## 7. Risks & Gotchas

- **Don't restyle shadcn `ui/card.tsx` / `ui/button.tsx` defaults globally** — they're used on dark
  surfaces too. Add the new `dc-secondary` button *variant* (additive); make `Card` a new primitive.
- **Protect desktop vs mobile** — the `DashboardLayout` mobile top-nav pink gradient stays; only the
  page bodies change. Test both viewports (`lg:` classes untouched unless intentional).
- **Intended vs unintended spacing change** — normalizing the `space-y-4…14` drift to `space-y-8` and
  moving padding to the shell **is a deliberate, visible spacing change** (that's the polish) — do not
  second-guess it as a violation of "presentational only." What must NOT change is *what renders* and
  the *layout structure* (no reflow that hides/reorders content, no lost `pb-24` mobile-nav clearance,
  no page that silently loses a wider/full-width layout it needs). `PageBody` adoption changes wrapper
  classes only.
- **Amber is allowed** as the warm-neutral status tone; do not introduce new grays via "neutral."
- **Two-viewport verify** after each group; `verify-prod` post-deploy.

## 8. Rollout (follow-on phases — not this spec)

- **Phase 2:** messaging (the `bg-teal-50` island → consistent white + kit) + the DragonShare pair
  (make the twins match) + public profiles.
- **Phase 3:** settings + org/billing + promotions + outstand (calendar/accounts) + the long tail.

## 9. Verification / Testing

- `npm run build` + co-located render tests for the 4 new primitives.
- `npm run dev`, walk **both viewports** through the Phase-1 surfaces: 3 dashboards, the campaign
  flow, browse — confirm one consistent card/chip/button/spacing language, no gray
  surfaces/badges, no off-brand buttons, no double-padding. No behavior/layout change.
- Residual grep over the touched files for `bg-gray-`/`border-gray-`/`bg-blue-6`/`to-purple-`.
- `codex-review` before the PR; `verify-prod` (both viewports) post-deploy.

## 10. Open Questions

None blocking. Exact tint values (`bg-dc-teal/[0.04]` inset, chip hover) are visual tuning to settle
during the frontend-design implementation pass against the live app.
