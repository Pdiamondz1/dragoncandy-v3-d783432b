# Session — Light-theme polish Phase 4 (Outstand) (2026-07-18)

**PR:** #288 (merged + deployed). Branch `feat/light-theme-polish-phase4`. Frontend-only; no
schema/edge-fn/secret change. The **final surface-group slice** of the light-theme polish that
Phases 1–3 rolled out ([[Light-App Kit]]) — the ~47-file **Outstand** social-integration surface.

## Why Outstand was its own phase (deferred from Phase 3)
A scoping audit found the four Phase-3 candidate buckets very lopsided: Settings/Promotions/
Org-Billing were small/medium, but **Outstand alone (~51 files, 127 surface-gray occurrences) was
larger than the other three combined** — and, crucially, its blue/purple/red are a MIX of
**social-platform brand colors (KEEP)** and genuine off-brand accents, so it needed **per-instance
judgment, not find-replace**. The founder chose to defer it to a dedicated Phase 4.

## Executed as 6 reviewed sub-batches (all presentational — no logic/routing/copy/behavior change)
1. **Shell + Accounts/Connections** — `OutstandManager` stat cards, account rows/chips, `ConnectedAccountsList`.
2. **Compose + Drafts + Media** — draft/compose cards → `AppCard`; media placeholders de-grayed.
3. **Calendar** (highest-risk — `CalendarTab`/`PostManagementPanel` shared with the standalone
   `/calendar` page, `SponsorshipMarker` shared with the schedule agenda) — view/platform segment
   toggles → `AppChip`; grid chrome de-grayed; generic purple "posting plan" panel + `SponsorshipMarker`
   amplification purple → teal/pink.
4. **Analytics/charts** — card chrome de-grayed; **all chart data-viz colors kept** (series/scale/
   `<Cell>`/legend — `FollowerChart` fills, `PostingHeatmap` `TEAL_SHADES`, `DeltaBadge`).
5. **Prompts + Sponsorship + Money-flow** — campaign-shared prompt cards → `AppCard`; **DragonDash
   rush surcharge styling-only** (`DragonDashRushButton`/`RushConfirmDialog`).
6. **Engagement + Donny/AI panels** — generic blue Comment/Reply badge → `AppStatusBadge tone="teal"`;
   placeholders/buttons de-grayed.

## The Outstand-specific discipline (the reason it was its own phase)
The definitive **KEEP** set, honored across the whole diff:
- **Social-platform brand colors** — the `socialNetworks.ts` `NETWORK_COLORS` map (never edited), the
  Instagram gradient `from-purple-600 via-red-500 to-orange-400`, `x bg-gray-800`, Facebook `bg-blue-*`,
  YouTube `bg-red-600`, TikTok black. Only neutral **unknown-platform fallbacks** (`bg-gray-400`/
  `bg-gray-600`) were de-grayed.
- **Chart data-viz colors** — series/scale/`<Cell>`/legend swatches untouched (only chrome around charts).
- **Semantic** amber/red/emerald; **money-flow** logic byte-unchanged.
- **NO-CHANGE files:** `VerifiedBadge`, `CrossPostPrompt` (heavily shared, already on-brand).
- No `src/components/ui/*` restyle.

Two established accessibility fixes carried through: raw `bg-dc-teal`/`bg-teal-500` fill buttons (white
on `#4DD9C0` fails AA) → `bg-dc-teal-btn` (`#0F766E`, AA-pass); a de-grayed pale fill that kept
`text-white` got a legible token instead (the Batch-1 unconnected-avatar-initials catch).

## Process / verification
Subagent-driven (one implementer per batch). Batches 1–5 individually reviewed **APPROVED**; Batch 6's
implementer hit a stream timeout **after committing**, so it was verified independently + folded into the
whole-branch review (which re-checked it in full → **READY TO MERGE**). **Codex second review clean**
("theme/component substitutions, no functional regressions"). `npm run build` + typecheck green;
**983/983 tests**; full residual sweep across all 47 files = **zero unjustified surface-gray/off-brand**
(only platform-map keeps remain). 15 components shared with other LIGHT surfaces (dashboards, `/calendar`,
public profiles, campaign details, settings) verified — none dark. Deploy verified (bundle live, public
console clean; the authenticated Outstand surface is founder-verify-only).

## Files (47) — highlights
`pages/OutstandManager` + `components/outstand/**` incl. `AccountsTab`, `ConnectedAccountsList`,
`ScheduleConfirmation`, `DraftsTab`, `MediaPreviewGrid`, `CalendarTab`, `calendar/*`,
`PostManagementPanel`, `UpcomingPostsWidget`, `SponsorshipMarker`, `analytics/*`
(`FollowerChart`/`PlatformBreakdown`/`TopPosts`/`SponsorshipROISummary`/`CampaignImpactSummary`/…),
`SponsorshipAmplificationPrompt`, `PostingPlanReview`, `DragonDashRushButton`, `engagement/*`, the Donny
AI panels.

## With this, all four surface groups are on the kit
Phase 1 (dashboards/campaigns/browse) → Phase 2 (messaging/DragonShare/profiles) → Phase 3
(settings/promotions/billing) → Phase 4 (Outstand). The remaining polish (panel backgrounds + off-brand
accents the surfaces/badges rule left) is a separate cleanup — see
[[De-gray Backgrounds & Off-Brand Accents]].
