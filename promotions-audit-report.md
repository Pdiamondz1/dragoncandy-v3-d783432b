# Promotions Feature — End-to-End Audit Report

**Date:** 2026-04-07
**Phase:** 1 of 2 (Read-Only Audit)
**Scope:** Business/Restaurant role — Promotional Tools feature
**Auditor:** Claude Code (static analysis only)

---

## 1. DEFINITIONAL FINDING

**Promotions is a QR-code-based video-for-discount system** aimed at restaurant/business clients. A business creates a time-limited promotion offering a discount (percentage or fixed amount). The business generates a QR code that links to a public submission page (`/promo/:promotionId`). Walk-in customers scan the QR code, record or upload a short video testimonial, submit their contact info, and receive a discount code via email/SMS after the business owner reviews and approves the video.

**This is NOT a rename of Campaigns.** Promotions and Campaigns are entirely separate features with their own tables, UI, routes, and business logic. Campaigns connect businesses with content creators for paid collaborations. Promotions connect businesses with walk-in customers for user-generated video testimonials in exchange for discounts.

**Confidence:** HIGH. Separate DB migration, separate tables (`promotions`, `promotion_submissions`, `discount_codes`), separate route (`/dashboard/business/promotions`), separate edge function (`send-promotion-notification`), separate storage bucket (`promotion-videos`).

---

## 2. FILE / ROUTE / DB / STORAGE INVENTORY

### Routes

| Route | Component | Auth | Purpose |
|-------|-----------|------|---------|
| `/dashboard/business/promotions` | `BusinessPromotionalTools` | ProtectedRoute + BusinessRoute | Business management hub |
| `/promo/:promotionId` | `PromotionSubmissionPage` | **None (public)** | Customer-facing submission wizard |

### Pages

| File | Lines |
|------|-------|
| `src/pages/BusinessPromotionalTools.tsx` | 100 |
| `src/pages/PromotionSubmissionPage.tsx` | 300 |

### Components (`src/components/promotions/`)

| File | Lines | Purpose |
|------|-------|---------|
| `ActivePromotionsTab.tsx` | 150 | List/manage active & draft promotions |
| `CreatePromotionModal.tsx` | 266 | Form dialog to create a promotion |
| `EditPromotionModal.tsx` | 266 | Form dialog to edit a promotion |
| `PromotionCard.tsx` | 274 | Card with QR, stats, pause/resume/delete |
| `PromotionStats.tsx` | 81 | Stats dashboard (submissions, approval rate, redemptions) |
| `PendingReviewsTab.tsx` | 61 | List pending video submissions for review |
| `SubmissionCard.tsx` | 160 | Individual submission with approve/reject actions |
| `ApprovedVideosTab.tsx` | 258 | Approved/rejected videos with download |
| `VerifyCodesTab.tsx` | 155 | Search/verify/redeem discount codes |
| `CustomerInfoForm.tsx` | 155 | Customer info form (name, email, phone, marketing consent) |
| `VideoUploader.tsx` | 339 | Camera recording + file upload for customers |

### Hooks

| File | Purpose |
|------|---------|
| `src/hooks/usePromotions.ts` | All CRUD operations, queries, mutations |
| `src/hooks/usePromotionSubmission.ts` | Customer-side video upload + submission |
| `src/hooks/useSignedVideoUrl.ts` | Generate signed URLs for video playback |

### Database Tables

| Table | Columns | RLS |
|-------|---------|-----|
| `promotions` | id, business_id (FK), user_id, title, description, discount_type, discount_value, currency, start_date, end_date, max_redemptions, current_redemptions, video_max_duration, qr_code_url, terms_conditions, status, created_at, updated_at | Yes |
| `promotion_submissions` | id, promotion_id (FK), customer_name, customer_email, customer_phone, video_url, video_duration, marketing_rights_accepted, status, rejection_reason, reviewed_at, reviewed_by, created_at, updated_at | Yes |
| `discount_codes` | id, promotion_id (FK), submission_id (FK), code, customer_email, customer_phone, is_redeemed, redeemed_at, redeemed_by, expires_at, email_sent, sms_sent, created_at | Yes |

### RLS Policies

