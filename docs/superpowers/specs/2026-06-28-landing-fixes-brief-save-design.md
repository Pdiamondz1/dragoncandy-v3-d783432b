# Landing fixes — brief-save + Business buttons + nav — Design

**Date:** 2026-06-28
**Status:** Spec (not built)
**Spec author:** Claude (Opus 4.8)

## Problem / Context

Three concrete issues on the (Dark-Luxe) landing page, deliberately scoped together
and *separately* from the larger "make it less generic" redesign (a future effort):

1. **Brief-save is a false promise (trust bug).** A guest pastes a URL, gets a draft
   campaign brief, and clicks **"Save this brief — sign up free."** That writes
   `localStorage['pendingBrief']` (`BriefGeneratorPreview.tsx`) and navigates to
   `/auth?mode=signup` — but **nothing ever reads `pendingBrief` back** (confirmed
   repo-wide: one `setItem`, zero `getItem`). The brief is silently discarded, so the
   CTA fools new users. (This was actually *designed* in
   `docs/superpowers/specs/2026-04-27-donny-rag-pricing-ux-completion-design.md` —
   "on signup → check `pendingBrief` → attach to the new account" — but the read half
   was never built.)

2. **"Join as a Business" is missing.** The hero and bottom CTA offer "Get Started" +
   "Join as a Creator", but no business-specific CTA. Add **"Join as a Business"** above
   "Join as a Creator" in both spots.

3. **Navigation is broken.** The `Header` nav points "For Business", "For Brands",
   "For Creators" at section IDs that **don't exist** on the page (the real IDs are
   `audiences`, `creator-hub`, etc.), so 3 of 5 nav links scroll nowhere — the likely
   cause of "the landing page isn't easy to navigate."

**Decisions (locked in brainstorming):** ship these three fixes now; the "less generic"
redesign + tooling is a separate later effort. For #1, the brief should **drop the new
user straight into building that campaign** after signup (vs. saving a silent draft).

Pure **frontend** — no schema, edge-function, or secret changes.

## Architecture

### Part 1 — Honor the brief after signup ("drop them into building it")

The campaign builder already has a `?brief=` pre-fill (`useCampaignCreator.ts`): a
`?brief=<text>` param is fed to `submitInput(text, 'text')` → `donny-campaign-generate`
(`manual_text`) → full campaign ideas on the launchpad. We reuse it.

- **New isolated, unit-tested util** (e.g. `src/lib/pendingBrief.ts`):
  - `briefToText(brief): string` — a concise prompt summary from the brief's
    `{campaign_name, campaign_description, target_audience: string; content_suggestions: string[]}`
    (the shape `BriefGeneratorPreview.tsx` stores; ignores the `source_quality` metadata #206 appends).
  - `consumePendingBrief(role): { redirectTo: string } | null` — reads + parses
    `localStorage['pendingBrief']`, **always clears it**, and returns a redirect target
    **only for a campaign-creating role**:
    - `business_client` → `/dashboard/business/campaigns/create?brief=<encodeURIComponent(summary)>`
    - `brand` → `/dashboard/brand/campaigns/create?brief=<…>`
    - `content_creator` (no campaign builder) → returns `null` (brief cleared, no redirect).
    - Malformed JSON → clears and returns `null` (never throws).
- **Hook point:** the onboarding-completion navigation in
  `src/components/onboarding/OnboardingWizard.tsx` (currently
  `navigate(DASHBOARD_ROUTES[role])`). Call `consumePendingBrief(role)`; if it returns a
  target, navigate there instead of the dashboard.
- **Result:** a guest's saved brief becomes a real, pre-filled campaign right after
  signup. Promise honored. (Re-generation via `?brief=` is intentional — the authenticated
  builder produces the *full* campaign, an upgrade from the teaser.)

### Part 2 — "Join as a Business" buttons + meaningful role pre-select

- **Buttons:** add "Join as a Business" **above** "Join as a Creator" in `HeroSection.tsx`
  and `BottomCTA.tsx`, styled on-brand and distinct — pink-accent fill
  (`bg-dc-pink-accent-btn`, matching the existing brand-secondary), vs Get Started's teal
  fill and Creator's white outline. (Reuses the existing `BRAND_ROLE_ENABLED` "For Brands"
  button style; that brand button stays gated/unchanged.)
