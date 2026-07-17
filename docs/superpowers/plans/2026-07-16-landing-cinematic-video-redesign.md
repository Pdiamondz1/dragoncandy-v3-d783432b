# Landing Page — Cinematic AI-Video Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public landing page into a cinematic, kinetic, 6-section experience with a morphing per-role hero and a swappable AI-video backdrop layer, while reusing the existing hardened landing foundation.

**Architecture:** Evolve `src/components/landing/*` in place. Add two thin pure units — a `landingClips` clip-source seam and `heroRole` helpers — plus an additive `VideoSlot variant="backdrop"`. Restructure `LandingPage.tsx` from 10 sections to 6. No schema, edge-function, or secret changes.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind (`dc-*` tokens), Vitest + @testing-library/react. Clip serving = Cloudflare Stream (URLs dropped into the registry post-ship).

**Spec:** `docs/superpowers/specs/2026-07-16-landing-cinematic-video-redesign-design.md`

---

## File Structure

**New:**
- `src/components/landing/landingClips.ts` — clip registry (semantic key → `{ src, poster }`) + pure `resolveLandingClip()`. v1 entries are empty so `VideoSlot` degrades to the gradient.
- `src/components/landing/landingClips.test.ts`
- `src/components/landing/heroRole.ts` — role types, `parseRoleParam()`, per-role hero content map, `visibleRoles()` (BRAND gating).
- `src/components/landing/heroRole.test.ts`
- `src/components/landing/ProofSection.tsx` — merged Stories + Rewards (honest proof, no fabricated testimonials).
- `src/components/landing/StartFreeSection.tsx` — merged BottomCTA + LeadCapture, `id="start-free"`.

**Modified:**
- `src/components/landing/VideoSlot.tsx` — additive `variant` prop.
- `src/components/landing/VideoSlot.test.tsx` — new test file for variant behavior.
- `src/components/landing/HeroSection.tsx` — morphing role switcher + backdrop clip + transparent-over-header.
- `src/components/landing/Header.tsx` — transparent, no line, nav anchors → Lean-6 IDs, bigger logo.
- `src/components/landing/DonnySection.tsx` — `id="see-it-work"`, lean copy, "Donny".
- `src/components/landing/HowItWorks.tsx` — 3 steps, lean copy.
- `src/components/landing/AudienceLanes.tsx` — `id="pick-your-lane"`, one-line lane copy.
- `src/pages/LandingPage.tsx` — 6-section order; drop retired imports.

**Retired (deleted):**
- `src/components/landing/WhyDragonCandy.tsx`, `CreatorHubSection.tsx` (cut), `StoriesSection.tsx` + `DragonRewardsSection.tsx` (→ ProofSection), `BottomCTA.tsx` + `LeadCaptureSection.tsx` (→ StartFreeSection).

**Reused unchanged:** `Reveal.tsx`, `MediaSlot.tsx`, `BriefGeneratorPreview.tsx`; edge fns `capture-lead`, `generate-anonymous-brief`; hook `useSubmitLead`.

**Conventions to follow (already in the codebase):**
- Only `console.error`/`console.warn` allowed. Named exports for components. `dc-*` tokens, no raw hex.
- `?role=` guard pattern (from `AuthPage.tsx:34-36`): `Object.prototype.hasOwnProperty.call(map, r)` — own-property only.
- Landing logic/pure helpers get co-located vitest tests; presentational components are verified via build + both-viewport check (matches existing landing files, which have no component tests).
- Trust "Tests N passed, 0 failed", not the vitest exit code (pre-existing e2e file failures — see memory).

---

## Task 1: `landingClips` clip-source seam (TDD)

