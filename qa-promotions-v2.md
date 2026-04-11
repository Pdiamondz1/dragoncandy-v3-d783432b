# Promotions v2 — QA Report

**Date:** 2026-04-11
**Auditor:** Claude Code (code-level audit)
**Scope:** All Promotions-touching pages, TASK-001 through TASK-026
**Method:** Static code audit of all `lg:` classes, responsive patterns, overflow handling, and component wiring across 31 files.

---

## Desktop `lg:` Baseline Status

| File | `lg:` Classes Present | Status |
|------|----------------------|--------|
| `ActivePromotionsTab.tsx` | `lg:grid-cols-4` (stats), `lg:grid-cols-3` (cards) | PASS |
| `PendingReviewsTab.tsx` | `lg:grid-cols-3` (submissions grid) | PASS |
| `ApprovedVideosTab.tsx` | `lg:grid-cols-3` (video cards grid) | PASS |
| `PromotionStats.tsx` | `lg:grid-cols-4` (stats dashboard) | PASS |
| `RedemptionMetrics.tsx` | `hidden lg:block` (sparkline), `hidden lg:inline` (label) | PASS |
| `SubmissionForm.tsx` | `lg:grid-cols-2` (social handle fields) | PASS |
| `HelpBriefDrawer.tsx` | `lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[480px]` | PASS |
| `DonnyDock.tsx` | `lg:w-14 lg:h-14` | PASS |
| `BusinessPromotionalTools.tsx` | inherits `md:max-w-4xl md:mx-auto` from container | PASS |

**Result: 0 regressions on desktop `lg:` classes. No launch blockers.**

---

## Mobile Responsive Audit

| Component | Mobile Behavior | Status |
|-----------|----------------|--------|
| BusinessPromotionalTools header | Full-width pink gradient, stats grid 2-col | PASS |
| DonnyCampaignCTA | Full-width pink button | PASS |
| HelpTooltip popover | Centered 256px card | PASS |
| SubmissionForm social fields | Single-column stack | PASS |
| SocialHandleChips (review) | Wrapping flex chips | PASS |
| RedemptionMetrics | Counter + pip only (sparkline hidden) | PASS |
| SyncStatusBadge | Inline badge, no overflow | PASS |
| DonnyDock | 56px floating button, bottom-right | PASS |
| DonnyChatSheet | 85vh sheet from bottom | PASS |
| HelpBriefDrawer | Full-screen overlay | PASS |
| PromotionSubmissionPage | max-w-md centered, all steps stack | PASS |
| HelpBriefPage | max-w-2xl centered, prose styling | PASS |

---

## Overflow Audit

| Page | `overflow-x-hidden` | Horizontal Scroll Risk | Status |
|------|---------------------|----------------------|--------|
| BusinessPromotionalTools | Yes (container) | None | PASS |
| PromotionSubmissionPage | Yes (root) | None | PASS |
| All modals/dialogs | `max-h-[90vh] overflow-y-auto` | None | PASS |
| Tab content areas | Content constrained by parent | None | PASS |

---

## New Components (TASK-015 → TASK-026) Audit

| Task | Component | Responsive | Accessible | Wired In |
|------|-----------|-----------|------------|----------|
| 015 | SocialHandleFields | 1-col mobile / 2-col lg | aria-label per input | PromotionSubmissionPage |
| 016 | validateHandle | N/A (pure function) | N/A | Stub, not yet consumed |
| 017 | SocialHandleChips | flex-wrap chips | link titles, new tab | SubmissionCard |
| 018 | donny-toast-context | N/A (Edge Function) | N/A | Supabase |
| 019 | get_toast_insights | N/A (Donny tool) | N/A | donny-chat |
| 020 | DonnyCampaignCTA | w-full button | button semantics | BusinessPromotionalTools |
| 021 | HelpBriefPage | max-w-2xl, prose | back link, heading | App.tsx route |
| 022 | MDX briefs (x5) | N/A (content) | semantic HTML via MDX | lazy-loaded |
| 023 | HelpTooltip | inline popover | button + aria-label | BusinessPromotionalTools |
| 024 | deepLinks + Drawer | full-screen / lg:480px | close button, escape | App.tsx + DonnyMessage |
| 025 | DonnyDock | 56px / lg:56px | aria-label, focus ring | portal to body |
| 026 | DonnyDock mount | hidden on /auth/* | N/A | App.tsx |

---

## Launch Blockers

**None found.**

---

## Notes

- Visual pixel-comparison against Lovable.dev preview requires browser access. This audit was performed via static code analysis. Manual visual verification on Lovable preview is recommended before launch.
- All `lg:` classes from prior codebase are intact — no removals detected.
- DonnyDock uses `z-50`; HelpBriefDrawer uses `z-[61]` — stacking order is correct.
- Toast Edge Functions were reviewed for CORS headers and error handling — all follow the established pattern.
