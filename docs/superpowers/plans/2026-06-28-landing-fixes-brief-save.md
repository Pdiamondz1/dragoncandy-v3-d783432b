# Landing Fixes (brief-save + Business buttons + nav) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing page honest and navigable — a guest's saved brief is carried into a real campaign after signup, add "Join as a Business" CTAs, and repoint the dead nav anchors.

**Architecture:** Pure frontend. A small tested `pendingBrief` util read at onboarding completion reuses the campaign builder's existing `?brief=` pre-fill; the hero/bottom CTAs gain a Business button that passes a `?role=` hint the auth page pre-selects; the header nav targets are repointed to real section IDs.

**Tech Stack:** React 18 + TypeScript (strict), Vite, React Router, Vitest, Tailwind (`dc-*` tokens).

**Spec:** `docs/superpowers/specs/2026-06-28-landing-fixes-brief-save-design.md`

---

## File Structure

**Create:** `src/lib/pendingBrief.ts` (+ `src/lib/pendingBrief.test.ts`)
**Modify:** `src/components/onboarding/OnboardingWizard.tsx`, `src/pages/AuthPage.tsx`,
`src/components/landing/HeroSection.tsx`, `src/components/landing/BottomCTA.tsx`,
`src/components/landing/Header.tsx`
**Reuse unchanged:** `useCampaignCreator.ts` (`?brief=` pre-fill), `BriefGeneratorPreview.tsx` (`setItem('pendingBrief', …)`).

Run all commands from the worktree `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\DC-rename` (branch `feat/landing-fixes-brief-save`). Use @superpowers:test-driven-development for Task 1.

---

## Task 1: `pendingBrief` util (TDD)

**Files:**
- Create: `src/lib/pendingBrief.ts`
- Test: `src/lib/pendingBrief.test.ts`

- [ ] **Step 1: Write the failing test** at `src/lib/pendingBrief.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { briefToText, consumePendingBrief } from './pendingBrief';

const brief = {
  campaign_name: 'Shack Life',
  campaign_description: 'Behind the burger content.',
  target_audience: 'Local foodies',
  content_suggestions: ['BTS reel', 'Menu highlight', 'Staff pick'],
};

describe('briefToText', () => {
  it('summarizes all fields', () => {
    const t = briefToText(brief);
    expect(t).toContain('Shack Life');
    expect(t).toContain('Behind the burger');
    expect(t).toContain('Target audience: Local foodies');
    expect(t).toContain('Content ideas: BTS reel; Menu highlight; Staff pick');
  });
  it('tolerates missing fields', () => {
    expect(briefToText({ campaign_name: 'X' })).toBe('X');
    expect(briefToText({})).toBe('');
  });
});

describe('consumePendingBrief', () => {
  beforeEach(() => localStorage.clear());

  it('returns the business create route + clears storage', () => {
    localStorage.setItem('pendingBrief', JSON.stringify(brief));
    const r = consumePendingBrief('business_client');
    expect(r?.redirectTo).toMatch(/^\/dashboard\/business\/campaigns\/create\?brief=/);
    expect(decodeURIComponent(r!.redirectTo.split('brief=')[1])).toContain('Shack Life');
    expect(localStorage.getItem('pendingBrief')).toBeNull();
  });
  it('routes brand to the brand create route', () => {
    localStorage.setItem('pendingBrief', JSON.stringify(brief));
    expect(consumePendingBrief('brand')?.redirectTo).toMatch(/^\/dashboard\/brand\/campaigns\/create\?brief=/);
  });
  it('returns null for creator but still clears', () => {
    localStorage.setItem('pendingBrief', JSON.stringify(brief));
    expect(consumePendingBrief('content_creator')).toBeNull();
    expect(localStorage.getItem('pendingBrief')).toBeNull();
  });
  it('returns null when nothing stored', () => {
    expect(consumePendingBrief('business_client')).toBeNull();
  });
  it('returns null + clears on malformed JSON', () => {
    localStorage.setItem('pendingBrief', '{not json');
    expect(consumePendingBrief('business_client')).toBeNull();
    expect(localStorage.getItem('pendingBrief')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (expect FAIL — import not found)**

Run: `npx vitest run src/lib/pendingBrief.test.ts`

- [ ] **Step 3: Implement** `src/lib/pendingBrief.ts`

```ts
// Honors the landing "Save this brief — sign up free" promise. A guest's brief is
// stashed in localStorage['pendingBrief'] by BriefGeneratorPreview, then read here at
// new-user onboarding completion to drop the user into the campaign builder pre-filled
// (via its existing ?brief= mechanism). Always clears the key once seen.

