# CGC Campaigns Optimization Design

> Redesign of the Customer Generated Content Campaigns feature to reduce
> friction for restaurants and customers, close the social media posting
> loop, and deliver on the "less typing = more margin" North Star.

## 1. Problem Statement

The CGC Campaigns feature lets restaurants create QR-based promotions that
incentivize customers to record video/photo content in exchange for
discount codes. The core value proposition is sound — restaurants need
social content, customers want discounts, and authentic UGC outperforms
brand-created content. But the current implementation creates work instead
of removing it.

**Current pain points:**

- **Creation overhead:** 7+ form fields to launch a promotion when most
  restaurants would accept sensible defaults.
- **Customer friction:** 5-step submission flow with 6+ form fields for
  someone mid-meal who just wants a quick discount.
- **Disconnected social posting:** Approved content auto-drafts a post via
  `fire-promotion-social-hook`, but the draft lands in
  `donny_scheduled_posts` where the restaurant never finds it. The value
  chain breaks at the last mile.
- **Review tedium:** Card-by-card approval with no batch operations and no
  connection to the social posting outcome.

**Competitive context:** Sauce, Clip, and Testimonial.to have trended
toward auto-approval with quality filtering and one-tap social posting from
the approval screen. DragonCandy's differentiator is the integrated social
posting system via Outstand — but only if the loop actually closes.

## 2. Strategic Positioning

CGC Campaigns is a **complementary tool** to the creator marketplace, not a
replacement. The creator marketplace connects restaurants with professional
content creators for high-quality, campaign-driven content. CGC Campaigns
gives restaurants a free/cheap way to generate authentic customer content
at volume. Both stay. Different use cases, different value.

CGC feeds DragonCandy's data flywheel: every submission, approval, and
social post generates signal that improves Donny's matching and
recommendations over time.

## 3. Design Overview

Apply Musk's Algorithm to the entire CGC flow:

1. **Delete** unnecessary fields, tabs, and disconnected flows
2. **Simplify** creation to 3 fields, submission to 3 steps, dashboard
   to 2 tabs
3. **Accelerate** the full cycle from ~10 minutes to ~3 minutes
4. **Automate** social posting on approval with saved preferences

### 3.1 Simplified Promotion Creation

**Current:** `CreatePromotionModal` with 7+ fields — title, description,
discount type/value, start date, end date, max redemptions, video max
duration, accepted content type, terms & conditions.

**New:** 3 required fields with smart defaults.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| Discount value | Number + toggle (% / $) | Yes | — |
| Title | Text (auto-suggested from discount) | Yes | "Get {X}% Off Your Next Visit" |
| Duration | Chip selector (1wk / 2wk / 1mo / custom) | Yes | 2 weeks |

Everything else gets smart defaults:

| Field | Default | Access |
|-------|---------|--------|
| Content type | Both video + photo | Advanced expandable |
| Max video duration | 60 seconds | Advanced expandable |
| Max redemptions | Unlimited | Advanced expandable |
| Terms & conditions | Standard template | Advanced expandable ("Edit terms") |
| Start date | Today | Advanced expandable |
| End date | Derived from duration selection | Advanced expandable |
| Description | null (title is sufficient) | Advanced expandable |

The "Advanced settings" expandable contains all removed fields for power
users. It is collapsed by default.

**Keystroke reduction:** ~50 → ~10 (80% reduction).

### 3.2 Camera-First Customer Submission

**Current:** Welcome → camera/upload → name + email + phone + social
handles + marketing consent → submit. Five steps, 6+ fields.

**New:** Three steps, one required field.

**Step 1 — Welcome splash (auto-advances or one tap):**
Restaurant logo + "Record your experience → Get {X}% OFF" + big teal
"Record" button. "Upload a photo/video instead" link below. Promotion
details accessible via "Details" link, not blocking the path.

**Step 2 — Camera opens on tap:**
Front/back camera toggle, countdown timer (max duration), record button.
Upload: file picker. After capture: instant preview with "Use this" /
"Retake." No navigation away from the flow.

**Step 3 — Email + submit:**
Single required field: email address (for discount code delivery). Below
it, collapsed: name (optional), phone (optional). Marketing consent as
pre-checked checkbox with terms link. "Submit & Get Your Discount" button.

