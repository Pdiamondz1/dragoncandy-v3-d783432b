---
title: Capacitor Phase 2 Share Sheet & App Privacy Sync Session
type: source
created: 2026-06-07
updated: 2026-06-07
sources: [raw/sessions/2026-06-07-weekly-sync.md]
tags: [capacitor, ios, app-store, share-sheet, privacy, weekly-sync]
---

# Capacitor Phase 2 Share Sheet & App Privacy Sync Session

A maintenance sync session (2026-06-07) capturing work that landed concurrently
with the previous wiki ingest. Two shipped items plus a page-count correction.

## Key Claims

- **Native share sheet shipped (Capacitor Phase 2, Slice C).** `@capacitor/share`
  added; `shareOrCopyLink` helper (`src/lib/nativeShare.ts`) presents the native
  iOS share sheet on native or falls back to clipboard on web. The only surfaces
  changed are the promotion "Copy Link" actions in `PromotionCard` and
  `PromotionDetailPage`. User-cancel is silenced; non-cancel native failure falls
  back to clipboard. Web behavior is byte-identical to before. Unit tests in
  `src/lib/nativeShare.test.ts`. See [[Capacitor Native Shell]].
- **Phase 2 status after this slice:** Camera (Slice B) + Share (Slice C) shipped;
  Push (Slice A) and Deep Links (Slice D) still pending. Next: push + deep links
  → TestFlight.
- **App Privacy data inventory shipped (Phase 0).** `docs/app-store/app-privacy-data-inventory.md`
  is the source of truth for the App Store Connect "nutrition label." Headline:
  nothing used for tracking, ATT not required (first-party analytics only), ~13
  data types collected. Five decisions to confirm before submission. See
  [[Capacitor Native Shell]].
- **Page count corrected: 63** (not 60 as recorded by the prior sync, which ran
  before the legal pages merged into main).

## See Also

- [[Capacitor Native Shell]]
- [[Core Docs Recent Updates Sync Session]]
- [[Apple App Store Capacitor Phase 1 Session]]
- [[Payments Split by Surface]]