const KEY = 'pendingBrief';

export type ConsumableRole = 'business_client' | 'content_creator' | 'brand';

interface StoredBrief {
  campaign_name?: string;
  campaign_description?: string;
  target_audience?: string;
  content_suggestions?: string[];
}

/** Concise prompt summary fed to the campaign builder's ?brief= pre-fill. */
export function briefToText(brief: StoredBrief): string {
  const parts: string[] = [];
  if (brief.campaign_name) parts.push(brief.campaign_name);
  if (brief.campaign_description) parts.push(brief.campaign_description);
  if (brief.target_audience) parts.push(`Target audience: ${brief.target_audience}`);
  const ideas = (brief.content_suggestions ?? []).filter(Boolean);
  if (ideas.length) parts.push(`Content ideas: ${ideas.join('; ')}`);
  return parts.join('. ');
}

// Only campaign-creating roles have a builder to drop into. content_creator has none.
const CREATE_ROUTE: Partial<Record<ConsumableRole, string>> = {
  business_client: '/dashboard/business/campaigns/create',
  brand: '/dashboard/brand/campaigns/create',
};

/**
 * Read + ALWAYS clear pendingBrief. Returns a campaign-builder redirect (brief
 * pre-filled via ?brief=) for a campaign-creating role; null otherwise
 * (creator, malformed JSON, empty, or absent). Never throws.
 */
export function consumePendingBrief(role: ConsumableRole): { redirectTo: string } | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null; // localStorage unavailable (private mode, etc.)
  }
  if (!raw) return null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }

  const base = CREATE_ROUTE[role];
  if (!base) return null; // creator: no builder

  let brief: StoredBrief;
  try { brief = JSON.parse(raw); } catch { return null; } // malformed — already cleared
  const text = briefToText(brief);
  if (!text) return null;
  return { redirectTo: `${base}?brief=${encodeURIComponent(text)}` };
}
```

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx vitest run src/lib/pendingBrief.test.ts` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pendingBrief.ts src/lib/pendingBrief.test.ts
git commit -m "feat(landing): pendingBrief util — read + carry a guest brief after signup (tested)"
```

---

## Task 2: Consume the brief at onboarding completion

**Files:**
- Modify: `src/components/onboarding/OnboardingWizard.tsx`

`OnboardingWizard.tsx:196` currently ends `handleSubmit` with `navigate(DASHBOARD_ROUTES[role]);`. `role` is the new user's `UserRole` (`business_client`/`content_creator`/`brand`).

- [ ] **Step 1: Add the import** (alongside the other imports near the top)

```tsx
import { consumePendingBrief } from '@/lib/pendingBrief';
```

- [ ] **Step 2: Replace the navigate** — change:

```tsx
      toast.success('Profile created!');
      navigate(DASHBOARD_ROUTES[role]);
```
to:
```tsx
      toast.success('Profile created!');
      // Honor a guest's saved brief (landing "Save this brief — sign up free"):
      // business/brand → straight into the campaign builder pre-filled; else dashboard.
      const pending = consumePendingBrief(role);
      navigate(pending?.redirectTo ?? DASHBOARD_ROUTES[role]);
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add src/components/onboarding/OnboardingWizard.tsx
git commit -m "feat(landing): drop new business/brand users into the campaign builder with their saved brief"
```

---

## Task 3: `?role=` pre-select on the auth page

**Files:**
- Modify: `src/pages/AuthPage.tsx`

Goal: `/auth?mode=signup&role=business|creator|brand` pre-selects the role and skips the role-picker. No `?role=` → today's behavior unchanged.

- [ ] **Step 1: Derive initial role from the URL** — replace the state block (currently lines ~23-27):

```tsx
  const initialMode = searchParams.get('mode') === 'login' ? 'login' : 'signup';
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [signupStep, setSignupStep] = useState<SignupStep>("role-selection");
  const [selectedRole, setSelectedRole] = useState<"business_client" | "content_creator" | "brand" | null>(null);
