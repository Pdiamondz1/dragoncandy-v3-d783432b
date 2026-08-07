# Restaurant Onboarding — Phase 1 (Cuisine Step) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the restaurant onboarding "industry" step (title "What kind of food?" over a generic industry grid) with a multi-select **cuisine** picker, persisted to `business_profiles.cuisines`, and surfaced in Settings and the public profile.

**Architecture:** A shared cuisine constant (`src/lib/cuisines.ts`) drives both the onboarding `TapGrid` (multi-select) and a Settings chip group. A new nullable-with-default `text[]` column stores selections. Restaurants keep `industry='food'` for compatibility; the **brand** role is untouched (keeps its industry picker). No edge-function, org, or location work.

**Tech Stack:** React/TypeScript, Supabase (Postgres), Vite, Vitest + React Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-07-restaurant-onboarding-cuisine-design.md`

## Global Constraints

- **Deploy ordering:** apply the `cuisines` column migration to PROD **before** merging any frontend that reads/writes it (new-column rule). Gate the prod apply with the `careful` skill.
- **Brand path unchanged:** the `brand` role keeps the `industry` picker in onboarding and settings. Only `business_client` (restaurant, `account_type='restaurant'`, `isBrand===false`) sees cuisines.
- **`industry` retained:** restaurants get `industry='food'` set automatically; nothing that reads `industry` may break.
- **Cuisine storage:** `text[]` of slugs from `src/lib/cuisines.ts` (app-owned list, not a DB enum).
- **Vitest:** `npm run test` runs `vitest run`. Global env is `node`; any RTL test file MUST start with `// @vitest-environment jsdom` then `import '@testing-library/jest-dom';` as the first two lines. Trust the "N passed, N failed" summary, not the process exit code.
- **Typecheck:** `npm run typecheck` = `tsc --noEmit -p tsconfig.app.json`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/cuisines.ts` | Single source of truth for cuisine slugs/labels/icons + helpers | Create |
| `src/lib/cuisines.test.ts` | Unit tests for the constant + helpers | Create |
| `supabase/migrations/20260807163000_business_profiles_cuisines.sql` | Add `cuisines text[]` column | Create |
| `src/integrations/supabase/types.ts` | Add `cuisines` to `business_profiles` Row/Insert/Update | Modify |
| `src/components/onboarding/OnboardingWizard.tsx` | Restaurant path: cuisine step instead of industry; persist cuisines + `industry='food'` | Modify |
| `src/components/onboarding/OnboardingWizard.test.tsx` | RTL test: cuisine step renders + gates Continue | Create |
| `src/hooks/useBusinessProfileForm.ts` | Add `cuisines` to form data + a dedicated setter | Modify |
| `src/hooks/useBusinessProfileSubmit.ts` | Persist `cuisines` for non-brand accounts | Modify |
| `src/pages/BusinessSettings.tsx` | Load `cuisines`; pass `isBrand` + cuisines setter to the section | Modify |
| `src/components/settings/BusinessSettingsSections.tsx` | Restaurant: cuisines chip group; brand: industry Select | Modify |
| `src/pages/PublicBusinessProfile.tsx` | Show cuisine chips for restaurants; fall back to industry label | Modify |

---

## Task 1: Shared cuisine constant + unit tests

**Files:**
- Create: `src/lib/cuisines.ts`
- Test: `src/lib/cuisines.test.ts`

**Interfaces:**
- Produces: `CUISINE_ITEMS: CuisineItem[]` where `CuisineItem = { value: string; label: string; icon: string }`; `CUISINE_VALUES: Set<string>`; `cuisineLabel(value: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cuisines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CUISINE_ITEMS, CUISINE_VALUES, cuisineLabel } from './cuisines';

