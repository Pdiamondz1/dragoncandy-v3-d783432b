# Session: Landing page Dark-Luxe redesign + public lead capture (2026-06-28)

Branch `feat/landing-luxe-redesign` (off `origin/main`). Founder brief: the landing page
felt text-heavy/boxy and didn't read as a premium lifestyle "creator hub"; broaden audience
beyond "restaurants"; explain the AI underneath; add real stories + signup rewards; add
video/imagery; and let non-registrants contact us into a lead database. Decided via
`/frontend-design` + AskUserQuestion: **Dark Luxe Editorial** aesthetic · **placeholder
image/video slots** (founder fills with Nano Banana Pro) · **full lead pipeline** · keep the
three audience lanes (Business / Brands-gated / Creators).

## What shipped

**Landing redesign** (`src/pages/LandingPage.tsx` + `src/components/landing/*`):
- New section order: cinematic Hero → Why (de-boxed editorial rows) → Donny/AI tech story →
  HowItWorks (numbered flow) → AudienceLanes (Business / Brands-gated / Creators) → Stories
  (testimonials) → Dragon Rewards (flag-gated) → Creator Hub (video + gallery) → lead-capture
  Contact → final CTA → dark footer.
- New primitives: `Reveal.tsx` (the single scroll-reveal wrapper — `m.div` + `whileInView`,
  collapses to static under `useReducedMotion`; LazyMotion runs `strict` so it imports
  `{ motion as m }` from `@/lib/motion`), `MediaSlot.tsx` + `VideoSlot.tsx` (branded
  teal→pink gradient placeholders that become real assets via one `src`/`poster` prop — built
  for Nano Banana Pro finals).
- Restyled to dark: Header (sticky glass bar + dark mobile `Sheet`), HeroSection (full-bleed),
  HowItWorks, BottomCTA, BriefGeneratorPreview (literals → dark-friendly classes; logic
  untouched; its own `<section>` → `<div>` so DonnySection owns the heading; lazy-loaded
  inside DonnySection to keep the code-split).
- New sections: WhyDragonCandy, DonnySection, AudienceLanes, StoriesSection,
  DragonRewardsSection, CreatorHubSection, LeadCaptureSection.
- Broadened "restaurant" → "business"; kept "creator". Retired `FeatureCard`,
  `FeatureSection`, `BrandSection` (content folded into Why + AudienceLanes).
- Dragon Rewards section is gated behind the existing `useDragonRewardsEnabled()` hook
  (`DRAGON_REWARDS_ENABLED`, currently OFF) and uses **action-based** copy + the real
  `DRAGON_TIERS` ladder — NO fake welcome bonus (verified there is no signup bonus).

**Public lead-capture pipeline** (ledger-first):
- Migration `20260628140000_leads_capture.sql`: `public.leads` table; RLS = internal-team
  read/update only via `public.is_internal_user()`; **no anon/authenticated INSERT or SELECT
  policy** — the table holds contact PII and has no public DML surface.
- Edge fn `capture-lead` (`verify_jwt=false`): validate → **service-role insert** (bypasses
  RLS) → Resend team notify. Honeypot (`website` field), length caps, and a **fail-open
  per-IP throttle** (5 / 10 min, IP from `x-forwarded-for`, stored in `metadata`). Graceful
  no-email when `LEADS_NOTIFY_EMAIL` unset (lead still saved).
- Frontend: `useSubmitLead` mutation hook + `LeadCaptureSection` form (name/email/phone/
  company/audience-select/message, hidden honeypot, success state). The brand audience option
  + the BottomCTA "brand" copy are gated on `BRAND_ROLE_ENABLED` (Codex catch).

## Key decisions & patterns

- **Scoped dark theme inside the light app.** The whole landing is wrapped in
  `<div className="dark min-h-screen bg-dc-dark text-white">`. Tailwind `darkMode:["class"]`
  means `.dark` redefines the dark CSS variables (`src/index.css`) for that subtree only;
  `next-themes` only writes to `<html>`, so it never leaks into the authenticated app.
  Precedent: `src/pitch/slides/SlideShell.tsx`. Two caveats handled: Radix portals
  (the Header mobile `Sheet`) escape `.dark` → explicit dark literals; literal classes
  (`bg-white`, `text-gray-*`) don't respond to `.dark` → restyle to dark-friendly classes.
- **Closed-anon-DML lead table.** Unlike `analytics_events` (anon INSERT policy), the leads
  table has NO anon policy at all — the edge function inserts as service role, so PII is never
  exposed to a public DML surface. The honeypot only stops bots that fill the hidden field; a
  fail-open IP throttle stops a script POSTing valid payloads (DB + inbox spam) — fail-open so
  a throttle hiccup never drops a real lead.
- **Placeholder slots, not stock.** The founder generates final imagery/video with Nano Banana
  Pro; `MediaSlot`/`VideoSlot` ship polished branded placeholders so the page looks finished
  with zero broken images, swappable via a single prop.

## Verification

- typecheck / lint / build all green; `dragon-rewards-gate.test.tsx` passes.
- Desktop verified in-browser across every section (dark canvas, gradient slots, gated
  rewards section absent with flag OFF, Brands lane absent with `BRAND_ROLE_ENABLED=false`).
  Mobile not screenshot-verifiable (the extension can't shrink the Chrome viewport below
  ~1280px) — responsive correctness is by-construction (base = mobile, `lg:` = desktop) +
  the post-deploy `verify-prod` both-viewport check.
- Backend on prod: migration applied via MCP; `capture-lead` deployed (MCP, then re-deployed
  from disk via the **newly-installed Supabase CLI**). Anon curl tests: valid→`200{success,id}`,
  honeypot→`200{success}` no row, bad-email→`400`, preflight→`200`, throttle→`5×200 then 429`.
  Row lands `status=new`; anon cannot SELECT; `get_advisors(security)` adds no new advisor for
  `leads` (0 of 150 mention it). Test rows cleaned up.
- Codex second review: 2 P2s (brand-gate the lead form/CTA copy; add server-side throttle) →
  fixed → re-run **clean**.

## Founder go-live (manual, post-merge)
- Generate hero/lifestyle images + creator-hub reel with Nano Banana Pro → drop into the
  `MediaSlot`/`VideoSlot` `src`/`poster` props (and `HERO_IMAGE` in HeroSection).
- Set the `LEADS_NOTIFY_EMAIL` edge secret to the inbox that should receive leads.
- (When ready) flip `DRAGON_REWARDS_ENABLED` to reveal the rewards section.

## Also this session
- Installed the **Supabase CLI** (v2.108.0) into the global npm bin dir (on PATH) from the
  GitHub release binary — `winget`/`scoop` had no package and global `npm i -g supabase` is
  unsupported. Already authenticated (lists projects, DragonCandy_v3 `linked:true`). Edge-fn
  deploys can now use `supabase functions deploy <name> --no-verify-jwt --project-ref …`
  (bundles `../_shared/*` from disk — no MCP re-paste/transcription risk).
