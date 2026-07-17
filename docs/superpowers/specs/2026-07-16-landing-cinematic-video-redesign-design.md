# Landing Page — Cinematic AI‑Video Redesign

**Date:** 2026-07-16
**Status:** Design approved — pending spec review → implementation plan
**Branch:** `dc-landing-page-upgrade` (worktree)
**Supersedes/extends:** `docs/superpowers/specs/2026-06-28-landing-luxe-redesign` (Dark‑Luxe Editorial) and its follow‑ups (brief‑save, flash/perf). This is the next iteration on the same `src/components/landing/*` foundation, not a rebuild.

---

## 1. Problem & Goals

The public landing page (`src/pages/LandingPage.tsx` + `src/components/landing/*`) is structurally complete but visually inert: the AI‑content slots are empty placeholders (`HERO_IMAGE = ""`; `VideoSlot`/`MediaSlot` render branded gradients), the page is 10 sections and copy‑heavy, and it leads business‑first rather than exciting all three roles.

**Goals**
1. **Captivating** — a cinematic, alive hero that reads as premium and modern.
2. **Less wordy** — collapse 10 sections → 6; cut copy to headline‑plus‑one‑line per section.
3. **AI‑generated content clips as the moving backdrop** — real short‑form vertical clips, served properly.
4. **Excite all three roles** — Business, Creator, Brand each feel personally addressed.
5. **Recommend and adopt the best tooling** to generate and serve the clips.

**Non‑goals (YAGNI)**
- No DragonFeed clip‑sourcing implementation now (design the seam only; adapter is a future slice).
- No new database schema, no new edge function (reuse `capture-lead` and `generate-anonymous-brief`).
- No change to auth, the authenticated app, or the scoped‑`.dark` isolation mechanism.
- No fabricated testimonials/metrics (pre‑revenue honesty guardrail).

---

## 2. Approved Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| **Hero mood** | **Cinematic Dark Luxe** base (full‑bleed clip, moody premium scrim, few words) **+ Kinetic energy** (a faint drifting clip‑wall behind the scrim conveys "content everywhere"). |
| **Role framing** | **R2 — morphing role switcher.** Pills `Business · Creator · Brand` at the top of the hero; tapping one re‑films the hero (headline + background clip + CTA swap). Defaults to Business. |
| **Page structure** | **Lean · 6 sections** (+ footer). |
| **Clip serving** | **Managed video service — Cloudflare Stream** (Bunny Stream = cheaper fallback). Behind a swappable seam. |
| **Clip generation (recommended pipeline)** | Control the still, then animate: **Nano Banana Pro** (on‑brand stills) → **image‑to‑video** via **Veo 3.1** (hero money‑shots) and **Kling 2.x / Runway Gen‑4** (the many smaller reels) → trim to 4–8s silent seamless loops + export poster stills. |
| **Future clip source** | **DragonFeed** — real approved creator clips feed the backdrop later, through the same seam (dogfoods the product + rides the content flywheel). |
| **Header** | Fully **transparent, no divider line**; logo + nav float over the hero. |
| **Logo** | Existing transparent `/logo.webp`, sized up; clickable → home. |
| **Naming** | **"Donny"** everywhere — never "Donny AI". |

---

## 3. Architecture

**Approach: evolve `src/components/landing/*` in place.** Keep the hard‑won foundation:
- The scoped **`.dark` wrapper** on the landing root (`LandingPage.tsx`) — redefines dark CSS vars for the subtree only; never leaks into the authenticated app (`next-themes` writes only to `<html>`).
- The lightweight **`Reveal`** primitive (single shared `IntersectionObserver` + CSS; reduced‑motion‑safe).
- The perf‑hardened **`VideoSlot`** (poster‑first, `preload="none"`, in‑view gating, muted/loop/`playsInline`, reduced‑motion → poster only).
- The **code‑split route** + dark Suspense fallback (no white flash).
- The live **lead capture** (`leads` table + `capture-lead`) and **anonymous brief generator** (`generate-anonymous-brief` + `pendingBrief` flow).

**One new seam — the swappable clip source:**

```
landingClips.ts        # registry: semantic key -> { src, poster, provider }
useLandingClip(key)    # hook resolving the active source for a key
```