| Table | Policy | Operation | Condition |
|-------|--------|-----------|-----------|
| `promotions` | Business owners can manage their promotions | ALL | `user_id = auth.uid()` |
| `promotions` | Public can view active promotions | SELECT | `status = 'active' AND date range valid` |
| `promotion_submissions` | Business owners can view submissions | SELECT | Join to promotions where `user_id = auth.uid()` |
| `promotion_submissions` | Business owners can update submissions | UPDATE | Join to promotions where `user_id = auth.uid()` |
| `promotion_submissions` | Anyone can submit to active promotions | INSERT | Join to promotions where active + date valid + under max |
| `promotion_submissions` | **NO DELETE POLICY** | DELETE | **MISSING** |
| `discount_codes` | Business owners can view and manage codes | ALL | Join to promotions where `user_id = auth.uid()` |

### Storage

| Bucket | Public | Size Limit | Purpose |
|--------|--------|------------|---------|
| `promotion-videos` | Yes (public) | 50MB | Customer video uploads |

Storage Policies:
- Anyone can upload (no auth check)
- Anyone can view (no auth check)
- Authenticated users can delete (only checks `auth.uid() IS NOT NULL` — **not scoped to owner**)

### Edge Functions

| Function | Purpose | External APIs |
|----------|---------|---------------|
| `supabase/functions/send-promotion-notification/index.ts` | Send approval/rejection notifications | Resend (email), Twilio (SMS) |

### Navigation Entry Points

- Business sidebar nav: QrCode icon → "Promotions" → `/dashboard/business/promotions`
- AI assistant (Donny): Mentions promotions in greeting and quick actions

---

## 3. FLOW-BY-FLOW ANALYSIS

### FLOW 1 — Browse / List Promotions

**Path:** `BusinessPromotionalTools` → `ActivePromotionsTab` → `usePromotions().promotions`

**How fetched:** Direct Supabase query on `promotions` table filtered by `user_id = auth.uid()` via RLS. No pagination — fetches all promotions for the user.

**Issues:**
- **Empty state:** Handled — shows QrCode icon + "Create your first promotion" CTA. GOOD.
- **Loading state:** Handled — skeleton cards shown. GOOD.
- **Error state:** NOT handled. If the query throws, React Query's `retry` will attempt 2 retries, but after that the user sees **nothing** — no error message, no retry button. The `isLoading` flag will be false and `promotions` will be undefined, causing the empty state to show, which is misleading (says "no promotions" when there might be a network error).
- **No pagination:** All promotions loaded at once. Acceptable for pre-launch but will need pagination if businesses create many promotions.
- **RLS:** Properly scoped to `user_id = auth.uid()`. Business A cannot see Business B's promotions. GOOD.

### FLOW 2 — Create a Promotion

**Path:** "Create Promotion" button → `CreatePromotionModal` → `usePromotions().createPromotion`

**Trigger:** Button in `ActivePromotionsTab` header.
**UI:** Modal dialog (600px, scrollable).
**Form type:** Single form (not wizard).

**Required fields:** title (min 3 chars), discount_type, discount_value (min 1), start_date, end_date.
**Optional fields:** description, max_redemptions, video_max_duration (default 30), terms_conditions.

**Issues:**
- **No end_date > start_date validation on client.** The DB has a CHECK constraint (`end_date >= start_date`) that will catch it, but the user gets a generic "Failed to create promotion" toast instead of a clear field-level error. (`CreatePromotionModal.tsx` — Zod schema has no cross-field validation.)
- **No past-date validation on start_date.** User can create a promotion starting yesterday.
- **Status set to `'active'` on creation** (`usePromotions.ts:245`), bypassing the `'draft'` default in the DB schema. This means there is no draft → active workflow despite the UI having draft sections. The UI code in `ActivePromotionsTab` filters for `'draft'` status but `createPromotion` never creates drafts.
- **Error handling:** Mutation has `onError` toast. GOOD. But `CreatePromotionModal.onSubmit` calls `mutateAsync()` without try/catch — if the mutation rejects, the form won't reset but the modal stays open. Error is shown via toast from the hook's `onError`. Acceptable but not ideal.
- **File upload:** Not involved in creation. GOOD (no upload crash risk here).
- **Currency:** Hardcoded to `'USD'` in the hook. Not exposed in UI. Fine for US launch but not internationalized.

