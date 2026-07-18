# Session — Light-theme polish Phase 3 (2026-07-18)

**PR:** #285 (merged + deployed). Branch `feat/light-theme-polish-phase3`. Frontend-only; no
schema/edge-fn/secret change. Third slice of the light-theme polish that Phase 1 designed
([[Light-Theme Polish Phase 1 Session]]) and Phase 2 continued ([[Light-Theme Polish Phase 2 Session]]) —
adopting the same shared [[Light-App Kit]] across the surface groups Phase 1/2 deferred.

## Scope decision (founder): Outstand → a separate Phase 4
A read-only scoping audit found the four candidate buckets are very lopsided in size. **Settings**
(~10 files, shallow), **Promotions** (~25 files but nearly gray-free — mostly `rounded→AppCard`), and
**Org/Billing/Payments** (~15 files, money-flow care) are small/medium; **Outstand alone is larger than
the other three combined** (~51 files, 127 surface-gray occurrences, and its social-platform brand
colors are intermixed with genuine off-brand accents so it needs per-instance judgment, not
find-replace). The founder chose to **defer Outstand to a dedicated Phase 4** (likely sub-split: tabs →
analytics → calendar → engagement) so its platform-color nuance gets proper care. Phase 3 = the three
lower-risk buckets.

## What shipped (5 commits, all presentational — no logic/routing/copy/behavior change)

**Settings** — the keystone is `SettingsSection.tsx`, the shared white-card wrapper for *every* settings
section (also reused by promotions' `CGCPostingPreferences`): de-grayed its border to `border-dc-teal/15`
+ `shadow-dc-sm` (kit-card look; kept as an `AccordionItem`, NOT forced into `AppCard`), which cascades
across the whole settings surface. `ToastConnectionCard` → `AppCard` + sync-state pills →
`AppStatusBadge` tones. `PageBody` on both settings pages (kept the intentional narrow `max-w-lg` settings
layout). `StripeConnectSetup` is money-flow → **chrome-only** (raw `bg-teal-500/600` buttons →
`Button variant="dc-primary"`; the semantic status panels green/yellow/amber/red are **keeps**, not
de-gray targets).

**Promotions** — promo/tab/stat cards → `AppCard`, status pills → `AppStatusBadge`, filter/status tabs →
`AppChip`; `SyncStatusBadge` de-grayed; `PromotionsErrorBoundary` → white `AppCard` **but keeps its
`bg-red-50` red wash** (a follow-up fix — `AppCard` forces `bg-white`, which silently dropped the tint;
re-asserted `bg-red-50` so a crash surface still reads as tinted-error). Inherits the `SettingsSection`
restyle via `CGCPostingPreferences`.

**Org / Billing / Payments** — billing/earnings/payout/payment cards → `AppCard`, payment status pills →
`AppStatusBadge` (failure red kept as a literal — `AppStatusBadge` has no red tone), `PaymentsPage`
active/completed/issues tabs → `AppChip`, tier badges de-grayed. **Money-flow is styling-only** — all
amounts, fee math, status/`event_type` enums, handlers, and checkout/billing-portal/withdraw redirect
URLs are byte-unchanged. A follow-up fix distinguishes the **starter vs growth** tier badges (the de-gray
had collapsed the off-brand blue+teal accents both onto `bg-dc-teal/10`; growth → `bg-dc-teal/20` so all
five tiers stay distinct within the teal/pink/amber/neutral palette).

## Scope guards honored (verified absent from the diff)
- **`AvatarCropModal.tsx`** — SHARED WITH the dark onboarding wizard (`useDarkHtml`); restyling it for
  light would break dark onboarding. Left untouched. (Same rule protects all shadcn `components/ui/*`.)
- **Public/marketing surfaces** — `PricingPage.tsx` + `TierComparisonGrid.tsx`, and the dual-used
  test-mode helpers `StripeTestHelper.tsx` + `TestModeBanner.tsx` (touching them would alter the excluded
  public pricing surface). Left untouched.
- **Public customer funnel** — `PromotionSubmissionPage.tsx` (the anonymous customer video-submit funnel)
  + its funnel-exclusive children `CustomerInfoForm.tsx` and `VideoUploader.tsx`. Left untouched (importer
  grep confirmed VideoUploader is funnel-only; `SocialPostEditor` is internal-only but had only
  social-brand colors, so it was in-scope-but-unchanged).

## Durable rules reinforced (no new kit gotcha this phase)
- **De-gray = surfaces/badges only**; gray secondary TEXT is left as-is. Off-brand blue/purple/indigo →
  teal/pink. **Semantic status colors are keeps** — green (available/connected/success), amber (pending),
  **failure/dispute red** — de-gray only genuinely neutral fills/borders. **Social-platform brand colors
  are keeps** (Facebook blue, Instagram gradient, X/TikTok black, YouTube red).
- **Money-flow UI is styling-only** — a de-gray pass on a payment/payout/billing surface must never touch
  amounts, fee math, status enums, handlers, redirect URLs, routing, or copy. `AppStatusBadge` has no red
  tone by design, so keep failure red as an explicit literal.
- **A shared section-wrapper is the highest-leverage node** — restyling `SettingsSection` once cascaded
  across every settings section AND a promotions surface. Find the shared wrapper first.

## Process / verification
brainstorm-free continuation of an already-designed rollout → read-only scoping audit → founder scope call
(defer Outstand) → subagent-driven execution (one implementer per bucket, a focused spec+quality review
each — all three **APPROVED**) → two review-caught polish fixes (tier-badge distinction; error-boundary
red wash) → whole-branch review (**READY TO MERGE**; caught the error-boundary `bg-red-50` drop) →
**Codex second review clean** ("theme/component substitutions, no functional regressions"). `npm run
build` + `npm run typecheck` green; **983/983 tests pass**; **residual de-gray grep = zero** across all 31
touched files. Authenticated surfaces (settings/billing/payments/promotions) are founder-verified on prod
(Claude can't sign in); the public deploy is bundle-hash + console-error verified.

## Files (31)
Settings: `pages/{Business,Creator}Settings`, `components/settings/{SettingsSection,BusinessSettingsSections,
CreatorSettingsSections,LocationSettingsSections,StripeConnectSetup}`, `features/settings/ToastConnectionCard`.
Promotions: `pages/{BusinessPromotionalTools,PromotionDetailPage}`, `components/promotions/{PromotionCard,
SubmissionCard,PromotionStats,ActivePromotionsTab,PendingReviewsTab,ApprovedVideosTab,VerifyCodesTab,
CGCContentLibrary,PromotionsErrorBoundary}`, `features/promotions/{components/HelpTooltip,
components/RedemptionMetrics,components/SyncStatusBadge,review/SubmissionRow}`. Org/Billing/Payments:
`pages/{OrgBillingPage,OrgUnitsPage,PaymentsPage,CreatorEarnings}`, `components/org/{OrgUnitSwitcher,
AddEditUnitModal}`, `components/payments/{PaymentSummaryCards,PaymentTimeline}`.

## Deferred to Phase 4 (Outstand)
The ~51-file social-integration surface — its own effort, likely sub-split, because its social-platform
brand colors need per-instance judgment. With Phase 3, **only Outstand remains** un-polished in the light app.
