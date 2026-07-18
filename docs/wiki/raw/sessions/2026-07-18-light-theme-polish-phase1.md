# Session — Light-theme polish Phase 1 (2026-07-18)

**PR:** #280 (merged + deployed). Branch `feat/light-theme-polish-phase1`. Frontend-only; no
schema/edge-fn/secret change. Follows the app-theme pivot ([[App Theme Pivot Session]]) that made the
app light.

## Goal
The reverted light app was functional but unpolished: no shared primitives → every screen hand-rolled
its own card/padding/chips (~5 card-border variants, `rounded-xl`/`2xl`/`3xl` drift, two button teals
`dc-teal-btn`#0F766E vs `dc-teal`#4DD9C0, section gaps `space-y-4…14`, double page-padding), and it
drifted off-brand (gray backgrounds/badges/off-state chips, `bg-blue-600` buttons, pink→purple
gradients). Decisions (all founder-confirmed): **clean-white + brand accents**; **foundation-first +
phased**; **de-gray surfaces/badges only** (gray secondary *text* left alone — `dc-text-muted` is a
gray by design).

## The keystone: one shared kit fixes both consistency AND de-gray at the source
Rather than swap ~1,900 gray classes blindly, build a small **light-app kit** (`src/components/app/`,
TDD) and adopt it — the primitives encode the on-brand style, so adoption de-grays and unifies in one
move:
- **`PageBody`** — page wrapper (`mx-auto max-w-6xl space-y-8`; `maxWidth` prop). Owns max-width +
  section rhythm; the `DashboardLayout` shell owns ALL padding (incl. `pb-24` mobile-nav clearance).
  Pages drop their own `px/p/pb/space-y` wrappers → kills double-padding + the `space-y` drift.
- **`AppCard`** — the one canonical card `rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm`
  (`pad="5|6"`; `emphasis` = 2px teal border; `inset` = `bg-dc-teal/[0.04]` soft-tint). A NEW primitive,
  NOT a restyle of shadcn `ui/card` (shared with dark surfaces).
- **`AppChip`** — de-grayed filter/segment control (a `<button>`): off = white + teal-tint border, on
  (`active`) = teal fill. Replaces `bg-gray-100 text-gray-600` "off" chips.
- **`AppStatusBadge`** — brand-tinted status badge (a `<span>`; `tone="teal|pink|amber|neutral"`, never
  gray).
- **`dc-secondary`** button variant — white + pink text + teal border (replaces `text-pink-500
  border-gray-200 hover:bg-gray-50`). Filled primary standardized on the `dc-primary` variant
  (`dc-teal-btn`).

## Two durable gotchas (from the adoption sweep)
1. **Nested-button trap.** `AppChip` renders a `<button>`; putting it inside another `<button>`/
   clickable card produces **invalid nested buttons** (browsers split/hoist them, breaking the card's
   click zone). For non-interactive tags/pills inside a clickable card, use **`AppStatusBadge`** (a
   `<span>`). `AppChip` only for real filter/segment controls not nested in a button.
2. **`AppCard` over an existing shadcn `Card`+`CardHeader`/`CardContent`** → wrap with `<AppCard
   className="p-0">` (don't flatten — `AppCard`'s `p-5` would stack on the `CardHeader`/`CardContent`
   padding → double-pad).

## De-gray palette (surfaces/badges only)
Gray bg → white / `bg-dc-teal/[0.04]` inset; gray "off" chip → `AppChip`; gray badge → `AppStatusBadge`;
`border-gray-*` → `border-dc-teal/15`; gray input fill → `bg-white border-dc-teal/20`; off-brand
`bg-blue-*`/purple → teal/pink; full-page grays (`BrandStylePicker` `bg-gray-400`, `FirstRunDashboard`,
`ErrorBoundary`) → white. `amber` is the allowed warm-neutral status tone. **Gray secondary text left
as-is.** Keeps: emerald-in-teal gradients, social-platform (Instagram/Facebook) colors.

## Scope (Phase 1) + two bugs found
Applied to the 3 dashboards, campaigns (builder + list/details/marketplace), browse. **Bugs fixed en
route:** the `CreatorCampaignMarketplace` same-file card mismatch (`:378` gray border vs `:413` teal),
and **invisible `text-white` leftovers** (empty-state heading/subtext + "Previously Skipped" header) on
the now-white page → `text-dc-text`/`text-dc-text-muted` (kept `text-white` that sits on teal/pink
fills). Also `ActivityFeedCard`'s blue `draft` badge → teal, and a stray `text-indigo` icon.

Deferred to later passes (out-of-flow shared components, correctly untouched): `MediaUploader` (also
Outstand), the brief/`BrandCampaignBriefStep` flow, etc. Phase 2/3 = messaging (the `bg-teal-50`
island), DragonShare pair, settings, org/billing, promotions, outstand, public profiles.

## Process / verification
brainstorm→spec(reviewer-approved, folded in the `App*`-naming + `pad`-prop + campaigns-sub-batch
advisories)→plan(reviewer-approved)→subagent-driven execution (kit TDD; application groups gated by
build + residual-grep + a both-viewport walk). 4/4 primitive unit tests; `npm run build` green;
**residual grep zero hits** across all Phase-1 surfaces; **Codex second review clean**. Presentational
only — spacing/border normalization is the intended visible delta, but no logic/routing/copy/layout
change. 82 files, +1045/−480. `DESIGN_SYSTEM.md` refreshed in-PR (Theme + new "Shared light-app kit"
section + the stale per-page background table retired). Authenticated dashboards verified by the founder
on prod (Claude can't sign in).

## Files
Kit: `src/components/app/{PageBody,AppCard,AppChip,AppStatusBadge}.tsx` (+ tests) + the `dc-secondary`
variant in `src/components/ui/button.tsx`. Adoption: `pages/{Business,Creator,Brand}Dashboard` +
`components/dashboard/*`; `pages/{CampaignCreator,CampaignsPage,CampaignDetailsPage,
CreatorCampaignMarketplace,MyCampaignsPage}` + `components/{campaign-creator,campaigns,campaign-details}/*`;
`pages/CreatorBrowse` + `components/creator-browse/*`; quick wins (`BrandStylePicker`, `FirstRunDashboard`,
`ErrorBoundary`, `CampaignAnalysisDisplay`, `RatingPrompt`, `StartContentButton`). Spec:
`docs/superpowers/specs/2026-07-17-light-theme-polish-phase1-design.md`.
