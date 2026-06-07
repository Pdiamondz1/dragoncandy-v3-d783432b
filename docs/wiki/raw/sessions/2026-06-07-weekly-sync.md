# Session Extract: Weekly Sync — Capacitor Phase 2 Slices B+C, App Privacy Inventory

## Session Metadata
- Created: 2026-06-07
- Project: C:\GIT\dragoncandy-v3-d783432b
- Branch: main
- Type: Maintenance sync — synthesized from git commits that landed on 2026-06-06 and
  2026-06-07, closing the gap left by the 2026-06-07 core-docs sync (which covered
  2026-06-01 → 2026-06-06 and missed work that merged concurrently or after that sync ran).

## Purpose

Capture three items not reflected in the previous wiki ingest (2026-06-07):
1. Capacitor Phase 2 native share sheet (Slice C) — PR #31, merged 2026-06-07.
2. App Privacy data inventory — Phase 0 App Store deliverable, committed 2026-06-06.
3. Correct page count: actual `src/pages/*.tsx` count is **63**, not 60 (the prior
   sync ran against a worktree that predated the legal pages landing on main).

---

## 1. Capacitor Phase 2, Slice C: Native Share Sheet (shipped)

### What shipped

- **`@capacitor/share@^6`** added as a dependency (`b731ee5`).
- **`src/lib/nativeShare.ts`** — `shareOrCopyLink(opts)` helper. Plain async
  function (not a hook) that presents the native iOS share sheet (`Share.share`)
  on native, or falls back to `navigator.clipboard.writeText` on web.
  Returns `'shared'` | `'copied'`. User-cancel is silenced. Non-cancel native
  failure falls back to clipboard. Callers own their own toast/flash state.
- **`src/lib/nativeShare.test.ts`** — unit tests in node env (no DOM): mocks
  `@capacitor/core`, `@capacitor/share`, and `navigator.clipboard`. Covers iOS
  success, iOS cancel, iOS non-cancel fallback, web success, web failure re-throw.
- **`src/components/promotions/PromotionCard.tsx`** and
  **`src/pages/PromotionDetailPage.tsx`** — the only surfaces identified as genuine
  "share a link with another person" in the app. Both `copyLink` functions rewritten
  to delegate to `shareOrCopyLink`. Web behavior byte-identical to before. On iOS
  the native share sheet opens instead of the clipboard copy.
- Spec: `docs/superpowers/specs/2026-06-07-native-share-sheet-design.md`
- Plan: `docs/superpowers/plans/2026-06-07-native-share-sheet.md`

### Why this matters

Phase 2 native value-adds serve two purposes: App Store guideline 4.2 ("more than
a wrapper") and the camera-first North Star. The share sheet is zero-Apple-account-
dependency (no special entitlement, no permission string needed for Share). It is the
smallest native value-add that is immediately shippable.

Scope discipline: DragonShare/Deliverables "Share" buttons are Outstand social-posting
flows and are explicitly out of scope. Internal copy-to-paste actions (captions,
hashtags, reports) are also out of scope. Only the promotion "Copy Link" surfaces were
changed.

### Phase 2 status after this slice

- **A: Push notifications** — still pending.
- **B: Camera / photo-library** — shipped (2026-06-06).
- **C: Native share sheet** — shipped (2026-06-07).
- **D: Deep links** — still pending.
- Next: push + deep links, then TestFlight → submission.

---

## 2. App Privacy Data Inventory (Phase 0 App Store deliverable, shipped)

`docs/app-store/app-privacy-data-inventory.md` — source of truth for completing the
App Privacy ("nutrition label") questionnaire in App Store Connect.

### Headline findings

- **Nothing is used for tracking.** No third-party ad SDK, analytics SDK, Facebook
  pixel, or crash SDK. Analytics are first-party (Supabase `analytics_events`).
- **App Tracking Transparency (ATT) is NOT required** and no ATT prompt should be shown.
- All collected data used for App Functionality (and Analytics for usage/diagnostics).
- Most data **is linked to identity** via Supabase `user_id`.

### Data types declared as COLLECTED (~13 types)

Contact Info (Name, Email, Physical Address), Financial Info (Payment Info), Purchases
(Purchase History), User Content (Photos/Videos, Customer Support, Other), Identifiers
(User ID, Device ID for APNs), Usage Data (Product Interaction), Diagnostics
(Crash Data, Performance Data). Plus Outstand-linked social account identifiers
and post analytics under Contact Info / Usage Data.

### Third-party processors

Supabase (backend), Stripe (payments), Outstand (social), Google Maps (geocoding),
Anthropic (Donny AI, server-side only). None for advertising. Tracking: No for all.

### Decisions to confirm before submission (5)

1. Phone number — confirm not stored in any profile flow.
2. Search terms in analytics — decide whether to declare under Search History.
3. Diagnostics linkage — `user_id` attached to error/performance events; confirm.
4. Privacy contact — `privacy@dragoncandy.io` must exist and be monitored.
5. Re-audit at each new SDK.

---

## 3. Codebase Scale Correction

- **Pages: 63** (not 60 as previously recorded). The discrepancy is because the
  June 7 sync ran in a worktree before the legal pages (LegalPageLayout, PrivacyPolicy,
  TermsOfService — 3 files) landed on main via PR #28.
- **Hooks: 183** — unchanged.
- **Edge functions: 73** — unchanged.

---

## Cross-Doc Sync Performed This Session

- `docs/PROJECT_CONTEXT.md`: page count 60 → 63 on the codebase scale line (§4);
  Apple App Store workstream (§5) updated to reflect share sheet shipped (Slice C)
  and App Privacy inventory exists; "Next" updated to push + deep links.
- `docs/wiki/entities/capacitor-native-shell.md`: Phase 2 section updated (share sheet
  shipped, App Privacy inventory added, prerequisites updated).
- `docs/wiki/sources/`: new source summary page created.
- `docs/wiki/index.md` and `docs/wiki/log.md`: updated.

---

**Security reminder**: No secret values recorded here — names and locations only.