describe('cuisines', () => {
  it('exposes a non-empty list with unique slugs', () => {
    expect(CUISINE_ITEMS.length).toBeGreaterThan(0);
    const values = CUISINE_ITEMS.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('CUISINE_VALUES contains every item value', () => {
    for (const item of CUISINE_ITEMS) {
      expect(CUISINE_VALUES.has(item.value)).toBe(true);
    }
  });

  it('cuisineLabel returns the label for a known slug', () => {
    expect(cuisineLabel('italian')).toBe('Italian');
  });

  it('cuisineLabel falls back to the raw value for an unknown slug', () => {
    expect(cuisineLabel('klingon')).toBe('klingon');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/cuisines.test.ts`
Expected: FAIL — cannot resolve `./cuisines`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/cuisines.ts`:

```ts
export interface CuisineItem {
  value: string;
  label: string;
  icon: string;
}

export const CUISINE_ITEMS: CuisineItem[] = [
  { value: 'american', label: 'American', icon: '🍔' },
  { value: 'italian', label: 'Italian', icon: '🍝' },
  { value: 'mexican', label: 'Mexican', icon: '🌮' },
  { value: 'chinese', label: 'Chinese', icon: '🥡' },
  { value: 'japanese', label: 'Japanese / Sushi', icon: '🍣' },
  { value: 'thai', label: 'Thai', icon: '🍜' },
  { value: 'indian', label: 'Indian', icon: '🍛' },
  { value: 'mediterranean', label: 'Mediterranean', icon: '🫒' },
  { value: 'middle_eastern', label: 'Middle Eastern', icon: '🧆' },
  { value: 'korean', label: 'Korean', icon: '🍲' },
  { value: 'vietnamese', label: 'Vietnamese', icon: '🥢' },
  { value: 'bbq', label: 'BBQ', icon: '🍖' },
  { value: 'pizza', label: 'Pizza', icon: '🍕' },
  { value: 'seafood', label: 'Seafood', icon: '🦐' },
  { value: 'vegetarian', label: 'Vegan / Vegetarian', icon: '🥗' },
  { value: 'cafe', label: 'Cafe / Coffee', icon: '☕' },
  { value: 'bakery', label: 'Bakery / Dessert', icon: '🧁' },
  { value: 'bar', label: 'Bar / Pub', icon: '🍺' },
  { value: 'brunch', label: 'Breakfast / Brunch', icon: '🥞' },
  { value: 'fast_food', label: 'Fast Food', icon: '🍟' },
  { value: 'food_truck', label: 'Food Truck', icon: '🚚' },
  { value: 'other', label: 'Other', icon: '✨' },
];

export const CUISINE_VALUES: Set<string> = new Set(CUISINE_ITEMS.map((c) => c.value));

export function cuisineLabel(value: string): string {
  return CUISINE_ITEMS.find((c) => c.value === value)?.label ?? value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/cuisines.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cuisines.ts src/lib/cuisines.test.ts
git commit -m "feat: add shared cuisine constant and helpers"
```

---

## Task 2: Migration + generated types for `cuisines`

**Files:**
- Create: `supabase/migrations/20260807163000_business_profiles_cuisines.sql`
- Modify: `src/integrations/supabase/types.ts` (`business_profiles` Row/Insert/Update)

**Interfaces:**
- Produces: `business_profiles.cuisines` column and its TypeScript types (`Row.cuisines: string[]`, `Insert.cuisines?: string[] | null`, `Update.cuisines?: string[] | null`), consumed by Tasks 3–6.

> If `20260807163000_*` collides with another worktree's migration, bump the timestamp (e.g. `20260807163500`) — same-day worktrees have collided before.

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260807163000_business_profiles_cuisines.sql`:

```sql
-- Phase 1 restaurant onboarding: store selected cuisines on the business profile.
-- Replaces the meaningless "industry" signal for restaurants (industry stays 'food').
alter table public.business_profiles
  add column if not exists cuisines text[] not null default '{}';

comment on column public.business_profiles.cuisines is
  'Restaurant cuisine slugs (app-owned list in src/lib/cuisines.ts). Empty for brand accounts.';
```

- [ ] **Step 2: Add the column to `types.ts`**

In `src/integrations/supabase/types.ts`, locate the `business_profiles: {` block. In its **`Row`** object add (alphabetical, next to `country`):

```ts
        cuisines: string[]
```

In its **`Insert`** object add:

```ts
        cuisines?: string[] | null
```

In its **`Update`** object add:

```ts
        cuisines?: string[] | null
```

- [ ] **Step 3: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: PASS (no errors). The new field is additive.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260807163000_business_profiles_cuisines.sql src/integrations/supabase/types.ts
git commit -m "feat: add business_profiles.cuisines column and types"
```

> **Do NOT apply to prod yet.** Prod apply happens in Task 7 (deploy), gated by the `careful` skill, before the frontend merges.

---

## Task 3: Onboarding cuisine step (restaurant)

**Files:**
- Modify: `src/components/onboarding/OnboardingWizard.tsx`
- Test: `src/components/onboarding/OnboardingWizard.test.tsx`

**Interfaces:**
- Consumes: `CUISINE_ITEMS` from `@/lib/cuisines` (Task 1); `business_profiles.cuisines` type (Task 2).
- Produces: restaurant onboarding writes `cuisines: string[]` and `industry:'food'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/onboarding/OnboardingWizard.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'r@example.com', email_confirmed_at: null, user_metadata: { role: 'business_client' } },
    refreshProfile: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAutoDetect', () => ({
  useAutoDetect: () => ({ loading: false, city: '', country: '', timezone: '' }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }) },
}));
vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { OnboardingWizard } from './OnboardingWizard';

describe('OnboardingWizard — restaurant cuisine step', () => {
  it('asks for cuisine (not industry) and gates Continue until one is picked', async () => {
    render(<OnboardingWizard />);

    // Identity step first — restaurant name prompt.
    expect(screen.getByRole('heading', { name: /What's your restaurant called\?/i })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Taco Bell/i), { target: { value: "Tony's Pizza" } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    // Cuisine step.
    expect(await screen.findByRole('heading', { name: /What kind of food do you serve\?/i })).toBeInTheDocument();
    expect(screen.getByText(/Pick all that apply/i)).toBeInTheDocument();

    // Continue disabled with nothing selected.
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled();

    // Pick a cuisine → Continue enables.
    fireEvent.click(screen.getByRole('button', { name: /Italian/i }));
    expect(screen.getByRole('button', { name: /Continue/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/onboarding/OnboardingWizard.test.tsx`
Expected: FAIL — the cuisine heading isn't found (step still renders industry).

- [ ] **Step 3: Edit `OnboardingWizard.tsx`**

**3a.** Add the import (after the existing `TapGrid` import):

```tsx
import { CUISINE_ITEMS } from '@/lib/cuisines';
```

**3b.** Extend the step id and restaurant steps:

```tsx
type StepId = 'identity' | 'industry' | 'cuisine' | 'skills' | 'bio' | 'welcome';

const ROLE_STEPS: Record<UserRole, StepId[]> = {
  business_client: ['identity', 'cuisine', 'welcome'],
  content_creator: ['identity', 'skills', 'bio', 'welcome'],
  brand: ['identity', 'industry', 'welcome'],
};
```

**3c.** Replace the industry default state and add cuisines state. Change:

```tsx
  const [industry, setIndustry] = useState<string>(role === 'business_client' ? 'food' : '');
```

to:

```tsx
  const [industry, setIndustry] = useState<string>('');
  const [cuisines, setCuisines] = useState<string[]>([]);
```

**3d.** Add cuisine validation. In `isStepValid`, add a case and dependency:

```tsx
      case 'industry': return industry !== '';
      case 'cuisine': return cuisines.length > 0;
```

and change the dependency array from `[currentStep, name, industry, skills, bio]` to `[currentStep, name, industry, cuisines, skills, bio]`.

**3e.** Add a `toggleCuisine` helper (next to `toggleSkill`):

```tsx
  const toggleCuisine = (value: string) => {
    setCuisines(prev =>
      prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]
    );
  };
```

**3f.** Titles/subtitles. In `stepTitle`, replace the `industry` case with both:

```tsx
      case 'industry':
        return "What's your industry?";
      case 'cuisine':
        return "What kind of food do you serve?";
```

In `stepSubtitle`, add:

```tsx
      case 'industry': return 'Tap to select';
      case 'cuisine': return 'Pick all that apply';
```

**3g.** Render the cuisine step. In `renderStep`, add a case after the `industry` case:

```tsx
      case 'cuisine':
        return (
          <TapGrid
            items={CUISINE_ITEMS}
            selected={cuisines}
            onToggle={toggleCuisine}
            mode="multi"
            accentColor={accentColor}
          />
        );
```

**3h.** Footer helper text. In the `<p>` that lists per-step hints, add a `cuisine` line next to the `industry` one:

```tsx
              {currentStep === 'industry' && 'This helps us match you with the right people'}
              {currentStep === 'cuisine' && 'This helps us match you with the right creators'}
```

**3i.** Persist on submit. In `handleSubmit`, the business branch currently does:

```tsx
        const { error } = await supabase.from('business_profiles').upsert({
          user_id: user.id,
          business_name: name.trim(),
          account_type: role === 'brand' ? 'brand' : 'restaurant',
          industry: industry as IndustryType,
          logo_url: avatarUrl,
          ...locationData,
          is_completed: true,
        }, { onConflict: 'user_id' });
```

Change the `industry` line and add `cuisines`:

```tsx
        const { error } = await supabase.from('business_profiles').upsert({
          user_id: user.id,
          business_name: name.trim(),
          account_type: role === 'brand' ? 'brand' : 'restaurant',
          industry: (role === 'brand' ? industry : 'food') as IndustryType,
          cuisines: role === 'business_client' ? cuisines : [],
          logo_url: avatarUrl,
          ...locationData,
          is_completed: true,
        }, { onConflict: 'user_id' });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/onboarding/OnboardingWizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/OnboardingWizard.tsx src/components/onboarding/OnboardingWizard.test.tsx
git commit -m "feat: restaurant onboarding asks cuisine instead of industry"
```

---

## Task 4: Settings — edit cuisines

**Files:**
- Modify: `src/hooks/useBusinessProfileForm.ts`
- Modify: `src/hooks/useBusinessProfileSubmit.ts`
- Modify: `src/pages/BusinessSettings.tsx`
- Modify: `src/components/settings/BusinessSettingsSections.tsx`

**Interfaces:**
- Consumes: `CUISINE_ITEMS` (Task 1); `business_profiles.cuisines` type (Task 2).
- Produces: `BusinessProfileFormData.cuisines: string[]`; `useBusinessProfileForm().handleCuisinesChange(cuisines: string[])`; `BusinessSettingsSections` props `isBrand: boolean` and `onCuisinesChange: (cuisines: string[]) => void`.

- [ ] **Step 1: Add `cuisines` to the form hook**

In `src/hooks/useBusinessProfileForm.ts`:

Add to the `BusinessProfileFormData` interface (after `industry`):

```ts
  cuisines: string[];
```

Add to the initial `useState` object (after `industry: ''`):

```ts
    cuisines: [],
```

Add to `setFormDataFromProfile`'s object (after `industry: ...`):

```ts
      cuisines: businessProfile.cuisines || [],
```

Add a dedicated setter before the `return`:

```ts
  const handleCuisinesChange = useCallback((cuisines: string[]) => {
    setFormData(prev => ({ ...prev, cuisines }));
  }, []);
```

And add `handleCuisinesChange` to the returned object.

- [ ] **Step 2: Persist cuisines on save (non-brand only)**

In `src/hooks/useBusinessProfileSubmit.ts`, after the `profileData` object is built and before the brand block, add:

```ts
      // Restaurants store cuisines; brands keep the industry picker instead.
      if (!isBrand) {
        profileData.cuisines = formData.cuisines;
      }
```

- [ ] **Step 3: Wire the settings page**

In `src/pages/BusinessSettings.tsx`:

**3a.** Add `cuisines` to the profile `.select(...)` string in `loadProfile` (append `, cuisines`):

```ts
          .select('business_name, industry, website_url, location, postal_code, city, country, description, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url, logo_url, company_size, founded_year, employee_count_range, budget_range, preferred_collaboration_style, timezone, profile_visibility, cuisines')
```

**3b.** Destructure the new setter from the hook (add to the existing `useBusinessProfileForm()` destructure):

```ts
    handleCuisinesChange: handleBusinessCuisinesChange,
```

**3c.** Pass `isBrand` and `onCuisinesChange` to BOTH `<BusinessSettingsSections .../>` usages (the location-mode one and the main one):

```tsx
                isBrand={isBrand}
                onCuisinesChange={handleBusinessCuisinesChange}
```

- [ ] **Step 4: Render cuisines vs industry in the section**

In `src/components/settings/BusinessSettingsSections.tsx`:

**4a.** Add imports:

```tsx
import { CUISINE_ITEMS } from '@/lib/cuisines';
```

**4b.** Add the two props to `BusinessSettingsSectionsProps`:

```ts
  isBrand?: boolean;
  onCuisinesChange?: (cuisines: string[]) => void;
```

and to the component's destructured params:

```tsx
  isBrand,
  onCuisinesChange,
```

**4c.** Add a local field renderer inside the component (before `return`), so the choice is DRY across both branches:

```tsx
  const renderCategoryField = () => {
    if (isBrand) {
      return (
        <div>
          <Label htmlFor="industry">Industry</Label>
          <Select
            value={formData.industry}
            onValueChange={(value) => {
              onInputChange('industry', value);
              onFieldBlur();
            }}
          >
            <SelectTrigger id="industry" className="mt-1">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <div>
        <Label>Cuisine</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {CUISINE_ITEMS.map((c) => {
            const active = formData.cuisines?.includes(c.value) ?? false;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  const next = active
                    ? (formData.cuisines ?? []).filter((v) => v !== c.value)
                    : [...(formData.cuisines ?? []), c.value];
                  onCuisinesChange?.(next);
                  onFieldBlur();
                }}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  active
                    ? 'bg-dc-pink text-white border-dc-pink'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-dc-pink/50'
                }`}
              >
                {c.icon} {c.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };
```

**4d.** Replace the industry `<div>…<Select id="industry">…</Select></div>` block in the **location-mode** branch (the first Business Info section) with:

```tsx
          {renderCategoryField()}
```

**4e.** Replace the industry `<div>…<Select id="industry">…</Select></div>` block in the **main** return (the second Business Info section) with:

```tsx
        {renderCategoryField()}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, sign in as a restaurant, open Settings → Business Info. Expected: a **Cuisine** chip group (not an Industry dropdown); toggling chips saves (toast "Saved"); reload shows the selection persisted.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useBusinessProfileForm.ts src/hooks/useBusinessProfileSubmit.ts src/pages/BusinessSettings.tsx src/components/settings/BusinessSettingsSections.tsx
git commit -m "feat: edit restaurant cuisines in settings (brand keeps industry)"
```

---

## Task 5: Public profile shows cuisine chips

**Files:**
- Modify: `src/pages/PublicBusinessProfile.tsx`

**Interfaces:**
- Consumes: `cuisineLabel` from `@/lib/cuisines` (Task 1); `business_profiles.cuisines` (Task 2).

- [ ] **Step 1: Add the import**

In `src/pages/PublicBusinessProfile.tsx`:

```tsx
import { cuisineLabel } from '@/lib/cuisines';
```

- [ ] **Step 2: Extend the local type + query**

Add to the `BusinessProfile` interface (after `industry: string;`):

```tsx
  cuisines?: string[] | null;
```

Add `cuisines` to the profile `.select(...)` string (append `, cuisines`) near line 66:

```tsx
          .select('id, user_id, business_name, industry, cuisines, average_rating, total_reviews, website_url, location, description, company_size, founded_year, employee_count_range, budget_range, preferred_collaboration_style, timezone, logo_url, instagram_url, facebook_url, linkedin_url, x_url, other_social_url, sample_content_urls, created_at')
```

- [ ] **Step 3: Render chips before the industry fallback**

Replace the industry branch of the header ternary (currently `) : profile.industry ? (` … `</div>\n          ) : null}`) with a cuisines-first version:

```tsx
          ) : (profile.cuisines && profile.cuisines.length > 0) ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {profile.cuisines.slice(0, 4).map((c) => (
                <span
                  key={c}
                  className="text-xs font-medium uppercase text-dc-pink-accent bg-dc-pink-accent/10 rounded-full px-2 py-0.5"
                >
                  {cuisineLabel(c)}
                </span>
              ))}
            </div>
          ) : profile.industry ? (
            <div className="flex items-center gap-1 text-sm text-dc-pink-accent">
              <Star className="h-3.5 w-3.5 fill-dc-pink-accent" />
              <span className="font-medium uppercase">{profile.industry.replace('_', ' ')}</span>
            </div>
          ) : null}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

With `npm run dev`, open a restaurant's public profile that has cuisines set. Expected: cuisine chips render; a restaurant with empty cuisines still shows the industry label (no blank state).

- [ ] **Step 6: Commit**

```bash
git add src/pages/PublicBusinessProfile.tsx
git commit -m "feat: show cuisine chips on public restaurant profile"
```

---

## Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: the new `cuisines` and `OnboardingWizard` tests pass. Judge by the "N passed, N failed" summary (pre-existing unrelated file failures are known — see project notes — so confirm 0 NEW failures rather than trusting the exit code).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 3: Manual end-to-end (both viewports)**

With `npm run dev`: complete a fresh restaurant signup → the second step is "What kind of food do you serve?" with a multi-select grid; Continue is disabled until ≥1 pick; finishing lands on the dashboard. Settings shows the cuisine chip group. The public profile shows cuisine chips. Verify desktop and mobile widths.

---

## Task 7: Deploy (ordering-sensitive)

**Files:** none (deploy actions).

- [ ] **Step 1: Apply the migration to PROD first**

Invoke the `careful` skill (DROP/RENAME-free, but it's a prod schema write). Apply `supabase/migrations/20260807163000_business_profiles_cuisines.sql` to prod via the Supabase MCP `apply_migration`. Verify with `verify-db-schema`: `business_profiles.cuisines` exists as `text[]` NOT NULL default `{}`.

- [ ] **Step 2: Merge the frontend**

Only after Step 1 succeeds, merge `feat/restaurant-onboarding-cuisine`. Frontend that reads/writes `cuisines` must never reach prod before the column exists.

- [ ] **Step 3: Verify prod**

Use `verify-prod`: load dragoncandy.io, spot-check restaurant onboarding shows the cuisine step, no new console errors, both viewports.

---

## Self-Review

**Spec coverage:**
- New `cuisines text[]` column → Task 2. ✓
- Restaurant onboarding cuisine step (multi, ≥1) → Task 3. ✓
- `industry='food'` retained for restaurants; brand keeps industry → Tasks 3 (onboarding) + 4 (settings). ✓
- Settings editable cuisines → Task 4. ✓
- Public profile cuisine chips w/ industry fallback → Task 5. ✓
- Shared constant + types + form wiring → Tasks 1, 2, 4. ✓
- Deploy ordering hazard → Task 7 + Global Constraints. ✓
- Tests → Tasks 1, 3 + verification Task 6. ✓
- Out of scope (locations/revenue/store count) → not present. ✓

**Placeholder scan:** No TBD/TODO; every code step shows concrete code; every command has an expected result.

**Type consistency:** `cuisines` is `string[]` on the form (`BusinessProfileFormData`) and DB `Row`; nullable (`string[] | null`) only on `Insert`/`Update` and the read-optional `PublicBusinessProfile` type (guarded with `profile.cuisines && .length`). `handleCuisinesChange` / `onCuisinesChange` signatures match `(cuisines: string[]) => void` across the hook, page, and section. `CUISINE_ITEMS`/`CUISINE_VALUES`/`cuisineLabel` names are consistent across Tasks 1, 3, 4, 5.
