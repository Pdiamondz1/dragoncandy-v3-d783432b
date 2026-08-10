---
title: Landing Redesign & Public Lead Capture
type: concept
created: 2026-06-28
updated: 2026-06-28
sources: [2026-06-28-landing-redesign-lead-capture.md]
tags: [landing, design, dark-theme, lead-capture, edge-function, rls, motion]
---
# Landing Redesign & Public Lead Capture

The public marketing landing page (`src/pages/LandingPage.tsx` + `src/components/landing/*`)
rebuilt into a **Dark Luxe Editorial** experience, plus a first-of-its-kind **public
lead-capture pipeline** so non-registrants can contact the team into a private database.
Two reusable patterns came out of it.

## Pattern 1 — Scoped dark theme inside the light app

The whole landing subtree is wrapped in:

```tsx
<div className="dark min-h-screen overflow-x-hidden bg-dc-dark text-white">
```

- Tailwind `darkMode: ["class"]` (`tailwind.config.ts`) means a `.dark` ancestor redefines
  the dark CSS variables (`src/index.css`) for **that subtree only**. CSS custom properties
  cascade, so reused shadcn primitives (Input/Textarea/Button/Card) render dark for free.
- It **cannot leak** into the authenticated app: `next-themes` ([[Error Handling Patterns]]
  sibling `ThemeProvider`) only ever writes the theme class to `<html>`, never to this
  wrapper; the app renders on routes that never include it. `bg-dc-dark` pins the exact brand
  charcoal (and covers overscroll).
- Precedent for a dark surface in the light app: `src/pitch/slides/SlideShell.tsx`
  ([[Investor Pitch Deck & Capital Raise]]).

**Two caveats (both real here):**
1. **Radix portals escape `.dark`** — they render into `document.body`, outside the wrapper.
   The only landing offender was the Header mobile menu (`SheetContent`); fix with explicit
   dark literals (`bg-dc-dark text-white border-white/10`). App-global Toaster/Sonner are
   unaffected.
2. **Literal classes don't respond to `.dark`** — `bg-white` / `text-gray-*` stay light.
   Restyle bespoke surfaces (e.g. `BriefGeneratorPreview`) to dark-friendly literals
   (`bg-white/5`, `text-white/70`, `border-dc-teal/30`) or semantic tokens.

Brand rule reinforced: **never flat gray** — on dark use `bg-white/5`, `text-white/60`,
`border-white/10`, teal/pink tints.

**Motion + placeholders.** One reveal primitive, `Reveal.tsx`, wraps section content
(`m.div` + `whileInView`, `once:true`; collapses to a static `<div>` under
`useReducedMotion`). LazyMotion runs in `strict` mode (`src/App.tsx`), so it imports
`{ motion as m }` from `@/lib/motion` — never `motion.*`. `MediaSlot` / `VideoSlot` render
branded teal→pink gradient placeholders that become real assets via a single `src`/`poster`
prop — designed so the founder drops in **Nano Banana Pro** finals later with zero broken
images.

**Audience + gating.** Copy broadened "restaurant" → "business"; "creator" kept. Three lanes
(Business / Brands / Creators) with the Brands lane — and the lead-form brand option and the
final-CTA "brand" copy — gated on the compile-time `BRAND_ROLE_ENABLED`. The Dragon Rewards
section is gated on `useDragonRewardsEnabled()` ([[Dragon Rewards Engine (DRE)]],
`DRAGON_REWARDS_ENABLED`, seeded OFF) and uses **action-based** copy — there is no signup
bonus, so it never promises one.

## Pattern 2 — Public lead capture (closed-anon-DML + service-role edge fn)

Goal: a logged-out visitor leaves contact info → a private row → the team gets an email.

- **Table `public.leads`** (`20260628140000_leads_capture.sql`): name/email/phone/company/
  `audience` (business|brand|creator|other) / message / source / `status` (new→…) /
  nullable `user_id` / `metadata jsonb`. RLS = **internal-team read/update only** via
  `public.is_internal_user()` ([[AIOS Stakeholder Invite]] gate). **No anon/authenticated
  INSERT or SELECT policy at all** — the table holds contact PII and gets no public DML
  surface. This deliberately differs from `analytics_events` (which *does* have an anon INSERT
  policy because its data is non-sensitive telemetry).
- **Edge fn `capture-lead`** (`verify_jwt=false`): validate → **service-role insert** (the
  service key has `BYPASSRLS`, so no anon policy is needed) → Resend team notify (reuses the
  [[Notification Delivery]] Resend setup; `from: alerts@notify.dragoncandy.io`). The honeypot
  (`website`) only stops bots that fill the hidden field; a **fail-open per-IP throttle**
  (5 / 10 min, IP from `x-forwarded-for`, stored in `metadata`, mirroring
  `generate-anonymous-brief`) stops a script POSTing valid payloads. Fail-open = a throttle
  hiccup never drops a real lead. Email is best-effort: a transient Resend failure still
  returns `{success,id}` (lead saved); when `LEADS_NOTIFY_EMAIL` is unset it logs + skips.
- **Frontend**: `useSubmitLead` (React Query mutation → `supabase.functions.invoke`) +
  `LeadCaptureSection` form with a visually-hidden honeypot and a success state.

**Reading leads now**: the per-lead Resend email + the Supabase dashboard (the internal-team
RLS read is in place). A `/internal/leads` triage view is a clean follow-up (not built).

## Key Decisions
- Dark theme is **scoped via a `.dark` wrapper + `bg-dc-dark`**, never a global theme change.
- Leads table has **no public DML surface**; the edge function inserts as service role.
- Imagery ships as **branded placeholder slots** (Nano Banana Pro-ready), not stock.
- Rewards copy is **action-based and flag-gated** — no fabricated signup bonus.

## Known Issues / Follow-ups
- Founder go-live: drop Nano Banana Pro assets into the slots; optionally flip
  `DRAGON_REWARDS_ENABLED`. **`LEADS_NOTIFY_EMAIL` is DONE** — set 2026-08-07, verified
  2026-08-09.
- **Verify an edge secret with `supabase secrets list --project-ref <ref>`** — it returns each
  secret's name, SHA-256 digest and `updated_at`, so presence and change are both provable
  without exposing a value. This is worth stating explicitly because `PROJECT_CONTEXT.md` §5
  carried the opposite claim ("edge secrets aren't listable… rests on founder knowledge, not a
  check") and that claim is what kept this item sitting in *Built — awaiting founder go-live* for
  two days after it was actually done. The digest is also the tool for the harder question — "did
  this secret change?" — which a dashboard eyeball cannot answer.
- Mobile not screenshot-verifiable in-session (extension viewport floor ~1280px) — covered by
  the post-deploy [[verify-prod]] both-viewport check.
- A `/internal/leads` triage UI is deferred.

## See Also
- [[Notification Delivery]] — the Resend email path the notify reuses
- [[Supabase]] — RLS + edge functions
- [[Dragon Rewards Engine (DRE)]] — the flag-gated rewards section
- [[AIOS Stakeholder Invite]] — `is_internal_user()` admin gate
- [[Investor Pitch Deck & Capital Raise]] — `SlideShell` dark-surface precedent
