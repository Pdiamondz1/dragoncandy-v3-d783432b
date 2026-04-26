# Onboarding & Settings Redesign — Speed Run

**Date:** 2026-04-25
**Status:** Draft
**Approach:** A (Speed Run) — single-screen onboarding, accordion settings, Elon Musk algorithm applied

## Problem

The current onboarding is a 5-step tutorial wizard that collects zero data, followed by a 30+ field form wall for creators and 20+ fields for businesses. Most fields are optional filler. Time to first value is ~5 minutes with high drop-off. The brand and business roles are functionally identical but maintained as separate code paths. Settings pages duplicate the same giant forms.

## Goals

- Profile live and discoverable in under 60 seconds
- Reduce creator signup fields from 30+ to 4
- Reduce business signup fields from 20+ to 3
- Delete the tutorial wizard entirely
- Collapse brand/business into one Business role
- Settings becomes a grouped accordion with profile completion nudges
- Auto-detect timezone and location (zero typing)
- Net reduction in codebase size

## Non-Goals

- AI-assisted profile generation (future Phase 2)
- Notification preferences UI (out of scope for this spec)
- Changes to the auth/signup page itself (email + password + role picker stays as-is)
- Database schema changes (all columns remain, collection timing changes)

---

## 1. Onboarding Flow

### Current → New

| | Current | New |
|---|---|---|
| Steps | 5 tutorial screens + giant form | Single screen with 3-4 fields |
| Data collected in onboarding | 0 fields (tutorial only) | 3-4 essential fields |
| Time to live profile | ~5 minutes | ~60 seconds |
| Tutorial content | Feature walkthroughs | Deleted entirely |
| Brand vs Business | Separate paths | Unified Business path |

### Post-Signup Route

After email verification, all users land on `/profile/setup`. This replaces the old `/profile/onboarding` wizard router and the three separate setup pages (`/profile/creator`, `/profile/business`, `/profile/brand`).

The `/profile/setup` page reads the user's role from `user.user_metadata.role` and renders the appropriate form variant.

### Creator Setup (4 fields)

1. **Avatar** — tap-to-upload circle with camera icon, dashed teal border
2. **Name** — text input, placeholder "Creative name or real name"
3. **Skills** — tap-to-select chip grid (UGC, Video, Photo, Design, Copy, Social, Animation, Strategy, Influencer, Other). Minimum 1 required.
4. **One-liner bio** — single text input, placeholder "I create viral food content for restaurants"

