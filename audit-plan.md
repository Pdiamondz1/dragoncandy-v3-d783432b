# DragonCandy — Comprehensive Audit Plan

> Audit scope: Bug & UI/UX issues, glitches, performance, and security assessment with prioritized fixes across all 3 user roles (Business, Creator, Brand) and public flows.

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1 — Pre-Audit Setup](#phase-1--pre-audit-setup)
3. [Phase 2 — Batch A: Public & Auth Routes](#phase-2--batch-a-public--auth-routes)
4. [Phase 3 — Batch B: Business Role](#phase-3--batch-b-business-role)
5. [Phase 4 — Batch C: Creator Role](#phase-4--batch-c-creator-role)
6. [Phase 5 — Batch D: Brand / Sponsor Role](#phase-5--batch-d-brand--sponsor-role)
7. [Phase 6 — Cross-Cutting Audits](#phase-6--cross-cutting-audits)
8. [Per-Route Checklist Template](#per-route-checklist-template)
9. [Final Report Layout (PDF and Word)](#final-report-layout-pdf-and-word)
10. [Word (.docx) export](#word-docx-export)
11. [Execution Timeline](#execution-timeline)

---

## Overview

### Recommended Structure: **6 Phases**

| Phase | Focus | Est. Time |
|-------|-------|-----------|
| **1** | Pre-audit setup & automated scans | 0.5 day |
| **2** | Public & Auth routes (unauthenticated) | 1 day |
| **3** | Business role (full flow) | 1.5 days |
| **4** | Creator role (full flow) | 1.5 days |
| **5** | Brand/Sponsor role (full flow) | 1 day |
| **6** | Cross-cutting: Performance, Security, Donny AI, A11y | 1.5 days |

**Total: ~7 working days** for a thorough audit.

### Severity Tiers (used throughout report)

- **Critical** — Blocks core flows, data leak, security vulnerability, broken payments
- **High** — Major UX issue, broken feature in one role, significant perf regression
- **Medium** — Cosmetic/UX inconsistency, minor logic bug, accessibility issue
- **Low** — Polish, micro-copy, non-blocking visual glitch
- **Nice-to-have** — Enhancement suggestion

### Finding IDs

**Stable format:** `DC-<CATEGORY>-<NNN>` — category code + **zero-padded** number (`001`, `002`, …).

**Examples:** `DC-UX-001`, `DC-BUG-014`, `DC-A11Y-003`, `DC-PERF-002`, `DC-SEC-008`.

**Do not** use vague placeholders like `DC-UNKNOWN-001`. If you are unsure, pick the **closest** category (e.g. contrast on login → `DC-A11Y-` or `DC-UX-`, not UNKNOWN).

| Code | Use for |
|------|---------|
| **UX** | Layout, spacing, alignment, navigation, visual hierarchy |
| **BUG** | Broken behavior, wrong data, crash, error state missing |
| **A11Y** | Contrast, focus, keyboard, semantics, screen reader |
| **PERF** | Load time, bundle size, slow queries, Lighthouse, jank |
| **SEC** | Auth, RLS, XSS, secrets in client, abuse, general security |
| **COPY** | Microcopy, typos, misleading labels |
| **DATA** | Stale/wrong API or DB-driven UI (when not a pure BUG) |
| **STRIPE** | Payments, Connect, escrow, webhooks (optional; can use **SEC** instead) |
| **DONNY** | AI assistant: prompts, streaming, context, rate limits |

**Numbering:** Use **per-category** counters (`DC-UX-001`, `DC-UX-002`, …) so IDs stay readable in meetings and tickets.

**How it appears in the PDF (pick one):**

- **Option A — Minimal (recommended):** Top banner = `Finding 12 of 45` + **issue title only**. Put **`DC-UX-012`** once in the metadata table as row **ID** — avoids a second “mystery” highlighted ID in the header.
- **Option B — Inline:** Single title line: **`DC-UX-012 — Button alignment issue`** (ID + title together, no separate UNKNOWN strip).

---

## Phase 1 — Pre-Audit Setup

Do this before touching any route.

### 1.1 Environment prep
- Create **3 test accounts**: 1 business, 1 creator, 1 brand
- Seed each with realistic data (campaigns, applications, messages, files, payments)
- Use Stripe test cards (success, decline, 3DS)
- Prepare incognito windows per role to test cross-role data leaks

### 1.2 Tooling checklist
- Chrome DevTools (Lighthouse, Performance, Network, Console, Coverage)
- React DevTools + Profiler
- axe DevTools browser extension (a11y)
- WAVE extension (a11y)
- Supabase dashboard (RLS policies, Auth logs, DB logs, slow query log)
- Supabase Advisor / linter (security & perf warnings)
- `vite-bundle-visualizer` for bundle analysis
- Postman or `curl` for raw Edge Function testing

### 1.3 Automated scans (quick wins first)
- `npm audit` and `npm outdated`
- `tsc --noEmit` — surface type errors
- `npm run lint` — surface ESLint issues
- `npm run build` — check build warnings, bundle size
- Lighthouse CI on landing + each main dashboard route
- Supabase Advisor run (security + performance tabs)

### 1.4 Set up report template
- Define severity badges (colored)
- Create the finding entry template (see [Per-Route Checklist Template](#per-route-checklist-template))
- Assign finding IDs using **`DC-<CATEGORY>-<NNN>`** (see [Finding IDs](#finding-ids) above)

---

## Phase 2 — Batch A: Public & Auth Routes

**Why first:** No login required. Highest SEO / first-impression / conversion impact. These set the tone for new users and are easiest to test in parallel incognito sessions.

| # | Route | Component | Notes |
|---|-------|-----------|-------|
| A1 | `/` | `Index` | Redirect logic, role detection |
| A2 | `/home` | `Index` | Alias — verify parity |
| A3 | `/landing` | `LandingPage` | Marketing, CTAs, SEO |
| A4 | `/auth` | `AuthPage` | Login + signup, validation, error states |
| A5 | `/auth/forgot` | `ForgotPassword` | Email submission, rate limit |
| A6 | `/auth/update-password` | `UpdatePassword` | Token handling, expiry |
| A7 | `/verify-email` | `VerifyEmail` | Token validity, resend, expiry |
| A8 | `/campaign/create` | `AnonymousCampaignWizard` | Unauthenticated wizard, data persistence on signup |
| A9 | `/promo/:promotionId` | `PromotionSubmissionPage` | Public submission flow |
| A10 | `/help/promotions/:slug` | `HelpBriefPage` | Help content rendering |
| A11 | `/creator/:slug` | `PublicCreatorProfile` | Public portfolio, SEO meta |
| A12 | `/business/:slug` | `PublicBusinessProfile` | Public profile, SEO meta |
| A13 | `*` (404) | `NotFound` | UX, recovery paths |
| A14 | Site gate | `SiteGate` / `SiteGateGuard` | Gate bypass attempts, UX |

**Checks per route:**
- Responsive: **mobile-first** at 375 / 390 / 430px (per design spec), tablet 768px, desktop 1280px+
- Form validation (empty, invalid, oversized, unicode, XSS payloads)
- Loading states, skeletons, error boundaries
- Broken links, missing image alt tags
- Color contrast (WCAG AA) — teal/pink palette vs backgrounds
- Keyboard navigation + visible focus rings
- Console errors/warnings
- Network waterfall on slow 3G
- SEO: `<title>`, meta description, Open Graph, canonical URL
- Back-button behavior, deep-link support

---

## Phase 3 — Batch B: Business Role

**Why second:** Primary revenue-driving persona with the most complex flow (campaign creation → proposal review → project management → payment).

### B1 — Onboarding (test in order)
| # | Route | Component |
|---|-------|-----------|
| B1.1 | `/profile/onboarding` | `ProfileOnboarding` |
| B1.2 | `/profile/business` | `BusinessProfileSetup` |
| B1.3 | `/business-profile-setup` | `BusinessProfileSetup` (legacy alias) |
| B1.4 | `/dashboard/business` (first visit) | `BusinessDashboard` |

### B2 — Dashboard & Campaigns
| # | Route | Component |
|---|-------|-----------|
| B2.1 | `/dashboard/business` | `BusinessDashboard` |
| B2.2 | `/dashboard/business/campaigns` | `CampaignsPage` |
| B2.3 | `/dashboard/business/campaigns/create` | `CampaignWizard` (**Donny AI brief generation**) |
| B2.4 | `/dashboard/business/campaigns/:id` | `CampaignDetailsPage` |
| B2.5 | `/dashboard/business/campaigns/:id/edit` | `CampaignEditPage` |
| B2.6 | `/dashboard/business/campaigns/:id/details` | `CampaignDetailsPage` (alt path) |
| B2.7 | `/dashboard/business/campaigns/:campaignId/proposals` | `BusinessProposals` |

### B3 — Projects, Promotions, Sponsorships, Creators
| # | Route | Component |
|---|-------|-----------|
| B3.1 | `/dashboard/business/projects` | `BusinessProjects` |
| B3.2 | `/dashboard/business/promotions` | `BusinessPromotionalTools` |
| B3.3 | `/dashboard/business/promotions/:promotionId` | `PromotionDetailPage` |
| B3.4 | `/dashboard/business/sponsorships` | `BusinessSponsorships` |
| B3.5 | `/dashboard/business/creators` | `CreatorBrowse` |
| B3.6 | `/dashboard/business/dragon-feed` | `BusinessDragonFeed` |
| B3.7 | `/dashboard/business/activity` | `BusinessActivity` |

### B4 — Messages & Settings
| # | Route | Component |
|---|-------|-----------|
| B4.1 | `/dashboard/business/messages` | `DirectMessagesPage` |
| B4.2 | `/dashboard/business/messages/direct/:conversationId` | `DirectConversationPage` (realtime) |
| B4.3 | `/dashboard/business/messages/campaign/:campaignId` | `CampaignMessagesPage` |
| B4.4 | `/dashboard/business/settings` | `BusinessSettings` |

**Role-specific checks:**
- Campaign wizard — does **Donny AI** produce coherent briefs, delivery tiers, pricing? Test prompt-injection resistance and streaming UX.
- **Stripe Connect escrow** (test mode) — create → fund → release → refund. Test declined cards and 3DS.
- Cross-role RLS: can business see **other** businesses' campaigns/proposals/files?
- Proposal accept/decline state machine — can the same proposal be accepted twice?
- File upload — size limits, mime validation, preview rendering, EXIF stripping
- Realtime activity feed — stale data on reconnect

---

## Phase 4 — Batch C: Creator Role

### C1 — Onboarding
| # | Route | Component |
|---|-------|-----------|
| C1.1 | `/profile/creator` | `CreatorProfileSetup` |
| C1.2 | `/creator-profile-setup` | `CreatorProfileSetup` (legacy alias) |
| C1.3 | `/dashboard/creator` (first visit) | `CreatorDashboard` |

### C2 — Discovery & Applications
| # | Route | Component |
|---|-------|-----------|
| C2.1 | `/dashboard/creator` | `CreatorDashboard` |
| C2.2 | `/dashboard/creator/campaigns` | `CreatorCampaignMarketplace` (swipe UX) |
| C2.3 | `/dashboard/creator/campaigns/:id` | `CampaignDetailsPage` |
| C2.4 | `/dashboard/creator/applications` | `CreatorApplications` |

### C3 — Projects, Earnings, Feed
| # | Route | Component |
|---|-------|-----------|
| C3.1 | `/dashboard/creator/projects` | `CreatorProjects` |
| C3.2 | `/dashboard/creator/earnings` | `CreatorEarnings` (Stripe payouts) |
| C3.3 | `/dashboard/creator/dragon-feed` | `CreatorDragonFeed` |

### C4 — Messages & Settings
| # | Route | Component |
|---|-------|-----------|
| C4.1 | `/dashboard/creator/messages` | `DirectMessagesPage` |
| C4.2 | `/dashboard/creator/messages/direct/:conversationId` | `DirectConversationPage` |
| C4.3 | `/dashboard/creator/messages/campaign/:campaignId` | `CampaignMessagesPage` |
| C4.4 | `/dashboard/creator/settings` | `CreatorSettings` |

**Role-specific checks:**
- Portfolio upload — optimization, EXIF stripping, gallery rendering, thumbnail generation
- Certification badges (**Dragon Scout / Knight / Master**) — correct logic + display
- Earnings math: escrow release, platform fee calc, payout timing, currency handling
- Cross-role RLS: can a creator see **other** creators' applications, earnings, files?
- Swipe UX on marketplace (per design spec) — touch gestures, momentum
- Counter-offer flow (`application_counter_offers` table)

---

## Phase 5 — Batch D: Brand / Sponsor Role

### D1 — Onboarding & Dashboard
| # | Route | Component |
|---|-------|-----------|
| D1.1 | `/profile/brand` | `BrandProfileSetup` |
| D1.2 | `/brand-profile-setup` | `BrandProfileSetup` (legacy alias) |
| D1.3 | `/dashboard/brand` | `BrandDashboard` |

### D2 — Discovery & Sponsorships
| # | Route | Component |
|---|-------|-----------|
| D2.1 | `/dashboard/brand/discover-campaigns` | `BrandDiscoverCampaigns` |
| D2.2 | `/dashboard/brand/sponsorships` | `BrandSponsorships` |
| D2.3 | `/dashboard/brand/creators` | `BrandCreators` |
| D2.4 | `/dashboard/brand/campaigns/create` | `BrandCreateCampaign` |
| D2.5 | `/dashboard/brand/campaigns/:id` | `BrandCampaignDetails` |

### D3 — Analytics, Messages, Settings
| # | Route | Component |
|---|-------|-----------|
| D3.1 | `/dashboard/brand/analytics` | `BrandAnalytics` |
| D3.2 | `/dashboard/brand/messages` | `BrandMessages` |
| D3.3 | `/dashboard/brand/messages/direct/:conversationId` | `DirectConversationPage` |
| D3.4 | `/dashboard/brand/messages/campaign/:campaignId` | `CampaignMessagesPage` |
| D3.5 | `/dashboard/brand/settings` | `BrandSettings` |

### D4 — Shared / Cross-Role Routes
| # | Route | Component |
|---|-------|-----------|
| D4.1 | `/dashboard/analytics` | `ROIDashboard` (adapts per role) |
| D4.2 | `/dashboard/payments` | `PaymentsPage` |
| D4.3 | `/reviews` | `ReviewsManagement` |
| D4.4 | `/projects/:id` | `ProjectDetailsPage` |
| D4.5 | `/messages` | `DirectMessagesPage` |
| D4.6 | `/messages/direct/:conversationId` | `DirectConversationPage` |
| D4.7 | `/messages/:campaignId` | `CampaignMessagesPage` |

**Role-specific checks:**
- Sponsorship payment flow (Stripe) — success, decline, partial
- Analytics chart accuracy vs raw Supabase data (spot-check 5 metrics)
- Cross-promotion visibility rules — should a brand see all campaigns or only eligible?
- ROI Dashboard role-adaptive rendering — test with all 3 roles

---

## Phase 6 — Cross-Cutting Audits

Run these **across the app**, not per-route. Do after Phases 2–5 so you have context.

### 6A — Performance
- Lighthouse per key route: `/landing`, `/dashboard/business`, `/dashboard/creator`, `/dashboard/brand`, campaign wizard, messages
- Bundle analysis: unused deps, code-split opportunities, **lazy-load `pages/*`** via `React.lazy`
- React Query: cache hit rate, `staleTime` review per query, stale data on navigation
- Supabase query perf: enforce `.select()` field lists (CLAUDE.md rule), check for N+1 patterns, missing indexes
- Realtime subscription leaks (`messages`, `user_presence`) — do unsubscribes run on unmount?
- Image optimization — WebP, lazy loading, responsive `srcset`
- Core Web Vitals: LCP, CLS, INP per route
- First-load JS size, TTI on simulated 3G

### 6B — Security
- **RLS audit** — for each test user, attempt cross-role reads/writes on every table:
  `profiles`, `creator_profiles`, `business_profiles`, `campaigns`, `campaign_applications`,
  `campaign_collaborations`, `campaign_invitations`, `campaign_matches`, `campaign_sponsorships`,
  `application_counter_offers`, `promotions`, `promotion_submissions`, `discount_codes`,
  `conversations`, `conversation_participants`, `messages`, `message_reactions`, `user_presence`,
  `push_notifications`, `notification_preferences`, `file_uploads`, `file_versions`,
  `file_permissions`, `file_comments`, `file_tags`, `file_tag_assignments`,
  `project_reviews`, `review_responses`, `beta_feedback`, `analytics_events`,
  `profile_views`, `user_onboarding_progress`, `email_verification_tokens`, `feature_flags`
- Auth: session expiry, token refresh, logout cleanup (localStorage, React Query cache)
- XSS: user-generated content rendering — bios, campaign briefs, message bodies, review text
- File upload: type/size limits, storage bucket policies, signed URL expiry
- Stripe: webhook signature verification, idempotency keys, amount tampering
- `.env` secrets — confirm none are bundled to the client (only `VITE_*` allowed)
- Edge functions (e.g. `chat-assistant`): rate limiting, input validation, auth checks
- CORS config, CSP headers, HSTS
- `SiteGateGuard` bypass attempts
- Password reset token reuse / timing
- Email verification token reuse

### 6C — Donny AI Assistant (cross-platform super agent)
- Prompt injection resistance (attempt jailbreak via campaign brief input)
- Rate limiting and cost controls (token caps, per-user quotas)
- Streaming UX, partial render, error recovery
- Context bleed between sessions/users (is context scoped per user?)
- Desktop panel (`DonnyDesktopPanel`) responsiveness
- `HelpBriefDrawer` UX, keyboard close, focus trap
- Role-aware behavior — does Donny adapt responses per `UserRole`?

### 6D — Accessibility
- axe scan on every page (log WCAG level AA violations)
- Screen reader walkthrough (VoiceOver/NVDA) on critical flows: signup, campaign create, apply, message, pay
- Color contrast across teal/pink palette vs all background variants
- Focus management in modals, drawers, toasts
- Skip links, landmark roles, heading hierarchy
- Reduced-motion respect

### 6E — Realtime & Offline / Edge Cases
- Network drop during message send — retry? local draft?
- Refresh mid-payment — idempotency + recovery
- Race conditions: two users accepting same proposal
- Two creators applying simultaneously to a single-slot campaign
- Presence flicker / ghost online state
- Tab switching: stale data, refetch behavior

### 6F — Code & Architecture (static)
- `tsc --noEmit` — all type errors surfaced
- Unused exports, dead code
- Confirm no `select *` in Supabase queries (per CLAUDE.md)
- Confirm no class components (functional only)
- Named exports for components, default only for pages (per CLAUDE.md)
- Loading/error state handling in every React Query hook
- `ErrorBoundary` placement — enough widget-level boundaries?
- Tailwind-only styling (no custom CSS drift)

---

## Per-Route Checklist Template

Use this for every route in Phases 2–5. Capture screenshots.

```markdown
### Finding 12 of 45 — Button alignment issue
<!-- Option B instead: ### DC-UX-012 — Button alignment issue -->

| Field | Value |
|-------|-------|
| **ID** | DC-UX-012 |
| **Route** | / |
| **Role / area** | Public (optional — who hits this route) |
| **Severity** | Low |
| **Category** | UX |
| **Effort** | S |

**Steps to reproduce:**
1. ...
2. ...

**Expected:** ...

**Actual:** ...

**Impact:** ...

**Screenshot:** (attach)

**Environment:** Browser, viewport, network throttling

**Recommended fix:** ...

**Files likely involved:** `src/...`
```

### Per-route checks to run
- [ ] Responsive 375 / 390 / 430 / 768 / 1280 px
- [ ] Loading state
- [ ] Error state
- [ ] Empty state
- [ ] Form validation (empty, invalid, oversized, unicode)
- [ ] Keyboard navigation + focus
- [ ] axe a11y scan — 0 serious violations
- [ ] Color contrast (AA)
- [ ] Console clean (no errors, no warnings)
- [ ] Network: no 4xx/5xx, no leaked secrets
- [ ] Cross-role access attempt (RLS)
- [ ] Lighthouse (on key routes)
- [ ] Back button / deep link / refresh
- [ ] Dark mode / theme (if applicable)
- [ ] Matches design spec in `/designs`

---

## Final Report Layout (PDF and Word)

Use the **same structure** whether you ship a **PDF** or a **Word (.docx)** file. Finding IDs follow [Finding IDs](#finding-ids) (`DC-<CATEGORY>-<NNN>` only — no `UNKNOWN`).

```
1. Executive Summary (1 page)
   - Overall health score
   - Top 5 critical issues
   - Top 5 quick wins
2. Methodology & Scope
3. Findings by Severity
   3.1 Critical
   3.2 High
   3.3 Medium
   3.4 Low / Nice-to-have
4. Findings by Role
   4.1 Public / Auth
   4.2 Business
   4.3 Creator
   4.4 Brand / Sponsor
   4.5 Shared / Cross-role
5. Performance Report
   - Lighthouse scores per route
   - Bundle analysis
   - DB query analysis
   - Core Web Vitals
6. Security Report
   - RLS audit matrix
   - Auth findings
   - Stripe findings
   - XSS / input validation
   - Edge function review
7. Accessibility Report (axe summary + manual findings)
8. Donny AI Assessment
9. Prioritized Fix Roadmap
   - Sprint 1 (Critical + quick wins)
   - Sprint 2 (High)
   - Sprint 3 (Medium + polish)
10. Appendix
    - Full route inventory
    - Screenshots
    - Network traces
    - RLS test queries
```

Each finding entry in sections 3–7 uses the template above, with color-coded severity badges and a single **`DC-<CATEGORY>-<NNN>`** ID (see [Finding IDs](#finding-ids)); avoid duplicate or UNKNOWN-style IDs in the **PDF or Word** cover line / callout box.

---

## Word (.docx) export

**Source of truth:** This file (`audit-plan.md`) and your per-finding notes. Anything you export to Word should use the **same** ID rules and metadata table as in [Per-Route Checklist Template](#per-route-checklist-template).

### Generate .docx from this markdown (optional)

If [Pandoc](https://pandoc.org/) is installed:

```bash
cd /path/to/dragoncandy-v3-d783432b
pandoc audit-plan.md -o audit-plan.docx
```

For a **client findings-only** document, maintain a separate `audit-findings.md` (or paste into Word) using the same finding template, then:

```bash
pandoc audit-findings.md -o DragonCandy-Audit-Findings.docx
```

### After export — check in Word

1. **Finding title line:** Use **Option A** or **Option B** from [Finding IDs](#finding-ids) — do **not** leave a highlighted/shaded box with `DC-UNKNOWN-001` or a second duplicate ID.
2. **Metadata:** Use a **2-column Word table** (Field | Value) with rows: **ID**, Route, Role/area, Severity, Category, Effort — put **`DC-UX-001`** (etc.) only in the **ID** row.
3. **Category column** should match the ID prefix (e.g. ID `DC-A11Y-002` → Category **A11Y**).
4. If Word’s styles add a **Quote** or **Intense emphasis** block around old IDs, clear formatting on that paragraph.

### Master template in Word (if you use one)

Update your `.dotx` / starter DOCX so the “Detailed findings” section uses:

- Heading: `Finding {{n}} of {{total}} — {{title}}` **or** `DC-{{CAT}}-{{###}} — {{title}}` (Option B).
- No placeholder `UNKNOWN`; category codes: **UX, BUG, A11Y, PERF, SEC, COPY, DATA, STRIPE, DONNY** (same table as [Finding IDs](#finding-ids)).

---

## Execution Timeline

| Day | Focus |
|-----|-------|
| **Day 1 AM** | Phase 1 — setup, automated scans, seed data |
| **Day 1 PM** | Phase 2 — Batch A (public & auth) |
| **Day 2** | Phase 3 — Batch B1–B2 (business onboarding + campaigns) |
| **Day 3** | Phase 3 — Batch B3–B4 (business projects, promotions, messages) |
| **Day 4** | Phase 4 — Batch C1–C3 (creator onboarding, discovery, projects) |
| **Day 5** | Phase 4 — Batch C4 + Phase 5 D1–D2 (creator messages + brand onboarding) |
| **Day 6** | Phase 5 — Batch D3–D4 (brand analytics, shared routes) |
| **Day 7 AM** | Phase 6 — performance + security sweeps |
| **Day 7 PM** | Phase 6 — Donny AI + a11y + compile PDF |

---

## Route Inventory Summary (complete)

**Total: 61 distinct route entries** across 54 unique page components.

- Public / Auth: **14** routes
- Business: **21** routes
- Creator: **14** routes
- Brand: **13** routes
- Shared / Cross-role: **7** routes (payments, analytics, messages, reviews, projects)

All routes are covered in Phases 2–5 above.

---

**Start with Batch A (public/auth)** — bugs there affect every user and are easiest to fix.
Then progress Business → Creator → Brand, mirroring the marketplace flow
(business posts → creator applies → brand sponsors). This order surfaces
cross-role data issues naturally as you go.