### FLOW 3 — Edit a Promotion

**Path:** PromotionCard dropdown → "Edit" → `EditPromotionModal` → `usePromotions().updatePromotion`

**Issues:**
- **start_date is not editable** — good, prevents changing dates on active promotions.
- **No permission check beyond RLS.** The client doesn't verify ownership before calling update. RLS enforces `user_id = auth.uid()`, so a crafted request from another user would be rejected by RLS. GOOD.
- **No status-based editability.** Expired promotions CAN be edited (e.g., change title, extend end_date). This might be intentional but should be confirmed.
- **Unsafe date parsing:** `promotion.end_date.split('T')[0]` (`EditPromotionModal.tsx:83`) — assumes ISO format. If the DB returns a date-only string (which it might for a `DATE` column), the split on `'T'` will return the full string, which is fine. Low risk.

### FLOW 4 — Publish / Activate a Promotion

**There is no draft → active workflow in practice.** Despite:
- The DB schema defining `status DEFAULT 'draft'`
- The UI code filtering and displaying drafts separately
- `PromotionCard` showing a "Publish" button for drafts

...the `createPromotion` mutation **hardcodes `status: 'active'`**, meaning promotions are never created as drafts. The draft UI section will always be empty.

**Issues:**
- **Dead code:** The entire draft section in `ActivePromotionsTab` (lines ~100-120) and the "Publish" button in `PromotionCard` are unreachable under normal usage.
- **No Stripe integration.** Promotions are free to create. No payment required.
- **No Donny AI integration.** No AI-generated copy for promotions.
- **No creator notification.** Promotions don't surface on the creator side.

### FLOW 5 — View Promotion Detail / Analytics

**Path:** `PromotionStats` component in `ActivePromotionsTab`

**Metrics shown:** Total submissions, approval rate (with progress bar), codes generated, redemption rate.

**Issues:**
- **Stats are real, not placeholder.** They compute from actual data via `usePromotions().stats`. GOOD.
- **Division by zero guarded.** Both rate calculations check for zero denominator. GOOD.
- **No per-promotion detail view.** Stats are aggregate across all promotions. There's no way to see stats for a single promotion.
- **No error handling in PromotionStats.** If `stats` is undefined/null, the component will crash (accesses `stats.totalSubmissions` etc. directly).

### FLOW 6 — Expire / Delete / Archive a Promotion

**Expiration:**
- **No auto-expire mechanism.** No cron job, no edge function, no scheduled task. Expired promotions stay with `status: 'active'` in the DB. The `PromotionCard` computes `isExpired` client-side from `end_date`, but the `status` column is never updated to `'expired'`.
- The public submission page (`PromotionSubmissionPage`) correctly checks dates client-side AND the RLS INSERT policy checks `end_date >= CURRENT_DATE`. So expired promotions cannot accept new submissions. But the business dashboard will show them as "Expired" via client-side badge while the DB still says "active".
- The `PromotionCard` allows pause/resume on expired promotions — this is confusing UX.

**Deletion:**
- `usePromotions().deletePromotion` does manual cascade: delete discount_codes → delete submissions → delete promotion.
- **Bug:** `promotion_submissions` has no RLS DELETE policy. The `supabase.from('promotion_submissions').delete()` call will silently return success with 0 rows deleted. However, the subsequent `promotions` delete triggers FK cascade (`ON DELETE CASCADE`), which operates at the Postgres level (bypasses RLS), so submissions and codes ARE cleaned up. The manual pre-deletion is redundant but harmless.
- **Confirmation dialog:** Present in `PromotionCard` with AlertTriangle icon. GOOD.
- **Hard delete.** No soft delete / archive mechanism.

### FLOW 7 — Promotion → Creator Discovery Loop

**Promotions do NOT surface on the creator side.** They are entirely business-to-customer (walk-in). Creators never see or interact with promotions. This is by design — confirmed by the public `/promo/:promotionId` route targeting customers, not platform users.

### FLOW 8 — Mobile Viewport