Auto-detected (shown as confirmation, editable):
- Location (city + country) via browser geolocation, IP-based fallback
- Timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`

CTA button: "Go Live" (teal, full-width pill)
Subtitle below button: "You can add rates, portfolio & social links anytime"

### Business Setup (3 fields)

1. **Logo** — tap-to-upload square with rounded corners, dashed pink border
2. **Business name** — text input, placeholder "Your company or brand name"
3. **Industry** — tap-to-select chip grid (Food, Fashion, Beauty, Fitness, Tech, Travel, Health, Entertainment, Education, Lifestyle, Finance, Automotive, Real Estate, Other). Required.

Auto-detected (same as creator):
- Location + Timezone

CTA button: "Start Finding Creators" (pink, full-width pill)
Subtitle below button: "Add description, social links & samples anytime"

### Submission Behavior

On submit:
1. Upsert row in `creator_profiles` or `business_profiles` with collected fields + auto-detected timezone/location
2. Set `is_completed = true`
3. Auto-generate profile slug via existing DB trigger
4. Redirect to role-appropriate dashboard (`/dashboard/creator` or `/dashboard/business`)

### Validation

- Creator: name (non-empty), bio (non-empty), skills (1+ selected)
- Business: business_name (non-empty), industry (selected)
- Avatar/logo: optional but encouraged (affects completion %)

---

## 2. Settings Pages

### Structure

Two settings pages, one per role:
- `/dashboard/creator/settings` — CreatorSettings
- `/dashboard/business/settings` — BusinessSettings (serves both old "business" and "brand" users)

Each page has:
1. **Profile completion header** — gradient banner with avatar/logo, name, role subtitle, progress bar, and a single actionable nudge
2. **Accordion sections** — expandable cards, one open at a time, white cards on gray background

### Auto-Save

Fields save on blur — no explicit "Save" button per field. A subtle toast confirms "Saved" on successful update. Error toast on failure with retry.

### Creator Settings Sections

**Profile** — name, bio, avatar upload, city, country, timezone
Fields carried over from onboarding are pre-filled.

**Rates & Availability** — base_rate_per_hour, min_project_budget, max_projects_per_month, preferred_project_duration, availability (text)

**Portfolio** — file upload grid, up to 5 items. Drag to reorder. Delete with confirmation.

**Social Links** — instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url, website_url. Each field shows platform icon + input.

**Payments** — Stripe Connect onboarding status and link. Existing RestaurantPaymentSettings component behavior preserved.

**Privacy** — profile_visibility (public/private toggle), allow_portfolio_in_feed (DragonFeed opt-in toggle)

### Business Settings Sections

**Business Info** — business_name, industry, logo upload, city, country, timezone

**About & Goals** — description (textarea), brand_category, marketing_objectives (textarea), preferred_collaboration_style (select), sponsorship_budget (number). This section absorbs the old BrandSettings-specific fields.

**Sample Content** — file upload grid for brand assets/samples

**Social Links** — same 7 platform URLs as creator (minus website_url)

**Payments** — Stripe settings, budget_range select. Existing RestaurantPaymentSettings behavior preserved.

**Integrations** — Toast POS connection card. Existing ToastConnectionCard component preserved.

**Privacy** — profile_visibility (public/private toggle)

### Accordion UX

- Sections render as white rounded cards (`rounded-2xl`) on the gray app background
- Tap header to expand/collapse
- Only one section open at a time
- Collapsed: icon + title + subtitle (one line)
- Expanded: icon + title + form fields below a divider
- Incomplete high-value sections show a colored left border (teal for creator, pink for business) and an action-oriented subtitle instead of the generic description (e.g., "Add your rates to get matched faster" instead of "Hourly rate, budget, availability")
- Once a section is filled, left border accent disappears and subtitle reverts to descriptive

### Deleted Fields

These fields exist in the database but are removed from the UI entirely. They were rarely filled and don't contribute to marketplace matching:

- `company_size`
- `founded_year`
- `employee_count_range`
- `years_of_experience`
- `response_time`
- `languages_spoken`
- `collaboration_preferences` (creator version — the business `preferred_collaboration_style` select stays)

The database columns remain. No migration needed.

---

## 3. Profile Completion Engine

### Calculation

Client-side weighted percentage based on field presence. Implemented as a `useProfileCompletion` hook that reads the current profile data and returns `{ percentage: number, nextNudge: string, nextSection: string }`.

### Creator Weights (total: 100%)

| Weight | Section | Condition |
|---|---|---|
| 35% | Name + Bio + Skills | All three present (from onboarding) |
| 15% | Avatar | avatar_url is non-null |
| 20% | Rates & Availability | base_rate_per_hour is set |
| 15% | Portfolio | portfolio_urls has 1+ item |
| 10% | Social Links | Any one social URL is non-null |
| 5% | Location | city or country is non-null |

### Business Weights (total: 100%)

| Weight | Section | Condition |
|---|---|---|
| 30% | Name + Industry | Both present (from onboarding) |
| 15% | Logo | logo_url is non-null |
| 20% | About & Goals | description is non-empty |
| 15% | Sample Content | sample_content_urls has 1+ item |
| 10% | Social Links | Any one social URL is non-null |
| 10% | Payments | Stripe connected or budget_range set |

### Nudge Logic

The completion bar CTA always shows the single highest-weighted incomplete section. Example: creator with name+bio+skills (35%) + avatar (15%) = 50% → nudge says "Add your rates to appear in more searches" (the next 20% chunk). The `nextSection` value is used to auto-scroll to and expand the relevant accordion section when the user taps the nudge.

---

## 4. Auto-Detection

### Timezone

```
Intl.DateTimeFormat().resolvedOptions().timeZone
```

Run on setup page load. Saved to profile on submit. Shown as confirmation text: "Auto-detected: UTC-5". Editable in Settings.

### Location

1. Request `navigator.geolocation.getCurrentPosition()`
2. If granted: reverse geocode coordinates to city + country via the browser's `fetch` to a free reverse geocoding endpoint (e.g., BigDataCloud reverse geocode API — no key required for basic usage)
3. If denied or unavailable: skip location, show empty fields. User can add location manually in Settings.
4. Show as confirmation text: "Auto-detected: New York, NY" with an edit link
5. Save city + country to profile on submit

### Profile Slug

Existing `auto_generate_profile_slug()` DB trigger handles this. No changes needed.

---

## 5. Route Changes

| Route | Before | After |
|---|---|---|
| `/profile/onboarding` | OnboardingWizard (5-step tutorial) | **Deleted** — redirect to `/profile/setup` |
| `/profile/setup` | Does not exist | **New** — unified single-screen setup |
| `/profile/creator` | CreatorProfileSetup (30+ fields) | **Redirect** to `/profile/setup` |
| `/profile/business` | BusinessProfileSetup (20+ fields) | **Redirect** to `/profile/setup` |
| `/profile/brand` | BrandProfileSetup | **Deleted** — redirect to `/profile/setup` |
| `/dashboard/creator/settings` | CreatorSettings (giant form) | **Rewritten** — accordion settings |
| `/dashboard/business/settings` | BusinessSettings (giant form) | **Rewritten** — accordion settings |
| `/dashboard/brand/settings` | BrandSettings | **Deleted** — redirect to `/dashboard/business/settings` |

---

## 6. Files Deleted

```
src/components/onboarding/OnboardingWizard.tsx
src/components/onboarding/OnboardingStep.tsx
src/components/onboarding/steps/WelcomeStep.tsx
src/components/onboarding/steps/ProfileTourStep.tsx
src/components/onboarding/steps/CampaignCreationStep.tsx
src/components/onboarding/steps/CreatorDiscoveryStep.tsx
src/components/onboarding/steps/MessagingStep.tsx
src/components/onboarding/steps/ApplicationStep.tsx
src/components/onboarding/steps/CampaignBrowsingStep.tsx
src/components/onboarding/steps/CreatorProfileStep.tsx
src/components/onboarding/steps/ProjectManagementStep.tsx
src/pages/ProfileOnboarding.tsx
src/pages/BrandProfileSetup.tsx
src/pages/BrandSettings.tsx
src/components/brand-profile/BrandProfileSetupForm.tsx
src/hooks/useOnboardingProgress.ts
```

## 7. Files Created

```
src/pages/ProfileSetup.tsx                          — unified single-screen setup
src/components/settings/SettingsAccordion.tsx        — accordion container
src/components/settings/SettingsSection.tsx          — expandable section card
src/components/settings/ProfileCompletionBar.tsx     — gradient header with progress
src/hooks/useProfileCompletion.ts                   — weighted completion calculation
src/hooks/useAutoDetect.ts                          — timezone + geolocation detection
```

## 8. Files Modified

```
src/pages/CreatorProfileSetup.tsx     — delete (handle redirect in App.tsx route table)
src/pages/BusinessProfileSetup.tsx    — delete (handle redirect in App.tsx route table)
src/pages/CreatorSettings.tsx         — rewrite with accordion UI
src/pages/BusinessSettings.tsx        — rewrite with accordion UI, absorb brand fields
src/App.tsx                           — route table updates
```

## 9. Database Impact

**No schema changes.** All existing columns in `creator_profiles` and `business_profiles` remain. The only change is when and where fields are collected (onboarding vs settings).

**Tables deprecated (stop reading/writing, do not drop):**
- `onboarding_steps`
- `user_onboarding_progress`

**localStorage cleanup:**
- Remove onboarding progress keys previously set by `useOnboardingProgress`

---

## 10. Edge Cases

**Existing users with incomplete profiles:** If `is_completed = false` and user logs in, redirect to `/profile/setup`. The setup page pre-fills any data already saved. This matches current behavior.

**Existing users with complete profiles:** No change to their experience. Settings page shows their current data in the new accordion layout. Profile completion bar reflects their current state.

**Brand role users:** Any user with `role = 'brand'` in their metadata is treated as `business_client`. The settings page renders identically. The About & Goals section includes the brand-specific fields (brand_category, marketing_objectives).

**Geolocation denied:** Show empty location fields with a note: "Add your location in Settings." Not blocking — user can proceed without it.

**Avatar/logo skipped:** Allowed. Profile completion bar shows 15% available by adding it. Nudge will eventually surface it.