**Files:**
- Create: `src/components/landing/landingClips.ts`
- Test: `src/components/landing/landingClips.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/landing/landingClips.test.ts
import { describe, it, expect } from "vitest";
import { resolveLandingClip, type LandingClipKey } from "./landingClips";

describe("resolveLandingClip", () => {
  it("returns empty src/poster for an unfilled key (ship-before-clips)", () => {
    expect(resolveLandingClip("hero.business")).toEqual({ src: undefined, poster: undefined });
  });

  it("returns the configured entry when the registry has one", () => {
    const registry = { "hero.business": { src: "s.mp4", poster: "p.jpg" } } as Record<LandingClipKey, { src?: string; poster?: string }>;
    expect(resolveLandingClip("hero.business", registry)).toEqual({ src: "s.mp4", poster: "p.jpg" });
  });

  it("never throws on a key missing from a partial registry", () => {
    expect(resolveLandingClip("proof.reel", {} as never)).toEqual({ src: undefined, poster: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/landing/landingClips.test.ts`
Expected: FAIL — cannot find module `./landingClips`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/landing/landingClips.ts
/**
 * Swappable clip-source seam for the landing page. Components ask for a semantic key
 * and get back { src, poster } — blind to where it comes from.
 *
 * v1 source: this static registry, pointing at Cloudflare Stream playback URLs + poster
 * stills. Entries are EMPTY on purpose so VideoSlot degrades to its branded gradient until
 * the founder drops real URLs in (ship-before-clips). A future DragonFeed adapter can back
 * `resolveLandingClip` instead, with zero changes to any consuming component.
 */
export type LandingClipKey =
  | "hero.business"
  | "hero.creator"
  | "hero.brand"
  | "proof.reel";

export interface LandingClip {
  src?: string;
  poster?: string;
}

/** v1 registry — fill `src`/`poster` with Cloudflare Stream URLs when clips are ready. */
export const LANDING_CLIPS: Record<LandingClipKey, LandingClip> = {
  "hero.business": {},
  "hero.creator": {},
  "hero.brand": {},
  "proof.reel": {},
};