**Post-submission success screen:**
"Your video is being reviewed! You'll get your discount code at {email}
shortly." Below: "Want to be featured on {Restaurant}'s social media?
Share your handle:" — optional Instagram/TikTok/X input. Social handle
collection moves here, after commitment, when completion psychology favors
optional fields (expected 30-40% fill rate vs. near-zero from abandonment).

**Database impact:** Requires migration. `customer_name` and
`customer_phone` are currently `NOT NULL` on `promotion_submissions`.
Making them optional in the UI requires:

```sql
ALTER TABLE promotion_submissions ALTER COLUMN customer_name DROP NOT NULL;
ALTER TABLE promotion_submissions ALTER COLUMN customer_phone DROP NOT NULL;
```

Additionally, `discount_codes.customer_phone` is `NOT NULL`. The approval
flow in `reviewSubmission` passes `submission.customer_phone` to the
`discount_codes` insert. Two cascading changes required:

1. `discount_codes.customer_phone` must also become nullable:
   ```sql
   ALTER TABLE discount_codes ALTER COLUMN customer_phone DROP NOT NULL;
   ```
2. `send-promotion-notification` must handle null/empty phone gracefully
   — skip SMS delivery when phone is absent (the edge function already
   skips SMS when Twilio keys are missing; add the same guard for null
   phone).

**Marketing consent note:** The spec describes a pre-checked checkbox.
Pre-checked consent has legal implications under GDPR and some US state
privacy laws. Flag for legal review before implementation. Alternative:
keep the checkbox unchecked by default but with simplified single-line
copy ("I agree to let {Restaurant} use my content").

**Deduplication adjustment:** Currently checks email + phone per promotion.
With phone optional, deduplicate by email + promotion_id only.

**Submission target:** Under 45 seconds from QR scan.

### 3.3 Unified Approve-and-Post Flow

**Current:** Approve submission → discount code generated + email/SMS
sent → separately, `fire-promotion-social-hook` creates a draft in
`donny_scheduled_posts` → restaurant must find draft in a different part
of the app. Two disconnected flows.

**New:** Approve and social post are one unified action on one screen.

When a restaurant taps a pending submission, a **review sheet** opens
(bottom sheet on mobile, side panel on desktop) with three zones:

**Zone 1 — Content Preview (top):**
Full-width video/photo preview. Customer name and email. Timestamp.

**Zone 2 — Social Post Editor (middle, conditional):**
Only appears if the restaurant has at least one Outstand account connected.
Pre-populated with:

