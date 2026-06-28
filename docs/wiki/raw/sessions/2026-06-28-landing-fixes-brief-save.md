# Landing fixes — brief-save + Business CTAs + nav (2026-06-28)

Branch `feat/landing-fixes-brief-save`. Pure frontend; no schema/edge-fn/secret change.
Prompted by a founder screenshot + the question "if a guest signs up, is that brief
actually saved to their account? If not that's fooling new users."

## What shipped

1. **Brief-save trust bug (the keystone).** `BriefGeneratorPreview` wrote a guest's brief to
   `localStorage['pendingBrief']` on "Save this brief — sign up free", but **nothing ever read it
   back** (confirmed repo-wide: one `setItem`, zero `getItem`) — so the brief was silently discarded
   after signup. This was actually *designed* in the 2026-04-27 donny-rag-pricing-ux spec ("on signup
   → check pendingBrief → attach to the new account") but the read half was never built. Fix: a small
   tested util `src/lib/pendingBrief.ts` (`briefToText` + `consumePendingBrief`), hooked at
   `OnboardingWizard` completion — a new **business/brand** user is dropped straight into the campaign
   builder pre-filled via its existing `?brief=` mechanism; a **creator** (no builder) just has the key
   cleared. Always clears the key. Decision (founder): "drop them into building it" (vs a silent draft).

2. **"Join as a Business" CTA** added above "Join as a Creator" in `HeroSection` + `BottomCTA`
   (pink-accent fill), with a `?role=` hint so the two role buttons actually differ — `AuthPage` reads
   `?role=business|creator` and jumps straight to the signup form (skips the role picker).

3. **Navigation cleanup.** 3 of 5 header nav links (`for-business`/`for-brands`/`for-creators`) pointed
   at section IDs that don't exist → dead scrolls. Repointed to real IDs (`audiences`/`creator-hub`);
   "For Brands" gated by label so it stays hidden under `BRAND_ROLE_ENABLED=false`.

## Gotchas / decisions

- **Concurrent-work collision avoided going forward:** earlier this session a redundant brief-generator
  fix (#207) was opened against an already-merged #206 — the lesson (re-fetch `origin/main` before
  deploying/merging after long work) was applied here by branching off fresh `origin/main`.
- **Scope split:** the founder also asked to make the landing "less generic / one-of-a-kind" + advise on
  tools. That subjective **redesign is a deliberately separate next effort** (not in this PR); this slice
  is the concrete fixes only.
- **Codex second review** caught 3 real issues across 2 rounds: (a) repointing "For Brands" broke the
  `visibleNavLinks` filter (matched on the old target) → caught in plan review, fixed by gating on label +
  keying maps by label; (b) `briefToText` ignored the alternate `title`/`description` brief shape → added
  fallbacks; (c) the `?role=` plain-object map returned inherited prototype members for
  `?role=constructor`/`toString` → own-property check. Clean after.

## Files

`src/lib/pendingBrief.ts` (+ test), `src/components/onboarding/OnboardingWizard.tsx`,
`src/pages/AuthPage.tsx`, `src/components/landing/HeroSection.tsx`,
`src/components/landing/BottomCTA.tsx`, `src/components/landing/Header.tsx`.
Spec: `docs/superpowers/specs/2026-06-28-landing-fixes-brief-save-design.md`.
Plan: `docs/superpowers/plans/2026-06-28-landing-fixes-brief-save.md`.
