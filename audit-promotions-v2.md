# Promotions v2 — Audit Gate (TASK-001)

**Date:** 2026-04-11
**Branch:** main (clean — no uncommitted changes in `src/` or `supabase/migrations/`)

---

## 1. Current Shape of Promotions Feature

> **Note:** The roadmap references `src/features/promotions/**` — this path does **not** exist.
> Promotions code lives under `src/components/promotions/` and `src/hooks/`.

### Components (`src/components/promotions/`)

| File | Exports |
|------|---------|
| `ActivePromotionsTab.tsx` | Default orchestrator — renders stats, promotion cards, create/edit modals |
| `PromotionCard.tsx` | Single promotion card with status badge, actions dropdown, QR dialog |
| `CreatePromotionModal.tsx` | Zod-validated form (react-hook-form) for new promotions |
| `EditPromotionModal.tsx` | Zod-validated edit form, pre-populated from existing promotion |
| `PromotionStats.tsx` | Dashboard stats card (submissions, approved, rejected, codes, redemptions) |
| `PromotionsErrorBoundary.tsx` | Error boundary wrapper |

### Hooks (`src/hooks/`)

| File | Exports |
|------|---------|
| `usePromotions.ts` | `usePromotions()` — CRUD mutations, submission review, code redemption, stats |
| `usePromotionSubmission.ts` | `usePromotionSubmission()` — customer-facing upload + dedup check |

### Pages

| File | Purpose |
|------|---------|
| `src/pages/BusinessPromotionalTools.tsx` | Business-side promotions dashboard |
| `src/pages/PromotionSubmissionPage.tsx` | Public customer submission page |

### Key Types (from `usePromotions.ts`)

```ts
Promotion { id, user_id, business_id, title, description, discount_type, discount_value, currency, start_date, end_date, max_redemptions, current_redemptions, video_max_duration, terms_conditions, qr_code_url, status, created_at, updated_at }
PromotionSubmission { id, promotion_id, customer_name, customer_email, customer_phone, video_url, video_duration, marketing_rights_accepted, status, rejection_reason, reviewed_at, reviewed_by, created_at, updated_at }
DiscountCode { id, promotion_id, submission_id, code, customer_email, customer_phone, is_redeemed, redeemed_at, redeemed_by, expires_at, email_sent, sms_sent, created_at }
CreatePromotionData { title, description?, discount_type, discount_value, currency?, start_date, end_date, max_redemptions?, video_max_duration?, accepted_content?, terms_conditions? }
```

---

## 2. Migrations Touching `promotion_submissions` and Related Tables

| Migration | What it does |
|-----------|--------------|
| `20251209163242_…` | **Creates** `promotions`, `promotion_submissions`, `discount_codes` tables + RLS policies + storage bucket |
| `20260407000000_clean_stale_data.sql` | Cleans stale data (references promotion_submissions) |
| `20260407000001_fix_promotion_videos_delete_policy.sql` | Fixes overly-permissive DELETE on `promotion-videos` storage bucket |
| `20260407000002_add_promotion_submissions_delete_policy.sql` | Adds DELETE RLS policy for business owners on `promotion_submissions` |
| `20260407000003_auto_expire_promotions.sql` | pg_cron job to auto-expire past promotions nightly |
| `20260408022845_…` | Broader RLS audit fixes (tightens promotion-videos upload to authenticated only) |

### `promotion_redemptions` — Does NOT Exist

No table, no migration, no code reference. This is a **planned** deliverable for Phase 4 (TASK-013). The current redemption tracking uses:
- `discount_codes.is_redeemed` / `redeemed_at` / `redeemed_by` — per-code redemption flag
- `promotions.current_redemptions` — counter incremented by `usePromotions.redeemCode()`

**Recommendation for Phase 4:** `promotion_redemptions` should be a new ledger table that records each redemption event (linked to `discount_codes.id`) with Toast-specific fields (`toast_event_guid`, `toast_order_id`). It must NOT replace the existing `discount_codes.is_redeemed` flag — instead, insert into `promotion_redemptions` AND update `discount_codes` in a single transaction.

---

## 3. In-Flight Changes from Prior Promotions Audit