- AI-generated caption (editable, 2-3 lines) via `social-caption`
- Hashtags (editable, auto-generated, always includes #DragonDashed)
- Platform chips showing ONLY connected accounts (e.g., X and Facebook
  for Harbormill) — all pre-selected, tap to deselect
- Schedule toggle: "Post now" (default) or "Schedule for best time"
  (shows suggested time from `donny-schedule`, editable)

If no Outstand accounts connected, Zone 2 becomes:

- "Download video" button (primary action)
- "Copy caption" button (copies AI-generated caption to clipboard)
- Subtle link: "Connect social accounts to auto-post →" (Settings)

**Zone 3 — Actions (bottom, sticky):**

With Outstand connected:

- **"Approve & Post"** (primary teal) — approves, generates code, sends
  notification, posts/schedules to selected platforms. One tap.
- **"Approve Only"** (secondary outline) — approves without posting.
- **"Reject"** (text link) — opens reason input, then rejects.

Without Outstand:

- **"Approve & Download"** (primary teal)
- **"Approve Only"** (secondary outline)
- **"Reject"** (text link)

**Batch review mode:**
When multiple submissions are pending, the review sheet supports
navigation between submissions.

- **Desktop (side panel):** Horizontal swipe or arrow buttons to navigate
  between submissions. Approve/reject via buttons.
- **Mobile (bottom sheet):** Button-based navigation only (prev/next
  arrows). No horizontal swipe gestures — these conflict with the bottom
  sheet's vertical dismiss gesture and cause UX ambiguity. Approve/reject
  via the Zone 3 buttons.

Counter: "3 of 7 pending." Batch mode inherits social settings from the
first review — subsequent approvals reuse the same platforms and timing.
Tap into any submission to customize before approving.

**Platform awareness:** Social posting targets ONLY the platforms the
restaurant has connected via Outstand. If Harbormill connected X and
Facebook, those are the only chips shown. Per-platform scheduling is
supported (X at 8am, Facebook at noon) via `donny-schedule` suggestions.

### 3.4 Redesigned Dashboard

**Current:** Green banner + 2 stat cards + 4 tabs (Promotions, Pending,
Videos, Codes).

**New:** Action-first layout with 2 tabs.

**Priority Banner (conditional):**
Only appears when pending submissions exist. "You have {N} videos to
review" + "Review Now" button → opens review sheet. Disappears
when queue is empty.

**Stats Row (3 cards):**

| Card | Content | Action |
|------|---------|--------|
| Pending | Count | "Review" link → review sheet |
| Approved | Count | "View library" link |
| Posted to Social | Count + platform icons | Query: `donny_scheduled_posts` WHERE `metadata->>'source' = 'promotion'` AND `status = 'published'`, grouped by platform. Uses `idx_donny_scheduled_posts_promotion` index. |

**Two tabs:**

- **Promotions** — Active/paused/expired promotions with QR codes.
  Simplified cards: title, discount, dates, submission count, share button.
- **Content Library** — Merges Pending + Videos + Codes into one
  filterable view. Filter chips: All / Pending / Approved / Rejected /
  Posted. Each card: thumbnail, customer name, status badge, social post
  status, discount code. Tapping opens review sheet (pending) or detail
  view (approved/rejected).

Code verification moves to a search bar at the top of Content Library:
"Enter code to verify."

**Empty state:**
"Turn your customers into content creators. They record, you approve, it
posts to your social media automatically." + "Create Your First Promotion"
button.

### 3.5 Auto-Post Configuration

A lightweight preferences layer. Set once, apply to all approvals, override
per-submission when needed.

**Surfaces in two places:**

1. **First-time inline** — First approval with connected social accounts
   shows a dismissible callout: "These will be your default posting
   settings for future approvals." Setup disguised as action.

2. **Settings page** — "CGC Auto-Post Preferences" card:
   - Default platforms (checkboxes per connected account, all selected)
   - Default timing ("Post immediately" / "Schedule for optimal time")
   - Default caption style ("AI-generated" / "Custom template" with merge
     tags: `{{customer_name}}`, `{{restaurant_name}}`, `{{discount}}`)
   - Auto-post master toggle (ON = "Approve & Post" is primary button,
     OFF = "Approve Only" is primary)

**How defaults interact with review sheet:**
Preferences pre-populate the social editor. If auto-post ON, one-tap
approval posts with all defaults. Everything editable per-submission.
Defaults reduce keystrokes but never remove control.

**Storage:** New nullable JSONB column on `business_profiles`:

```json
{
  "auto_post_enabled": true,
  "default_platforms": ["x", "facebook"],
  "default_timing": "optimal",
  "caption_style": "ai",
  "custom_caption_template": null
}
```

Null = system defaults (all connected platforms, post immediately, AI
captions).

## 4. Technical Architecture

### 4.1 New Approval Data Flow

```
Restaurant taps "Approve & Post"
  ├─ 1. UPDATE promotion_submissions → status: 'approved'
  ├─ 2. INSERT discount_codes → generate code (phone nullable)
  ├─ 3. INVOKE send-promotion-notification → email + SMS (non-blocking,
  │     SMS skipped if phone is null)
  ├─ 4. READ business_profiles.cgc_posting_preferences
  │     ├─ "Approve & Post" + Zone 2 toggle = "Post now"
  │     │   → INVOKE useCrossPost → post to Outstand
  │     │   → INSERT donny_scheduled_posts (status: 'published')
  │     ├─ "Approve & Post" + Zone 2 toggle = "Schedule for best time"
  │     │   → INVOKE donny-schedule (create) with suggested time
  │     │   → INSERT donny_scheduled_posts (status: 'scheduled')
  │     └─ no accounts / "Approve Only" button clicked
  │         → skip social posting entirely
  └─ 5. INVALIDATE React Query caches
```

Note: There is no separate "Approve & Schedule" button. The scheduling
behavior is controlled by the "Post now / Schedule for best time" toggle
in Zone 2 of the review sheet. The "Approve & Post" button executes
whichever option is selected.

### 4.2 Two-Phase Review Sheet

**Phase 1 — Pre-fetch (when review sheet opens):**
New `useCGCReviewSheet` hook:

- Calls `social-caption` for AI caption (ready before user taps approve)
- Calls `donny-schedule` `suggest_times` for optimal posting time
- Reads `business_profiles.cgc_posting_preferences`
- Reads connected accounts via `useLocationSocialAccounts`
- Returns: `{ caption, hashtags, suggestedTime, defaultPlatforms, connectedAccounts, preferences }`

**Phase 2 — On approval (mutation):**
Extended `reviewSubmission` in `usePromotions`:

```typescript
interface ReviewSubmissionParams {
  submissionId: string;
  status: 'approved' | 'rejected';
  rejectionReason?: string;
  // New social posting params (all optional, backward-compatible):
  socialAction?: 'post_now' | 'schedule' | 'skip';
  platforms?: string[];
  caption?: string;
  hashtags?: string[];
  scheduledAt?: string;
}
```

Existing calls without social params work exactly as before (backward
compatible). The social posting branch only fires when `socialAction` is
provided.

### 4.3 Database Changes

**Migration 1 — Make customer fields nullable for simplified submission:**

```sql
ALTER TABLE promotion_submissions
  ALTER COLUMN customer_name DROP NOT NULL;
ALTER TABLE promotion_submissions
  ALTER COLUMN customer_phone DROP NOT NULL;
ALTER TABLE discount_codes
  ALTER COLUMN customer_phone DROP NOT NULL;
```

**Migration 2 — Preferences column:**

```sql
ALTER TABLE business_profiles
ADD COLUMN cgc_posting_preferences JSONB DEFAULT NULL;
```

**Migration 3 — Performance index:**

```sql
CREATE INDEX idx_donny_scheduled_posts_promotion
ON donny_scheduled_posts (user_id, status)
WHERE metadata->>'source' = 'promotion';
```

No new tables. Three migrations total: nullable columns, preferences
column, performance index.

### 4.4 Edge Function Changes

| Function | Change | Reason |
|----------|--------|--------|
| `social-caption` | None | Already supports `source: 'promotion'` |
| `donny-schedule` | None | `suggest_times` and `create` work as-is |
| `send-promotion-notification` | Minor | (a) Update TypeScript interface: make `customerPhone` and `customerName` optional. (b) Skip SMS when phone is null/empty (same pattern as existing Twilio-key-missing guard). (c) Add email greeting fallback: "Hi there" when name is null. |
| `fire-promotion-social-hook` | Deprecated for CGC | Replaced by inline posting |
| `outstand-proxy` | None | `useCrossPost` already uses it |

### 4.5 Component Inventory

**New components (4):**

| Component | Purpose |
|-----------|---------|
| `CGCReviewSheet` | Unified approve-and-post bottom sheet / side panel |
| `SocialPostEditor` | Zone 2 — caption, platforms, timing editor |
| `CGCContentLibrary` | Merged filterable view replacing 3 tabs |
| `CGCPostingPreferences` | Settings card for auto-post configuration |

**Modified components (3):**

| Component | Change |
|-----------|--------|
| `CreatePromotionModal` | 3 fields + advanced expandable |
| `BusinessPromotionalTools` | New dashboard layout, 2 tabs, priority banner |
| `PromotionSubmissionPage` | Camera-first, email-only required |

**New hooks (1):**

| Hook | Purpose |
|------|---------|
| `useCGCReviewSheet` | Pre-fetches caption, schedule, accounts, prefs |

**Modified hooks (2):**

| Hook | Change |
|------|--------|
| `usePromotions` | Extended `reviewSubmission` with social params |
| `usePromotionSubmission` | Simplified required fields |

## 5. Error Handling & Edge Cases

**Outstand disconnected mid-post:** Approval succeeds (code + notification
sent). Social posting failure shown as toast: "Approved! Social posting
failed — try again from Content Library." Logged in
`donny_scheduled_posts` metadata.

**Duplicate customer submission:** Deduplicate by email + promotion_id.
Show: "You've already submitted to this promotion."

**Expired promotion approval:** Allow approval of pending submissions on
expired promotions. Customer held up their end. Discount code expiry tied
to `promotion.end_date` (may be short-lived).

**Caption generation failure:** Review sheet opens with empty caption field
+ placeholder "Write a caption or tap Generate to try again." Never block
approval on AI failures.

**Batch review mixed outcomes:** All approvals succeed independently.
Social posting results summarized in toast: "5 approved. 3 posted, 2
failed — view in Content Library." Failed posts get status 'failed' with
retry in Content Library.

**Zero accounts + auto_post enabled:** `useCGCReviewSheet` detects zero
accounts, silently downgrades to no-Outstand flow (download + copy
caption). No error.

**Slow upload on mobile:** Progress bar on upload step with "Don't close
this page." Failed uploads offer retry with same file kept in memory.

## 6. Migration Path

**Phase 1 — Backend (zero user impact):**
1. Make `customer_name`, `customer_phone` nullable on
   `promotion_submissions`; make `customer_phone` nullable on
   `discount_codes`
2. Add `cgc_posting_preferences` column to `business_profiles` (nullable)
3. Add `idx_donny_scheduled_posts_promotion` index
4. Update `send-promotion-notification` to skip SMS when phone is null
5. Deploy

**Phase 2 — New components (zero user impact):**
6. Build `CGCReviewSheet`, `SocialPostEditor`, `CGCContentLibrary`,
   `CGCPostingPreferences`
7. Build `useCGCReviewSheet` hook
8. Extend `reviewSubmission` with optional social params
   (backward-compatible)
9. Deploy

**Phase 3 — UI swap (visible change):**
10. Update `BusinessPromotionalTools` — new layout, 2 tabs, banner
11. Update `CreatePromotionModal` — simplified fields
12. Update `PromotionSubmissionPage` — camera-first, email-only
13. Wire `CGCReviewSheet` into Content Library
14. Add `CGCPostingPreferences` to Settings page
15. Update help article `customer-flow.mdx` (deduplication copy change)
16. Deploy

**Phase 4 — Cleanup:**
17. Stop calling `fire-promotion-social-hook` from `reviewSubmission`
18. Clean up orphaned `donny_nudges` for CGC content
19. Keep edge function deployed 30 days, then remove

**Rollback:** Each phase is independently revertible. Phase 3 is one
commit that swaps page components — one revert restores everything.

## 7. Testing Strategy

| Scenario | Verification |
|----------|-------------|
| Simplified creation | Create with discount + title + duration. Verify defaults in DB. |
| Customer camera-first | Scan QR on mobile, record, email-only, submit. Verify in queue. |
| Approve & Post | Approve with Outstand. Verify: code, email, post to correct platforms. |
| Approve Only | Approve without posting. Verify: code + email, no social post. |
| No-Outstand fallback | Disconnect Outstand, approve. Verify download + copy caption. |
| Batch review | 3+ pending. Desktop: swipe through and approve. Mobile: navigate via buttons and approve. Verify codes + social + summary toast. |
| Preferences | Set defaults in Settings. Open review sheet. Verify pre-populated. |
| Platform awareness | Connect X + Facebook only. Verify only those chips appear. |
| Expired promotion | Approve on expired promotion. Verify success with short-lived code. |
| Social failure | Mock Outstand failure. Verify approval succeeds, failure logged. |
| Desktop + mobile | All flows tested on both viewports. Desktop: side panel. Mobile: bottom sheet. |

## 8. Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Creation completion rate | Unknown | >80% | Modal open → promotion created |
| Submission completion rate | Unknown | >60% | QR scan → submit |
| Time to approval | Unknown | <24h avg | `created_at` → `reviewed_at` |
| Approved → published rate | ~0% | >70% | `donny_scheduled_posts` published / approvals |
| Restaurant retention | Unknown | >50% create 2+ | Distinct promotions per business/month |

## 9. Explicitly Deferred (Phase 2)

- AI video quality screening (cost: $0.10-0.30/submission, not justified
  pre-revenue)
- One-tap promotion from business profile (after smart defaults prove out)
- Franchise broadcasting to multiple locations (after org_unit matures)
- Post-approval analytics dashboard (needs real posting data first)
- Toast POS automatic code redemption (separate workstream)

## 10. Musk Algorithm Scorecard

**Deleted:** 4 creation fields, 3 required customer fields, 2 dashboard
tabs, separate social drafting flow, `fire-promotion-social-hook` as
active dependency, verbose welcome screen.

**Simplified:** 7 fields → 3. 5 steps → 3. 4 tabs → 2. Two flows → one
"Approve & Post" action.

**Accelerated:** Creation 80% faster. Submission 50% faster. Approve +
post 90% faster. Batch review 90% faster. Full cycle 70% faster.

**Automated:** AI captions, optimal scheduling, platform detection,
discount delivery, social posting on approval.