- **Make the role buttons distinct, not decorative:**
  - "Join as a Business" → `/auth?mode=signup&role=business`
  - "Join as a Creator" → `/auth?mode=signup&role=creator`
  - "Get Started" → `/auth?mode=signup` (generic; user picks).
- **`AuthPage.tsx`** reads the new `?role=` param: when it's `business`/`creator`/`brand`,
  **map the URL value to the profile enum** (`business→business_client`,
  `creator→content_creator`, `brand→brand`), pre-select that role, and jump straight to the
  `signup-form` step (skip `role-selection`). Additive — no `role` param keeps today's
  role-picker behavior exactly. (Note: this URL "role" vocabulary differs from Part 1's
  `consumePendingBrief(role)`, which takes the profile enum directly.)

### Part 3 — Navigation cleanup (repoint dead anchors)

In `Header.tsx`, repoint `navLinks` targets to **real** section IDs (verified against
`LandingPage.tsx`):

| Label | Current target (dead?) | New target |
|-|-|-|
| How It Works | `how-it-works` ✓ | unchanged |
| For Business | `for-business` ✗ | `audiences` (the AudienceLanes "who it's for" section) |
| For Creators | `for-creators` ✗ | `creator-hub` (CreatorHubSection) |
| For Brands | `for-brands` ✗ | drop (brand role hidden; anchor dead even when shown) |
| Contact | `contact` ✓ | unchanged |

Every remaining nav link then scrolls to a real section, desktop and mobile (same
`navLinks` array drives both). Exact business/creator anchors re-confirmed against
`AudienceLanes`/`CreatorHubSection` during build.

## Files

`src/lib/pendingBrief.ts` (+ `pendingBrief.test.ts`), `src/components/onboarding/OnboardingWizard.tsx`,
`src/pages/AuthPage.tsx`, `src/components/landing/HeroSection.tsx`,
`src/components/landing/BottomCTA.tsx`, `src/components/landing/Header.tsx`.
**Reuse unchanged:** the `?brief=` pre-fill in `useCampaignCreator.ts`,
`BriefGeneratorPreview.tsx`'s existing `setItem('pendingBrief', …)`.

## Out of scope (next effort)

The "less generic / one-of-a-kind" redesign and the design-tooling recommendations
(AI hero imagery via the existing `HERO_IMAGE` slot, motion, custom type/illustration).

## Testing

- **Unit (`pendingBrief.test.ts`):** `briefToText` summarizes all fields + tolerates
  missing ones; `consumePendingBrief` returns the business/brand create route, returns
  `null` for creator, returns `null` + clears on malformed JSON, and **always clears
  localStorage**.
- **Build/typecheck:** `npm run build` + `npm run typecheck` clean.
- **Manual (prod, post-deploy):** (a) guest → generate brief → "Save & sign up" → after
  onboarding the campaign builder opens pre-filled (business) / dashboard with brief
  cleared (creator); (b) "Join as a Business" lands on the business signup form,
  "Join as a Creator" on the creator form; (c) every header nav link scrolls to a real
  section, desktop + mobile.

## Invariants

- No schema / edge-function / secret change (pure frontend).
- `?role=`-less `/auth?mode=signup` behaves exactly as today (additive param).
- `pendingBrief` is **always cleared** once consumed (no stale carry-over on the next
  signup from the same browser).
- Consumption is hooked **only at new-user onboarding completion**. A guest who saves a
  brief then logs into an *existing* account (not a fresh signup) doesn't re-onboard, so
  the entry harmlessly lingers in `localStorage` until the next new signup clears it — an
  accepted corner (the CTA points new users at `?mode=signup`; no wrong campaign ever fires).
- The redesign is untouched here.