- `BusinessPromotionalTools`: Has `overflow-x-hidden`, `pb-24 md:pb-0`, responsive grid. GOOD.
- Tab labels use `hidden sm:inline` with short fallback. GOOD.
- `PromotionSubmissionPage`: `max-w-md mx-auto`, responsive. GOOD.
- `VideoUploader`: Grid layout adapts. Camera/upload buttons stack. GOOD.
- `PromotionCard`: Long content could overflow on very narrow screens. The dropdown menu and QR modal should be tested at 375px.
- **Bottom nav overlap:** `pb-24` padding on main container accounts for bottom nav. GOOD.

---

## 4. TRIAGED BUG LIST

### P0 — Blocks Launch

| # | Issue | File:Line | Fix | Effort |
|---|-------|-----------|-----|--------|
| P0-1 | **Storage DELETE policy too permissive** — Any authenticated user can delete ANY file in `promotion-videos` bucket. Policy checks `auth.uid() IS NOT NULL` but doesn't verify the file belongs to the user. A malicious authenticated user could delete another business's customer videos. | `supabase/migrations/...sql:166-170` | Add path-based or metadata-based ownership check to the storage DELETE policy. | S |
| P0-2 | **No RLS DELETE policy on `promotion_submissions`** — Client-side delete call silently fails. While FK CASCADE handles cleanup when the promotion itself is deleted, a business owner cannot independently delete a single submission (e.g., to remove inappropriate content). | `supabase/migrations/...sql` (missing) | Add DELETE policy matching the SELECT pattern (join to promotions where `user_id = auth.uid()`). | S |
| P0-3 | **Public submission page: `handleInfoSubmit` doesn't handle non-duplicate failure** — If `submitPromotion` returns `{ success: false, reason: 'error' }`, the step state stays on `'info'` and the user is stuck. The toast fires but the UI doesn't transition to error state. | `src/pages/PromotionSubmissionPage.tsx:120-126` | Add `else { setStep('error'); }` for the generic error case. | S |
| P0-4 | **`usePromotionSubmission` uses `getPublicUrl` on a public bucket for the DB record, but `useSignedVideoUrl` tries to create signed URLs** — If the bucket is public (it is: `public: true` in migration), `getPublicUrl` returns a URL that doesn't need signing. But `useSignedVideoUrl` calls `createSignedUrl()`, which may fail on a public bucket or return a different URL. This creates a mismatch: the stored URL is a public URL, but playback tries to generate a signed URL. The fallback (`setSignedUrl(videoUrl)`) saves it, but this is fragile. | `src/hooks/useSignedVideoUrl.ts:30-34` + `src/hooks/usePromotionSubmission.ts:72-74` | Either make the bucket private (recommended for customer videos) and always use signed URLs, or remove the signed URL logic and use public URLs directly. | M |

### P1 — Should Fix Before Launch