```
with:
```tsx
  const initialMode = searchParams.get('mode') === 'login' ? 'login' : 'signup';
  // Pre-select role from the landing "Join as a Business/Creator" CTAs (?role=).
  // Map the URL value to the profile enum; ignore on login or unknown values.
  const initialRole = ((): "business_client" | "content_creator" | "brand" | null => {
    if (initialMode === 'login') return null;
    const map = { business: 'business_client', creator: 'content_creator', brand: 'brand' } as const;
    const r = searchParams.get('role');
    return r && r in map ? map[r as keyof typeof map] : null;
  })();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [signupStep, setSignupStep] = useState<SignupStep>(initialRole ? "signup-form" : "role-selection");
  const [selectedRole, setSelectedRole] = useState<"business_client" | "content_creator" | "brand" | null>(initialRole);
```

(No other change — `handleSelectRole`/`handleChangeRole`/`handleModeChange` already manage these two states from here on, so the role-picker, back-to-roles, and mode-switch flows all keep working.)

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add src/pages/AuthPage.tsx
git commit -m "feat(auth): pre-select role from ?role= (additive; no-param behavior unchanged)"
```

---

## Task 4: "Join as a Business" buttons (hero + bottom CTA)

**Files:**
- Modify: `src/components/landing/HeroSection.tsx`, `src/components/landing/BottomCTA.tsx`

Add "Join as a Business" (pink-accent fill, matching the existing brand-secondary) **above** "Join as a Creator", and route the role buttons with the `?role=` hint.

- [ ] **Step 1: HeroSection** — replace the signup helper + button row.