export function resolveLandingClip(
  key: LandingClipKey,
  registry: Record<LandingClipKey, LandingClip> = LANDING_CLIPS,
): LandingClip {
  const entry = registry[key];
  return { src: entry?.src, poster: entry?.poster };
}
```

Also add the trivial hook in the same file (kept co-located; it is a one-liner over the resolver, no separate test needed):

```ts
/** Hook form for components. v1 is a pure pass-through over the static registry. */
export function useLandingClip(key: LandingClipKey): LandingClip {
  return resolveLandingClip(key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/landing/landingClips.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/landingClips.ts src/components/landing/landingClips.test.ts
git commit -m "feat(landing): swappable landingClips clip-source seam"
```

---

## Task 2: `heroRole` helpers — roles, deep-link, content map (TDD)

**Files:**
- Create: `src/components/landing/heroRole.ts`
- Test: `src/components/landing/heroRole.test.ts`

**Context:** Mirror the guarded `?role=` parse from `AuthPage.tsx:34-36`. `BRAND_ROLE_ENABLED` (from `@/lib/featureConfig`, currently `false`) gates the Brand role everywhere.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/landing/heroRole.test.ts
import { describe, it, expect } from "vitest";
import { parseRoleParam, visibleRoles, HERO_CONTENT, type HeroRole } from "./heroRole";

describe("visibleRoles", () => {
  it("hides brand when the flag is off", () => {
    expect(visibleRoles(false)).toEqual(["business", "creator"]);
  });
  it("shows brand when the flag is on", () => {
    expect(visibleRoles(true)).toEqual(["business", "creator", "brand"]);
  });
});

describe("parseRoleParam", () => {
  it("returns a valid visible role", () => {
    expect(parseRoleParam("creator", false)).toBe("creator");
  });
  it("falls back to business for a gated role when brand is off", () => {
    expect(parseRoleParam("brand", false)).toBe("business");
  });
  it("accepts brand when the flag is on", () => {
    expect(parseRoleParam("brand", true)).toBe("brand");
  });
  it("rejects inherited prop names (prototype-pollution guard)", () => {
    expect(parseRoleParam("constructor", true)).toBe("business");
    expect(parseRoleParam("toString", true)).toBe("business");
  });
  it("falls back to business for null/unknown", () => {
    expect(parseRoleParam(null, true)).toBe("business");
    expect(parseRoleParam("nope", true)).toBe("business");
  });
});

describe("HERO_CONTENT", () => {
  it("has content + a signup role for every role", () => {
    (["business", "creator", "brand"] as HeroRole[]).forEach((r) => {
      expect(HERO_CONTENT[r].headline.length).toBeGreaterThan(0);
      expect(HERO_CONTENT[r].signupRole).toBe(r);
      expect(HERO_CONTENT[r].clipKey).toContain("hero.");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/landing/heroRole.test.ts`
Expected: FAIL — cannot find module `./heroRole`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/landing/heroRole.ts
import type { LandingClipKey } from "./landingClips";

export type HeroRole = "business" | "creator" | "brand";

export interface HeroContent {
  /** Pill label. */
  label: string;
  /** ~4-word headline; `accent` renders in the script font. */
  headline: string;
  accent: string;
  sub: string;
  primaryCta: string;
  /** Passed to /auth?mode=signup&role=… (own-property-guarded downstream). */
  signupRole: HeroRole;
  clipKey: LandingClipKey;
}

export const HERO_CONTENT: Record<HeroRole, HeroContent> = {
  business: {
    label: "Business",
    headline: "Your business, always",
    accent: "filming.",
    sub: "Vetted local creators, AI-built campaigns, real content in hours — not weeks.",
    primaryCta: "Get started free",
    signupRole: "business",
    clipKey: "hero.business",
  },
  creator: {
    label: "Creator",
    headline: "Get paid to make content you",
    accent: "love.",
    sub: "Local gigs matched to your style. Build a portfolio that pays — with fast payouts.",
    primaryCta: "Join as a creator",
    signupRole: "creator",
    clipKey: "hero.creator",
  },
  brand: {
    label: "Brand",
    headline: "Campaigns that scale",
    accent: "themselves.",
    sub: "Multi-location reach, a vetted creator network, and real-time ROI.",
    primaryCta: "Launch campaigns",
    signupRole: "brand",
    clipKey: "hero.brand",
  },
};

export function visibleRoles(brandEnabled: boolean): HeroRole[] {
  return brandEnabled ? ["business", "creator", "brand"] : ["business", "creator"];
}

/**
 * Guarded ?role= parse. Own-property check only (rejects ?role=constructor and other
 * inherited names — mirrors AuthPage). A gated/unknown/null role falls back to business,
 * so a hidden role is never reachable from the hero.
 */
export function parseRoleParam(raw: string | null, brandEnabled: boolean): HeroRole {
  if (!raw || !Object.prototype.hasOwnProperty.call(HERO_CONTENT, raw)) return "business";
  const role = raw as HeroRole;
  return visibleRoles(brandEnabled).includes(role) ? role : "business";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/landing/heroRole.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/heroRole.ts src/components/landing/heroRole.test.ts
git commit -m "feat(landing): heroRole helpers (roles, guarded deep-link, content map)"
```

---

## Task 3: `VideoSlot` backdrop variant (TDD)

**Files:**
- Modify: `src/components/landing/VideoSlot.tsx`
- Test: `src/components/landing/VideoSlot.test.tsx`

**Context:** The current `VideoSlot` always renders a framed 16:9 player with visible `controls` and `rounded-3xl`. The hero backdrop needs a full-bleed, controls-less, aspect-free treatment. Add an additive `variant` prop (default `"framed"` preserves today's behavior). Reduced-motion / in-view gating logic is unchanged.

- [ ] **Step 1: Write the failing test**

> **Environment note (required):** the repo's vitest defaults to `environment: 'node'` (`vite.config.ts`). Every `@testing-library/react` render test in this codebase opens with `// @vitest-environment jsdom` as **line 1** — this file must too. jsdom also does not implement `HTMLMediaElement.play`, which the ambient-play effect calls, so stub it in `beforeEach`. (The pure tests in Tasks 1 & 2 need neither — they run fine under `node`.)

```tsx
// @vitest-environment jsdom
// src/components/landing/VideoSlot.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { VideoSlot } from "./VideoSlot";

beforeEach(() => {
  // jsdom doesn't implement HTMLMediaElement.play; the ambient-play effect calls it.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined as unknown as void);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VideoSlot variant", () => {
  it("framed (default) keeps controls + aspect-video + rounding", () => {
    const { container } = render(<VideoSlot src="x.mp4" poster="p.jpg" />);
    const video = container.querySelector("video")!;
    expect(video).toBeTruthy();
    expect(video.hasAttribute("controls")).toBe(true);
    expect(container.querySelector(".aspect-video")).toBeTruthy();
  });

  it("backdrop drops controls, is full-bleed, uses object-cover, and keeps preload=none", () => {
    const { container } = render(<VideoSlot src="x.mp4" poster="p.jpg" variant="backdrop" />);
    const video = container.querySelector("video")!;
    expect(video.hasAttribute("controls")).toBe(false);
    expect(video.getAttribute("preload")).toBe("none"); // hardening retained on backdrop (spec §5)
    expect(container.querySelector(".aspect-video")).toBeNull();
    expect(container.querySelector(".h-full.w-full.object-cover")).toBeTruthy();
  });

  it("backdrop without src still renders the branded placeholder", () => {
    const { container } = render(<VideoSlot variant="backdrop" />);
    expect(container.querySelector("video")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/landing/VideoSlot.test.tsx`
Expected: FAIL — `variant` not supported / backdrop still shows controls.

- [ ] **Step 3: Implement the variant**

In `VideoSlot.tsx`:
1. Extend the interface: add `variant?: "framed" | "backdrop";` (default `"framed"`).
2. Compute wrapper + video classes by variant. Keep all existing hardening (reduced-motion → poster only, in-view IntersectionObserver, `preload="none"`, muted/loop/playsInline).

```tsx
// props
export function VideoSlot({
  src, poster, label = "Showreel", autoplay = true, variant = "framed", className = "",
}: VideoSlotProps) {
  // …unchanged reduce/ambient/observer logic…

  const isBackdrop = variant === "backdrop";
  const wrapClass = isBackdrop
    ? `relative h-full w-full overflow-hidden ${className}`          // full-bleed
    : `relative aspect-video overflow-hidden rounded-3xl ${className}`; // framed (today)

  return (
    <div ref={wrapRef} className={wrapClass}>
      {src ? (
        <video
          ref={videoRef}
          muted={ambient}
          loop={ambient}
          playsInline
          controls={!isBackdrop}
          poster={poster}
          preload="none"
          className="h-full w-full object-cover"
        >
          <source src={src} />
        </video>
      ) : (
        // existing branded placeholder — for backdrop, drop the rounded corners:
        <div className={`absolute inset-0 bg-gradient-to-br from-dc-teal/25 via-dc-dark to-dc-pink-accent/25 ${isBackdrop ? "" : "ring-1 ring-inset ring-white/10"}`}>
          {/* …existing blobs + play badge + label… (hide the centered play badge when isBackdrop) */}
        </div>
      )}
    </div>
  );
}
```

Add `variant?: "framed" | "backdrop";` to `VideoSlotProps`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/landing/VideoSlot.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/VideoSlot.tsx src/components/landing/VideoSlot.test.tsx
git commit -m "feat(landing): additive VideoSlot variant=backdrop (full-bleed, controls-less)"
```

---

## Task 4: Rebuild the Hero — morphing role switcher + backdrop clip

**Files:**
- Modify: `src/components/landing/HeroSection.tsx`

**Context:** Uses `heroRole` (Task 2), `useLandingClip` (Task 1), `VideoSlot variant="backdrop"` (Task 3). Header is transparent (Task 5) and overlays; the hero owns the top padding so content clears the fixed header.

- [ ] **Step 1: Implement the morphing hero**

Key behaviors:
- `const brandEnabled = BRAND_ROLE_ENABLED;` `const roles = visibleRoles(brandEnabled);`
- Initial role from URL: `const [params] = useSearchParams(); const [role, setRole] = useState<HeroRole>(() => parseRoleParam(params.get("role"), brandEnabled));`
- `const content = HERO_CONTENT[role];` `const clip = useLandingClip(content.clipKey);`
- Backdrop: absolutely-positioned `VideoSlot variant="backdrop" src={clip.src} poster={clip.poster}` behind a legibility scrim (reuse today's `bg-gradient-to-t from-dc-dark …`). When `clip.src` is empty it shows the branded gradient (ship-before-clips).
- Kinetic clip-wall: a **desktop-only, reduced-motion-static** low-opacity layer behind the scrim (see snippet). Keep it inside the hero — never on an ancestor of the fixed header.
- Pills row: map `roles` → button; active pill = teal fill. `onClick={() => setRole(r)}`.
- Eyebrow: `● Powered by Donny` (never "Donny AI").
- Headline: `content.headline` + `<span class="font-script text-gradient">{content.accent}</span>`.
- Sub line: `content.sub`.
- CTAs: primary teal → `navigate(\`/auth?mode=signup&role=${content.signupRole}\`)`; ghost "See it work ↓" → `document.getElementById("see-it-work")?.scrollIntoView({behavior:"smooth"})`.
- Floating chip: "✨ Paste your website → a full campaign in 60s".
- Keep `section` with `id="hero"`, `min-h` cinematic height, `overflow-hidden`, and top padding (`pt-28 lg:pt-32`) so content clears the transparent header.

Clip-wall snippet (desktop-only, motion-safe):

```tsx
{/* Kinetic energy: faint drifting clip-wall (desktop only, static under reduced-motion) */}
<div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
  <div className="absolute -inset-[6%] grid grid-cols-7 gap-2 opacity-20 [transform:rotate(-6deg)_scale(1.15)] motion-safe:animate-[driftY_28s_linear_infinite]">
    {/* 14 placeholder tiles using dc-* gradients; replaced by real poster stills later */}
  </div>
</div>
```

> If a `driftY` keyframe does not already exist in `tailwind.config.ts`/`index.css`, add a small one (`@keyframes driftY { from { transform: translateY(0) } to { transform: translateY(-3%) } }`) gated behind `motion-safe:`. Keep it subtle and GPU-cheap (transform only). Prefer an existing float/drift utility if present.

- [ ] **Step 2: Build + typecheck**

Run: `npm run build && npm run typecheck`
Expected: both pass.

- [ ] **Step 3: Manual verify (dev server, both viewports)**

Run: `npm run dev` → open `http://127.0.0.1:8080`.
Check: header/logo over hero; clicking each pill swaps headline + CTA (Brand pill absent while `BRAND_ROLE_ENABLED=false`); `?role=creator` starts on Creator; `?role=brand` starts on Business (gated); `?role=constructor` starts on Business; "See it work ↓" scrolls down; gradient backdrop shows (no clips yet). Mobile (375px): no horizontal scroll, clip-wall hidden.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/HeroSection.tsx tailwind.config.ts src/index.css
git commit -m "feat(landing): morphing per-role cinematic hero with backdrop clip"
```

---

## Task 5: Header — transparent, no line, Lean-6 nav anchors, bigger logo

**Files:**
- Modify: `src/components/landing/Header.tsx`

- [ ] **Step 1: Implement**

1. Header wrapper: remove `border-b border-white/10 bg-dc-dark/80 backdrop-blur-xl`; make it transparent: `fixed inset-x-0 top-0 z-50` only. (Keep `fixed`.)
2. Nav legibility over motion: add `drop-shadow`/`text-shadow` utility to nav links + logo (e.g. wrap logo `className` with `drop-shadow-[0_3px_10px_rgba(0,0,0,0.35)]`; links get `[text-shadow:0_1px_6px_rgba(0,0,0,0.4)]`).
3. Bigger logo: bump `w-[104px] lg:w-[132px]` → `w-[132px] lg:w-[168px]` (dial to taste; keep `h-auto`).
4. Repoint `navLinks` to Lean-6 IDs:

```ts
const navLinks = [
  { label: "How It Works", target: "how-it-works" },
  { label: "For Business", target: "pick-your-lane" },
  { label: "For Brands", target: "pick-your-lane" },   // gated out when brand off
  { label: "For Creators", target: "pick-your-lane" },
  { label: "Contact", target: "start-free" },
];
```

(Keep the existing `BRAND_ROLE_ENABLED` filter that drops "For Brands".)

- [ ] **Step 2: Build + typecheck**

Run: `npm run build && npm run typecheck` — both pass.

- [ ] **Step 3: Manual verify**

Header transparent with no line over the hero; logo bigger + transparent; each nav link scrolls to a section that exists (no dead anchors); mobile hamburger sheet still opens and its links work.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/Header.tsx
git commit -m "feat(landing): transparent line-less header, bigger logo, Lean-6 nav anchors"
```

---

## Task 6: "See it work" — elevate the brief generator

**Files:**
- Modify: `src/components/landing/DonnySection.tsx`

- [ ] **Step 1: Implement**

- Change `id="donny"` → `id="see-it-work"`.
- Cut copy to headline + one line. Headline e.g. **"Watch Donny build your first campaign."** (script accent on "campaign."); one supporting line max. Remove the 4-item `growthPoints` list (or reduce to nothing — this section's proof is the live tool, not prose).
- Keep the `BriefGeneratorPreview` (lazy-loaded) and its `pendingBrief` flow untouched.
- Ensure any "Donny AI" → "Donny".

- [ ] **Step 2: Build** — `npm run build && npm run typecheck` pass.
- [ ] **Step 3: Manual verify** — section sits directly under the hero; brief generator still runs (paste a URL → brief → "Save this brief — sign up free").
- [ ] **Step 4: Commit**

```bash
git add src/components/landing/DonnySection.tsx
git commit -m "feat(landing): elevate brief generator as 'See it work' (lean copy)"
```

---

## Task 7: "How it works" — 3 lean steps

**Files:**
- Modify: `src/components/landing/HowItWorks.tsx`

- [ ] **Step 1: Implement** — keep `id="how-it-works"`. Cut each step's `description` to a short fragment (or remove descriptions entirely). Titles: **Paste your link · Donny builds it · Creators deliver.** Remove long paragraphs. "Donny" (not "Donny AI").
- [ ] **Step 2: Build** — `npm run build && npm run typecheck` pass.
- [ ] **Step 3: Manual verify** — three tight steps, minimal words.
- [ ] **Step 4: Commit**

```bash
git add src/components/landing/HowItWorks.tsx
git commit -m "feat(landing): tighten How It Works to three lean steps"
```

---

## Task 8: "Pick your lane" — one-line lanes

**Files:**
- Modify: `src/components/landing/AudienceLanes.tsx`

- [ ] **Step 1: Implement**

- Change `id="audiences"` → `id="pick-your-lane"`.
- **Remove** the per-card inner `id`s (`for-business`/`for-brands`/`for-creators`) and the `scroll-mt-24` that supported them — the nav now targets the section (`#pick-your-lane`), so these are dead anchors. This also guarantees no duplicate/stale IDs on the page.
- Cut each lane to **one line** (drop the 3-bullet lists; keep icon + eyebrow + title + one hook + CTA). Business → "Content in hours." · Creator → "Get paid to film." · Brand → "Scale campaigns." (Brand lane already gated by `BRAND_ROLE_ENABLED`.)
- Heading: keep short (e.g. "Pick your lane.").
- Keep signup CTAs → `/auth?mode=signup` (add `&role=` per lane for parity with the hero, optional).

- [ ] **Step 2: Build** — `npm run build && npm run typecheck` pass.
- [ ] **Step 3: Manual verify** — 2 lanes (brand off), each one line; CTAs route to signup.
- [ ] **Step 4: Commit**

```bash
git add src/components/landing/AudienceLanes.tsx
git commit -m "feat(landing): 'Pick your lane' one-line lanes + section id"
```

---

## Task 9: "Proof" — merge Stories + Rewards (honest)

**Files:**
- Create: `src/components/landing/ProofSection.tsx`
- (Retire in Task 11: `StoriesSection.tsx`, `DragonRewardsSection.tsx`.)

**Context / guardrail:** Pre-revenue — **no fabricated testimonials or metrics** (spec §4.5). The current `StoriesSection` invents named quotes (Maya R., etc.); do **not** carry those over as real. Use honest, verifiable framing + a founder-fillable testimonial slot.

- [ ] **Step 1: Implement `ProofSection`**

- `<section id="proof">`. One band containing:
  1. **Honest stat/trust chips** — verifiable facts only (e.g. "Hoboken-born", "Vetted local creators", "Content in hours, not weeks", "Powered by Donny"). No invented numbers.
  2. **Testimonial slot** — render real testimonials from a `stories` array that ships **empty** (or a single honest founder-voice line), with a code comment that the founder fills real quotes here. If empty, render the trust chips + rewards teaser only (no fake quotes).
  3. **Dragon Rewards teaser** — reuse the `useDragonRewardsEnabled()` gate + the tier ladder / earn-examples from `DragonRewardsSection` (condensed). If disabled, render nothing for that sub-block.
- Reuse `Reveal`, `dc-*` tokens, and the existing `DRAGON_TIERS`/`useDragonRewardsEnabled` imports.

- [ ] **Step 2: Build** — `npm run build && npm run typecheck` pass.
- [ ] **Step 3: Manual verify** — one Proof band; no fabricated named testimonials; rewards teaser appears only when the flag is on.
- [ ] **Step 4: Commit**

```bash
git add src/components/landing/ProofSection.tsx
git commit -m "feat(landing): merged honest Proof band (stories + rewards)"
```

---

## Task 10: "Start free" — merge BottomCTA + LeadCapture

**Files:**
- Create: `src/components/landing/StartFreeSection.tsx`
- (Retire in Task 11: `BottomCTA.tsx`, `LeadCaptureSection.tsx`.)

- [ ] **Step 1: Implement `StartFreeSection`**

- `<section id="start-free" className="scroll-mt-24 …">`.
- Top: the big role-aware CTA block from `BottomCTA` (headline + the `signupAs()` buttons; keep the `BRAND_ROLE_ENABLED` gating). "Donny" not "Donny AI".
- Below: the lead-capture form (move the whole form + `useSubmitLead` logic from `LeadCaptureSection` verbatim — honeypot, validation, submit, success state all preserved). This is where the header "Contact" link (`#start-free`) lands.
- Keep the `useSubmitLead` import and behavior byte-for-byte (do not touch `capture-lead`).

- [ ] **Step 2: Build** — `npm run build && npm run typecheck` pass.
- [ ] **Step 3: Manual verify** — CTA buttons route to signup; lead form validates (bad email blocked) and submits to a success state; honeypot field still hidden.
- [ ] **Step 4: Commit**

```bash
git add src/components/landing/StartFreeSection.tsx
git commit -m "feat(landing): merged 'Start free' CTA + lead capture"
```

---

## Task 11: Assemble Lean-6, retire cut sections, "Donny" sweep

**Files:**
- Modify: `src/pages/LandingPage.tsx`
- Delete: `WhyDragonCandy.tsx`, `CreatorHubSection.tsx`, `StoriesSection.tsx`, `DragonRewardsSection.tsx`, `BottomCTA.tsx`, `LeadCaptureSection.tsx`

- [ ] **Step 1: Rewrite `LandingPage.tsx` `<main>`**

```tsx
<main>
  <HeroSection />
  <DonnySection />        {/* See it work */}
  <HowItWorks />
  <AudienceLanes />       {/* Pick your lane */}
  <ProofSection />
  <StartFreeSection />
</main>
```

Update imports: drop `WhyDragonCandy`, `StoriesSection`, `DragonRewardsSection`, `CreatorHubSection`, `LeadCaptureSection`, `BottomCTA`; add `ProofSection`, `StartFreeSection`. Keep the scoped `.dark` wrapper, `SEO`, `Header`, footer. Update the `SEO` description to drop "Donny AI" if present.

- [ ] **Step 2: Delete retired components**

```bash
git rm src/components/landing/WhyDragonCandy.tsx src/components/landing/CreatorHubSection.tsx \
       src/components/landing/StoriesSection.tsx src/components/landing/DragonRewardsSection.tsx \
       src/components/landing/BottomCTA.tsx src/components/landing/LeadCaptureSection.tsx
```

- [ ] **Step 3: "Donny AI" → "Donny" sweep (landing only)**

Run: `npx rg -n "Donny AI" src/components/landing src/pages/LandingPage.tsx`
Replace every hit with "Donny". Re-run to confirm zero hits.

- [ ] **Step 4: Build, typecheck, full test run**

Run: `npm run build && npm run typecheck && npx vitest run src/components/landing`
Expected: build + typecheck pass; landing tests green (Tasks 1–3). Confirm no import of a deleted file remains (build fails loudly if so).

- [ ] **Step 5: Both-viewport manual verify**

`npm run dev` → verify the full 6-section page top-to-bottom on desktop (`lg`) and mobile (375px): all nav anchors resolve, hero morphs, brief generator works, lead form submits, no console errors, no horizontal scroll on mobile.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(landing): assemble Lean-6 page, retire cut sections, Donny naming"
```

---

## Task 12: Final verification & branch finish

- [ ] **Step 1:** `npm run build` clean; `npm run lint` (no new errors); `npx vitest run src/components/landing` green.
- [ ] **Step 2: Codex second review** — `codex review --base main --title "Landing cinematic video redesign"`; fix any real findings, re-run until clean (use the `codex-review` skill). Also run the `edge-function-reviewer`? — N/A (no edge-fn changes).
- [ ] **Step 3:** Invoke `superpowers:finishing-a-development-branch` → open PR. Include the spec + plan in the PR.
- [ ] **Step 4: knowledge-sync** — write a `docs/wiki/raw/sessions/` source, `/wiki-ops ingest`, refresh core docs (PROJECT_CONTEXT landing workstream; DESIGN_SYSTEM if a rule changed), per the `knowledge-sync` skill.
- [ ] **Step 5: Post-merge** — `verify-prod` (both viewports, console errors) on dragoncandy.io.

**Founder follow-ups (outside code, documented in the PR):**
1. Create a Cloudflare Stream account; generate clips via the pipeline (Nano Banana Pro stills → Veo 3.1 / Kling / Runway image-to-video → 4–8s silent loops + posters).
2. Drop playback URLs + posters into `LANDING_CLIPS` in `landingClips.ts` (no other code change → clips go live).
3. Confirm `LEADS_NOTIFY_EMAIL` edge secret is set.
4. Optionally fill real testimonials in `ProofSection`.

---

## Notes / Open Items (from spec §8)
- Header scroll behaviour (stay transparent vs. fade-in blur past hero) — default transparent; easy follow-up toggle.
- Final logo size — dial during Task 5.
- DragonFeed clip source (v2) — future slice behind `resolveLandingClip`; not built here.
- Cloudflare Stream vs Bunny — either sits behind the seam; founder's final pick.