| # | Issue | File:Line | Fix | Effort |
|---|-------|-----------|-----|--------|
| P1-1 | **No error state on promotions list fetch** — If the Supabase query fails after retries, the user sees "Create your first promotion" empty state instead of an error message. | `src/components/promotions/ActivePromotionsTab.tsx` | Add `isError` from usePromotions and show an error card with retry button. | S |
| P1-2 | **Draft status is dead code** — `createPromotion` hardcodes `status: 'active'`, making the draft section in `ActivePromotionsTab` and the "Publish" button in `PromotionCard` unreachable. | `src/hooks/usePromotions.ts:245` | Either change to `status: 'draft'` (with explicit publish flow) or remove draft UI code. Product decision needed. | M |
| P1-3 | **No end_date > start_date validation in Create modal** — DB CHECK catches it but user gets a generic error toast instead of field-level guidance. | `src/components/promotions/CreatePromotionModal.tsx` (Zod schema) | Add `.refine()` to Zod schema comparing dates. | S |
| P1-4 | **No past-date validation on start_date** — User can create promotions starting in the past. | `src/components/promotions/CreatePromotionModal.tsx` (Zod schema) | Add min-date validation to Zod schema. | S |
| P1-5 | **No auto-expire mechanism** — Promotions stay `status: 'active'` in DB after end_date passes. Client-side date check masks this. Dashboard stats may count expired promotions as active. | N/A (missing) | Add a Supabase cron/scheduled function or a DB trigger to set `status = 'expired'` when `end_date < CURRENT_DATE`. | M |
| P1-6 | **`PromotionStats` will crash if `stats` is null/undefined** — No defensive check on the props. | `src/components/promotions/PromotionStats.tsx` | Add default values or null guard. | S |
| P1-7 | **`ApprovedVideosTab` has unused `supabase` import** — Dead code. | `src/components/promotions/ApprovedVideosTab.tsx` | Remove import. | S |
| P1-8 | **Video download silently fails** — `handleDownload` in `ApprovedVideosTab` catches errors with `console.error` but shows no user feedback. | `src/components/promotions/ApprovedVideosTab.tsx:43-47` | Add toast on download error. | S |
| P1-9 | **Video download assumes `.mp4` extension** — Hardcoded regardless of actual format (could be `.webm` from in-browser recording). | `src/components/promotions/ApprovedVideosTab.tsx:38` | Extract extension from URL or video MIME type. | S |
| P1-10 | **`VerifyCodesTab` has no error feedback for failed redemption** — `redeemCode.mutateAsync()` is called without try/catch in the local handler. The hook's `onError` shows a toast, but if the async call rejects, the `finally` block still clears the input, losing context. | `src/components/promotions/VerifyCodesTab.tsx:24-32` | Add try/catch around `redeemCode.mutateAsync()` and keep input value on error. | S |
| P1-11 | **No ErrorBoundary specific to Promotions routes** — Only the top-level App ErrorBoundary catches crashes. A crash in any Promotions component takes down the entire app UI. | `src/App.tsx:276-282` | Wrap the Promotions route in a dedicated ErrorBoundary (same pattern as `ReviewsErrorBoundary` or `BrowseCreatorsErrorBoundary`). | S |
| P1-12 | **`PromotionCard` redemption warning has potential null arithmetic** — `promotion.max_redemptions * 0.8` when `max_redemptions` is null gives `NaN`, and the comparison `>= NaN` is always false. Not a crash, but the warning will never show for promotions without a max. | `src/components/promotions/PromotionCard.tsx:~106` | Guard with `promotion.max_redemptions != null` check. | S |
| P1-13 | **Discount code generation is client-side** — `generateDiscountCode()` in `usePromotions.ts` generates an 8-char alphanumeric code using `Math.random()`. This is not cryptographically secure and has a collision risk (though mitigated by the UNIQUE constraint in DB). If a collision occurs, the INSERT fails and the user gets a generic error. | `src/hooks/usePromotions.ts:497-504` | Move code generation to a DB function or edge function using `gen_random_uuid()` or crypto-safe randomness. | M |
| P1-14 | **Pause/Resume buttons visible on expired promotions** — `PromotionCard` shows Pause/Resume based on `isActive`/`isPaused` flags, but since `status` never updates to `'expired'`, an expired promotion with `status: 'active'` will show the Pause button. Pausing an expired promotion is confusing. | `src/components/promotions/PromotionCard.tsx` | Check `isExpired` before showing Pause/Resume. | S |

### P2 — Post-Launch