Change `const signup = () => navigate("/auth?mode=signup");` to:
```tsx
  const signupAs = (role?: string) =>
    navigate(`/auth?mode=signup${role ? `&role=${role}` : ''}`);
```
Replace the button `<div className="mt-10 flex flex-col gap-3 ...">…</div>` block with:
```tsx
        <div className="mt-10 flex flex-col gap-3 animate-fade-in-up-delay-2 sm:flex-row sm:flex-wrap">
          <button
            onClick={() => signupAs()}
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-dc-teal px-8 text-base font-bold text-dc-dark transition-all duration-300 hover:bg-dc-teal-dark hover:shadow-glow-teal"
          >
            Get Started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            onClick={() => signupAs('business')}
            className="inline-flex h-14 items-center justify-center rounded-full bg-dc-pink-accent-btn px-8 text-base font-semibold text-white transition-all duration-300 hover:bg-dc-pink-accent-btn-hover"
          >
            Join as a Business
          </button>
          <button
            onClick={() => signupAs('creator')}
            className="inline-flex h-14 items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 text-base font-semibold text-white backdrop-blur transition-all duration-300 hover:border-dc-teal hover:text-dc-teal"
          >
            Join as a Creator
          </button>
          {BRAND_ROLE_ENABLED && (
            <button
              onClick={() => signupAs('brand')}
              className="inline-flex h-14 items-center justify-center rounded-full border border-dc-pink-accent/40 bg-transparent px-8 text-base font-semibold text-white transition-all duration-300 hover:border-dc-pink-accent hover:text-dc-pink-accent"
            >
              For Brands
            </button>
          )}
        </div>
```
(Note: when `BRAND_ROLE_ENABLED` is on, the "For Brands" button is restyled to an outline so it doesn't clash with the now-pink "Join as a Business". Brand role is currently hidden, so this is dormant.)

- [ ] **Step 2: BottomCTA** — same treatment. Change `const signup = () => navigate("/auth?mode=signup");` to the `signupAs` helper above, then in the existing button row: point Get Started → `signupAs()`, insert a pink "Join as a Business" → `signupAs('business')` **above** "Join as a Creator" → `signupAs('creator')`, and gate For Brands → `signupAs('brand')` (outline). **Keep BottomCTA's existing wrapper `<div>` as-is** (it has `justify-center` and no `animate-*` classes — do NOT copy the hero's wrapper) and keep the existing per-button classes (they already match the hero's). Only swap the `onClick` handlers and add the two buttons.

- [ ] **Step 3: Build + commit**

Run: `npm run build` → PASS.
```bash
git add src/components/landing/HeroSection.tsx src/components/landing/BottomCTA.tsx
git commit -m "feat(landing): add 'Join as a Business' CTA (hero + bottom) with ?role= routing"
```

---

## Task 5: Repoint the dead nav anchors

**Files:**
- Modify: `src/components/landing/Header.tsx`

The `navLinks` targets `for-business`/`for-brands`/`for-creators` don't exist as section IDs. Real IDs: `audiences` (AudienceLanes), `creator-hub` (CreatorHubSection), `how-it-works`, `contact`.

- [ ] **Step 1: Verify the targets** — confirm `AudienceLanes` renders `id="audiences"` with business-facing content and `CreatorHubSection` renders `id="creator-hub"` (grep: `grep -n 'id="audiences"\|id="creator-hub"' src/components/landing/*.tsx`).

- [ ] **Step 2: Repoint** — replace the `navLinks` array:

```tsx
const navLinks = [
  { label: "How It Works", target: "how-it-works" },
  { label: "For Business", target: "audiences" },
  { label: "For Brands", target: "audiences" },
  { label: "For Creators", target: "creator-hub" },
  { label: "Contact", target: "contact" },
];
```

- [ ] **Step 3: Fix the `visibleNavLinks` filter (REQUIRED — it currently matches on the old target)**

The existing filter hides "For Brands" by `target === "for-brands"`, which no longer exists after the repoint — so without this change "For Brands" would render for everyone. Change the filter to match by **label**:

```tsx
const visibleNavLinks = BRAND_ROLE_ENABLED
  ? navLinks
  : navLinks.filter((l) => l.label !== "For Brands");
```
(Keeps "For Brands" hidden while the brand role is off, repointed to a real section if it's ever enabled — no dead anchor either way.)

- [ ] **Step 4: Key the nav maps by label (REQUIRED — "For Business" and "For Brands" now share `target: "audiences"`)**

In BOTH the desktop map (`Header.tsx` ~line 54) and the mobile map (~line 93), change `key={link.target}` → `key={link.label}` to avoid a duplicate-key React warning.

- [ ] **Step 5: Build + commit**

Run: `npm run build` → PASS. (Sanity-check the rendered nav: with `BRAND_ROLE_ENABLED` off, "For Brands" must NOT appear; no duplicate-key console warning.)
```bash
git add src/components/landing/Header.tsx
git commit -m "fix(landing): repoint dead header nav anchors + fix For-Brands gating/keys"
```

---

## Task 6: Full verification, review, ship

- [ ] **Step 1: Full local gate**

Run: `npm run build && npm run typecheck && npx vitest run src/lib/pendingBrief.test.ts`
Expected: build PASS, typecheck clean, pendingBrief tests PASS.

- [ ] **Step 2: Claude self-review** — `/simplify` then `/code-review` on the diff; address findings.

- [ ] **Step 3: Codex second review** (REQUIRED — use @codex-review)

Run from the worktree: `codex review --base main --title "Landing fixes: brief-save + Business CTAs + nav"`. Fix real findings; re-run until clean. Relay the verdict.

- [ ] **Step 4: PR** — push `feat/landing-fixes-brief-save` and open a PR (no schema/edge/secret change, so no founder go-live steps; Lovable deploys the frontend on merge).

- [ ] **Step 5: Prod verify** (use @verify-prod, after the deploy lands — note the deploy backlog can lag): (a) guest → generate brief → "Save & sign up" → after onboarding the **business** campaign builder opens pre-filled / a **creator** lands on the dashboard with the brief cleared; (b) "Join as a Business" opens the business signup form, "Join as a Creator" the creator form; (c) every header nav link scrolls to a real section, desktop + mobile.

---

## Notes for the executor

- `role` in `OnboardingWizard` is the profile enum (`UserRole`) and matches `ConsumableRole` exactly — pass it straight to `consumePendingBrief`.
- The `?role=` URL values (`business`/`creator`/`brand`) are a *different* vocabulary than the profile enum — the `initialRole` map handles the conversion. Don't confuse them.
- Don't touch the campaign builder's `?brief=` handler (`useCampaignCreator.ts`) — it already works; we only feed it.
- `pendingBrief` is **always cleared** once read, including the creator and malformed-JSON paths — verified by the unit tests.
- This is the "fixes" slice only; the "less generic" redesign is a separate effort.