- Semantic keys: `hero.business`, `hero.creator`, `hero.brand`, `proof.reel`, … .
- **Source v1 (this slice):** a static config mapping keys → Cloudflare Stream playback URLs (HLS/mp4) + poster stills.
- **Source v2 (future, not built now):** a DragonFeed adapter returning approved public creator clips, behind the *same* hook. Components never change.
- Hero and any reel consume `useLandingClip(...)` → pass `{ src, poster }` into the existing `VideoSlot`. The registry is the single place the source is defined.

---

## 4. The 6 Sections

**Section anchor IDs** (the nav's scroll targets): `hero`, `see-it-work`, `how-it-works`, `pick-your-lane`, `proof`, `start-free`. The header "Contact" link points to `#start-free` (the contact/lead form now lives there); "How it works" → `#how-it-works`; "For business" / "For creators" → `#pick-your-lane`; "For brands" (gated) → `#pick-your-lane`.

1. **Hero** — transparent header (logo + nav), morphing role pills, `● Powered by Donny` eyebrow, ~4‑word per‑role headline (script accent on the last word), one supporting line, bright teal CTA + ghost "See it work ↓", floating "paste your website → a full campaign in 60s" chip. Cinematic dark backdrop clip + faint desktop‑only drifting clip‑wall.
   - Per‑role content (headline / clip / CTA) keyed off the active pill; `?role=` deep‑link pre‑selects (own‑property‑guarded, same pattern as `AuthPage`).
   - **Brand gating:** the Brand pill is gated by `BRAND_ROLE_ENABLED`. When off, the Brand pill is hidden **and** `?role=brand` no‑ops (falls back to Business), so the gated role is unreachable from the hero — mirroring the existing guarded `AuthPage` `?role=` handling.
2. **See it work** — elevates the existing brief generator (`DonnySection` / `BriefGeneratorPreview`) directly under the hero. "Watch Donny build your first campaign." → paste a URL → live brief. Preserves the `pendingBrief` → signup → campaign‑builder flow.
3. **How it works** — 3 steps, ~3 words each: **Paste your link · Donny builds it · Creators deliver.** Icon + motion, minimal prose.
4. **Pick your lane** — 3 cards (evolve `AudienceLanes`): Business ("Content in hours"), Creator ("Get paid to film"), Brand ("Scale campaigns") — one line + CTA each. Brand card gated by `BRAND_ROLE_ENABLED`. Reinforces the hero switcher.
5. **Proof** — one band merging today's `StoriesSection` + `DragonRewardsSection`: a few **honest** stat chips + real early‑user framing + a Dragon Rewards nod (gated by `useDragonRewardsEnabled()`). No fabricated testimonials/metrics.
6. **Start free** — big role‑aware final CTA merging `BottomCTA` + `LeadCaptureSection`; the Contact/lead form folds in here.

**+ Footer** — unchanged.

**Copy voice:** confident, concrete, few words. "Business" (not only "restaurant"); "creator" kept. Every section = headline + at most one supporting line.

---

## 5. Video Behaviour & Performance Discipline

- **Playback** reuses `VideoSlot`'s hardening: poster‑first, `preload="none"`, in‑view `IntersectionObserver`, muted/loop/`playsInline`, **reduced‑motion → poster only**. The **hero backdrop** must be **full‑bleed and controls‑less** (no `controls`, no `aspect-video`, no rounding, `object-cover`), so it uses a `VideoSlot` **`variant="backdrop"`** (or a thin dedicated backdrop component) that drops those; **framed reels** (e.g. in Proof) use `VideoSlot` as‑is. The `useLandingClip → { src, poster }` seam is identical either way.
- **Morphing hero:** the Business poster is the **LCP image** (preloaded); other roles' clips lazy‑load on pill tap.
- **Mobile stays light:** poster + at most one muted clip; never several autoplaying clips (honors the prior mobile‑WebKit crash lesson). The drifting clip‑wall is **desktop‑only** and **static under reduced‑motion**.
- **Header transparency:** transparent with no line by default. Open follow‑up (build‑time toggle, not blocking): optionally fade in a subtle blur once scrolled past the hero for legibility over the Proof band.
- **Fixed‑position safety:** the header is `fixed`; the landing route must remain free of transformed ancestors over fixed UI (the page is not wrapped in the `PageTransition` opacity‑only issue, but keep the drifting‑wall transform scoped inside the hero, never on an ancestor of the fixed header).
- **Cost:** a handful of short Cloudflare Stream clips ≈ a few $/month; it is *serving* cost, not AI spend, so it never touches the 15%‑of‑revenue AI cap.

---

## 6. Retained Pieces (nothing thrown away)

- **Brief generator** — same `generate-anonymous-brief` edge fn (already hardened) + `pendingBrief` save→signup→builder flow.
- **Lead capture** — same `capture-lead` edge fn + `leads` table (honeypot + fail‑open per‑IP throttle already in place); needs `LEADS_NOTIFY_EMAIL` set.
- **Feature flags** — `BRAND_ROLE_ENABLED` (static const, currently `false`) gates the Brand pill + lane card + "For Brands" nav; `useDragonRewardsEnabled()` gates the Proof rewards line.
- **Header nav** — repoint anchors to the new Lean‑6 section IDs (today's nav has a dead duplicate: both "For Business" and "For Brands" jump to `audiences`). "For Brands" stays gated.

---

## 7. Rollout & Testing

- **No schema change, no new edge function, no new secret** (public Cloudflare Stream playback needs none).
- **Ship‑before‑clips:** `VideoSlot` degrades to the branded gradient placeholder, so the redesign ships first; real Stream clips drop into `landingClips.ts` afterward with **no code change** to go live with video.
- **Tests (co‑located vitest):** the `landingClips` resolver and the `?role=` deep‑link parser; existing brief/`pendingBrief`/lead tests still cover those flows.
- **Gates:** `npm run build` + `npm run typecheck`; both viewports (desktop `lg:` / mobile base); `verify-prod` after deploy; **Codex second review**; `knowledge-sync` on branch finish.
- **Founder tasks (outside code):** create a Cloudflare Stream account; generate the clip set via the recommended pipeline; drop playback URLs + posters into `landingClips.ts`; confirm `LEADS_NOTIFY_EMAIL`.

---

## 8. Open Items (non‑blocking)

1. **Header scroll behaviour** — stay transparent throughout vs. fade‑in blur past the hero. Default: stay transparent; easy toggle.
2. **Final logo size** — dial in during implementation.
3. **DragonFeed clip source (v2)** — the adapter behind `useLandingClip`; separate future slice once DragonFeed has enough approved public clips.
4. **Managed service final pick** — Cloudflare Stream (recommended) vs. Bunny Stream (cheaper). Either sits behind the seam.

---

## 9. Files Touched (anticipated)

- **Rework:** `LandingPage.tsx` (section order → 6), `HeroSection.tsx` (morphing switcher + clip + transparent‑over integration), `Header.tsx` (transparent, no line, nav anchors, logo size), `DonnySection.tsx` (→ "See it work"), `AudienceLanes.tsx` (→ "Pick your lane"), `StoriesSection.tsx` + `DragonRewardsSection.tsx` (→ merged Proof), `LeadCaptureSection.tsx` + `BottomCTA.tsx` (→ merged "Start free").
- **New:** `landingClips.ts` + `useLandingClip.ts` (the swappable clip seam) with co‑located tests; a `VideoSlot` **`variant="backdrop"`** (controls‑less, full‑bleed, `object-cover`) for the hero backdrop. v1 ships the registry with placeholder/empty entries so `VideoSlot` still degrades to the gradient (§7 "ship‑before‑clips").
- **Retire/absorb:** `WhyDragonCandy.tsx`, `HowItWorks.tsx` (folded/simplified), `CreatorHubSection.tsx` (absorbed into Proof/lanes as needed) — final disposition decided in the plan.
- **Reused unchanged:** `MediaSlot.tsx`, `Reveal.tsx`, `BriefGeneratorPreview.tsx`, `capture-lead`, `generate-anonymous-brief`. `VideoSlot.tsx` gains the additive `variant="backdrop"`; its existing framed behavior is preserved.
- **Copy:** replace all "Donny AI" → "Donny" on the landing surface.