| # | Issue | File:Line | Fix | Effort |
|---|-------|-----------|-----|--------|
| P2-1 | **No pagination on promotions list or discount codes table** — Will degrade with scale. | Multiple files | Add pagination or infinite scroll. | M |
| P2-2 | **QR code depends on external API** (`api.qrserver.com`) — No fallback if the service is down. QR is generated on-the-fly in the modal. | `src/components/promotions/PromotionCard.tsx` | Generate QR codes client-side with a library (e.g., `qrcode`) or cache server-side. | M |
| P2-3 | **Video duration is approximated from file size** — `Math.min(30, Math.ceil(data.videoFile.size / (1024 * 1024) * 10))`. This is wildly inaccurate. A 5MB video could be 10 seconds or 60 seconds depending on codec/resolution. | `src/hooks/usePromotionSubmission.ts:77` | Use the HTML5 Video API to read actual duration before upload. | S |
| P2-4 | **Phone validation too permissive** — Only checks length >= 10. Accepts any string of that length. | `src/components/promotions/CustomerInfoForm.tsx` | Add regex for common phone formats or use a library like `libphonenumber`. | S |
| P2-5 | **Hardcoded colors in several components** — `green-600`, `green-500`, `red-600`, `yellow-600` used outside the design system tokens. | Multiple files | Replace with design system tokens or Tailwind theme extensions. | S |
| P2-6 | **No keyboard accessibility audit done** — Interactive elements (approve/reject, QR modal, video preview) need keyboard testing. | Multiple files | Manual accessibility testing needed. | M |
| P2-7 | **Memory leak potential in `VideoUploader`** — `URL.createObjectURL()` called without corresponding `URL.revokeObjectURL()` cleanup. | `src/components/promotions/VideoUploader.tsx:113,167` | Add cleanup in `resetVideo` and component unmount. | S |
| P2-8 | **`console.log` / `console.error` statements throughout** — Debug logging left in production code. | Multiple files | Remove or gate behind `import.meta.env.DEV`. | S |
| P2-9 | **No per-promotion stats view** — Business can only see aggregate stats, not performance of individual promotions. | `src/components/promotions/PromotionStats.tsx` | Add per-promotion analytics (click through from PromotionCard). | L |
| P2-10 | **SMS only sent for approvals, not rejections** — Customers who are rejected only get an email, not an SMS. Inconsistent notification channels. | `supabase/functions/send-promotion-notification/index.ts:173` | Add SMS for rejections or document as intentional. | S |
| P2-11 | **US phone number assumption** — Twilio phone formatting assumes US numbers (prepends `1` for 10-digit numbers). | `supabase/functions/send-promotion-notification/index.ts:188-189` | Support international numbers or document US-only. | M |

---

## 5. ROOT-CAUSE PATTERNS

### Pattern A: Missing Error States
Multiple components (`ActivePromotionsTab`, `PendingReviewsTab`, `VerifyCodesTab`, `PromotionStats`) have loading and empty states but **no error states**. This is the same pattern that caused blank-screen crashes elsewhere in the app. If a Supabase query fails, the user sees either nothing or a misleading empty state.

**Affects:** P1-1, P1-6, P1-8, P1-10

### Pattern B: Status Column Drift
The `promotions.status` column is never updated after creation. `createPromotion` hardcodes `'active'`, and no mechanism transitions to `'expired'` or `'completed'`. The UI compensates with client-side date checks, creating a divergence between DB state and displayed state.

**Affects:** P1-2, P1-5, P1-14

### Pattern C: Client-Side Logic That Should Be Server-Side
Discount code generation, video duration estimation, and status computation all happen client-side where they're unreliable or insecure.

**Affects:** P1-13, P2-3, Pattern B

### Pattern D: No Route-Level ErrorBoundary
Campaigns/Creators have dedicated ErrorBoundaries. Promotions does not. One crash in any Promotions component takes down the entire app.

**Affects:** P1-11

---

## 6. OPEN QUESTIONS

| # | Question | Why It Matters |
|---|----------|----------------|
| Q1 | **Should promotions start as drafts or active?** The DB defaults to `'draft'` but the code forces `'active'`. Is the draft workflow desired for launch? | Determines whether to fix the code or remove the draft UI (P1-2). |
| Q2 | **Should the `promotion-videos` bucket be private?** Currently public — anyone with the URL can view customer videos. Is this acceptable for customer privacy/marketing rights? | P0-4 fix depends on this decision. |
| Q3 | **Are Resend and Twilio credentials configured in Supabase Edge Function secrets?** If not, all email/SMS notifications silently skip. | Core feature (discount code delivery) depends on these being set up. |
| Q4 | **Is there a plan for promotion expiration?** Auto-expire via cron, or manual-only? | Determines scope of P1-5. |
| Q5 | **Should expired promotions be editable?** Currently they can be edited (extend end_date, change title). Is this intentional? | UX decision for P1-14. |
| Q6 | **Is the customer duplicate check (one submission per email per promotion) sufficient?** A customer could submit with a different email and same phone, or vice versa. The DB UNIQUE constraint is only on `(promotion_id, customer_email)`. | Potential abuse vector. |
| Q7 | **Who handles the QR code printing/distribution?** The feature generates a QR in-app but there's no export-to-PDF or print-ready format. | UX completeness for restaurants wanting table tents or signage. |

---

## END OF AUDIT

**Next step:** Approve which P0/P1 items to fix in Phase 2. I recommend fixing all P0s and P1-1 through P1-5 as the minimum pre-launch set.