The `20260407*` and `20260408*` migrations are from a prior P0/P1 audit and are **already committed to main**. They addressed:
- Storage DELETE policy fix (P0-1)
- Submissions DELETE RLS policy (P0-2)
- Auto-expire cron (P1-5)
- Upload auth tightening (broader RLS pass)

**No uncommitted or in-progress changes.** The prior audit is complete. No collision.

---

## 4. Donny Chat Component — Path and Mounting

| Component | Path |
|-----------|------|
| `DonnyChatSheet` | `src/components/donny/DonnyChatSheet.tsx` |
| `DonnyNavButton` | `src/components/donny/DonnyNavButton.tsx` |
| `DonnyAskBar` | `src/components/donny/DonnyAskBar.tsx` |
| `DonnyAvatar` | `src/components/donny/DonnyAvatar.tsx` |
| `DonnyMessage` | `src/components/donny/DonnyMessage.tsx` |
| `DonnyQuickChips` | `src/components/donny/DonnyQuickChips.tsx` |
| `DonnyRichCard` | `src/components/donny/DonnyRichCard.tsx` |
| `DonnyTypingIndicator` | `src/components/donny/DonnyTypingIndicator.tsx` |
| `DonnyCard` | `src/components/donny/DonnyCard.tsx` |

**Current mounting:** `DonnyChatSheet` is imported and rendered inside `src/components/MobileBottomNav.tsx`. It opens as a bottom sheet (`Sheet` from shadcn/ui) triggered via the nav. Uses `useDonny()` hook for chat state/streaming.

**Phase 8 impact (TASK-025/026):** The roadmap plans a `DonnyDock.tsx` as a floating portal (`fixed bottom-4 right-4 z-50`) mounted in `App.tsx`. This would be a **second** entry point to Donny — either it reuses `DonnyChatSheet` internally or replaces the nav button on desktop. No collision as long as both share the same `useDonny()` hook instance (already context-based).

---

## 5. Collision Risk Triage

| Risk | Severity | Description |
|------|----------|-------------|
| `src/features/promotions/` does not exist | **WARN** | Roadmap references this path but code lives in `src/components/promotions/` + `src/hooks/`. Either move files to match roadmap or update roadmap paths. Recommend updating roadmap — moving files risks Lovable sync breakage. |
| `promotion_redemptions` table missing | **WARN** | Planned for Phase 4. No code depends on it yet. Phase 1-3 can proceed. Phase 4 migration must not conflict with existing `discount_codes` redemption tracking. |
| `unique_customer_per_promotion` constraint on `promotion_submissions` | **WARN** | Current constraint blocks resubmission after rejection. Recent commit `326fa1d` added resubmission logic — verify the constraint was relaxed or the flow handles it (uses status filter: `in('status', ['pending', 'approved'])`). Toast webhook redemptions (Phase 4) will not touch this table. OK. |
| `promotions.current_redemptions` counter vs future `promotion_redemptions` ledger | **WARN** | Two sources of truth after Phase 4. Plan: ledger is authoritative; counter becomes a denormalized cache updated by trigger or edge function. Document this in TASK-013. |
| TASK-004 adds `social_handles jsonb` to `promotion_submissions` | **OK** | Additive nullable column. No collision with existing code — current code doesn't SELECT it. |
| TASK-011 hooks into `usePromotionMutations.ts` (doesn't exist) | **WARN** | Roadmap references `src/features/promotions/hooks/usePromotionMutations.ts`. Actual mutation logic is in `usePromotions.ts`. Either extract mutations into a new file at that path or update roadmap. |
| DonnyDock (Phase 8) vs existing MobileBottomNav integration | **OK** | Separate entry points; shared hook. No conflict as long as `useDonny()` remains a singleton context. |
| pg_cron already enabled (auto-expire) | **OK** | TASK-008 plans another pg_cron job for token refresh. Extension already enabled — no migration conflict. |
| Toast OAuth tables (Phase 1) | **OK** | Entirely new tables (`toast_connections`, `toast_sync_events`). No overlap with existing schema. |
| Prior audit migrations already on main | **OK** | Fully committed and deployed. No lingering state. |

### Summary

- **BLOCKERs:** None
- **WARNs:** 4 (path mismatch, missing table planned for later, dual redemption tracking, hook file naming)
- **OK:** 5

All WARN items are addressable within their respective task phases. No blockers to proceeding with Phase 1.
