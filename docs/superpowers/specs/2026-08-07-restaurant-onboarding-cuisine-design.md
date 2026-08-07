# Restaurant Onboarding — Phase 1: Cuisine Step (Design)

**Date:** 2026-08-07
**Status:** Approved shape & phasing; Phase 1 spec for review
**Branch:** `feat/restaurant-onboarding-cuisine`

---

## Problem

In business (`business_client`) onboarding, the "industry" step shows the title **"What kind of food?"** but renders a generic **industry** grid (Food & Dining, Fashion, Beauty, Technology, Travel, Automotive, Real Estate, …). A restaurant is asked about *food* and then shown *other industries*. The field also defaults to `'food'` and is pre-selected, so for a restaurant this step collects **no useful signal** — and it isn't used in matching, only shown as a label on the public profile.

DragonCandy is restaurant-first right now, so this step should capture something real and restaurant-shaped: **cuisine**.

**Source:** `src/components/onboarding/OnboardingWizard.tsx` — title at line 235, `INDUSTRY_ITEMS` at lines 33–48, business default `industry = 'food'` at line 101.

## Broader vision & phasing (context — NOT all in this spec)

The full effort captures richer, restaurant-shaped data (cuisine, address, store count, revenue) to serve creator matching, sales qualification, personalization, and profile completeness — sequenced to protect signup completion (lean signup + a guided "Finish your profile" step after). It is intentionally split into three independently shippable phases:

- **Phase 1 (THIS SPEC)** — Replace the restaurant "industry" step with a **cuisine** step + store cuisines. No org/location work. Fixes the visible bug.
- **Phase 2 (future)** — Locations in signup: single/multiple toggle + primary address, backed by `org_units`; requires resolving how a business gets its org/primary `org_unit` and backfilling existing businesses.
- **Phase 3 (future)** — "Finish your profile" guided flow: annual revenue (ranges, optional-but-nudged), additional locations, marketing goals/budget, using the existing `ProfileCompletionBar`.

Phases 2 and 3 are **out of scope** here. No revenue column, no `location_count`, no structured address in Phase 1.

## Goal (Phase 1)

For a restaurant (`business_client`), replace the industry step with a **multi-select cuisine** picker (pick ≥1), persist the selection, and surface it in Settings and on the public profile. The **brand** role is unchanged — it keeps the real industry picker.

## Scope

**In scope**
- New `business_profiles.cuisines text[]` column (migration).
- Onboarding: restaurant path shows a `cuisine` step instead of `industry`; brand path keeps `industry`.
- Persist `cuisines` on submit; keep `industry = 'food'` for restaurants (compatibility).
- Settings: editable cuisines for restaurant accounts.
- Public business profile: show cuisines (chips) for restaurants, falling back to the industry label when empty.
- Shared cuisine constant + types + form-hook wiring.
- Tests.

**Out of scope** — locations/address, revenue, store count, the guided "Finish your profile" flow, any change to the brand or creator onboarding paths, changes to matching logic beyond storing the field.

## Cuisine list

Multi-select, **at least one required**. Stored as slugs; labels/emojis are presentation only. Defined once in a shared module and reused by onboarding + settings.

| Slug | Label | Icon |
|---|---|---|
| `american` | American | 🍔 |
| `italian` | Italian | 🍝 |
| `mexican` | Mexican | 🌮 |
| `chinese` | Chinese | 🥡 |
| `japanese` | Japanese / Sushi | 🍣 |
| `thai` | Thai | 🍜 |
| `indian` | Indian | 🍛 |
| `mediterranean` | Mediterranean | 🫒 |
| `middle_eastern` | Middle Eastern | 🧆 |
| `korean` | Korean | 🍲 |
| `vietnamese` | Vietnamese | 🥢 |
| `bbq` | BBQ | 🍖 |
| `pizza` | Pizza | 🍕 |
| `seafood` | Seafood | 🦐 |
| `vegetarian` | Vegan / Vegetarian | 🥗 |
| `cafe` | Cafe / Coffee | ☕ |
| `bakery` | Bakery / Dessert | 🧁 |
| `bar` | Bar / Pub | 🍺 |
| `brunch` | Breakfast / Brunch | 🥞 |
| `fast_food` | Fast Food | 🍟 |
| `food_truck` | Food Truck | 🚚 |
| `other` | Other | ✨ |

## Data model

**Migration** (apply to PROD **before** merging the frontend — see Deploy ordering):

```sql
alter table public.business_profiles
  add column if not exists cuisines text[] not null default '{}';
```

- `text[]`, not an enum — the list is app-owned and expected to evolve; avoids enum-migration churn. Validation is app-level via the shared constant.
- `not null default '{}'` so reads never hit null. Existing rows get `{}`.
- `industry` column is **retained**. Restaurants get `industry = 'food'` set automatically (no UI); brand keeps its picker. Nothing that reads `industry` breaks.

## Existing cuisine system — unify (discovered during implementation, 2026-08-07)

**Correction to an earlier assumption.** A cuisine concept already exists in production. The DragonShare "Browse Restaurants" page (`/dashboard/creator/dragonshare/browse`, live) filters restaurants by cuisine using two prod-only DB functions (not in the repo — DB drift):

- `list_restaurant_cuisines()` → `SELECT DISTINCT ou.brand_category` of each restaurant's primary `org_units` row.
- `search_restaurants(search_term, cuisine_filter, result_limit)` → filters `ou.brand_category ILIKE cuisine_filter`.

So the pre-existing "cuisine" is the primary location's free-text `org_units.brand_category`. Left alone, the new `business_profiles.cuisines` would be a **disconnected parallel store** the browse filter ignores.

**Decision: unify on `business_profiles.cuisines`** (user-approved 2026-08-07). It becomes the single source of truth; both functions are repointed to read it and brought into the repo as a migration (fixing the drift):

- `list_restaurant_cuisines()` → distinct `unnest(bp.cuisines)` for active restaurants (returns slugs).
- `search_restaurants(...)` → cuisine clause becomes `cuisine_filter IS NULL OR cuisine_filter = ANY(bp.cuisines)`. **Signature and return shape are preserved** — the generated RPC types are unchanged.
- Browse UI (`RestaurantBrowseHeader`) displays `cuisineLabel(slug)` instead of the raw value; the selected slug is still passed as the filter value.

**Clean cutover — no backfill/fallback.** Prod check (2026-08-07): of 12 restaurant primary units, 10 have `brand_category = NULL`, plus one "Diner" and one "Events" — effectively no existing cuisine data to preserve. Restaurants with empty `cuisines` simply won't appear under a specific cuisine filter (they still appear unfiltered); onboarding + settings fill the data going forward.

## Components & files

### New
- `src/lib/cuisines.ts` — exports `CUISINE_ITEMS: { value; label; icon }[]`, `CUISINE_VALUES: Set<string>`, and `cuisineLabel(slug)`.

### Modified
- `src/components/onboarding/OnboardingWizard.tsx`
  - `StepId` gains `'cuisine'`. `ROLE_STEPS.business_client = ['identity','cuisine','welcome']`; `brand` stays `['identity','industry','welcome']`.
  - New `cuisines` state (`string[]`) + `toggleCuisine` (mirror of `toggleSkill`).
  - `stepTitle`: `cuisine` → "What kind of food do you serve?"; `industry` (brand) → "What's your industry?".
  - `stepSubtitle`: `cuisine` → "Pick all that apply".
  - `isStepValid`: `case 'cuisine': return cuisines.length > 0`.
  - `renderStep`: `case 'cuisine'` renders `TapGrid` (`items={CUISINE_ITEMS}`, `mode="multi"`).
  - Footer helper for `cuisine`: "This helps us match you with the right creators".
  - `handleSubmit` (business branch): write `cuisines` for `business_client`; set `industry = role === 'brand' ? industry : 'food'`. Drop the `role === 'business_client' ? 'food' : ''` industry pre-selection default (no longer shown).
- `src/components/settings/BusinessSettingsSections.tsx` — for restaurant accounts (`account_type === 'restaurant'`), render a cuisines multi-select (chip toggles from `CUISINE_ITEMS`) in **Business Info**; brand accounts (`account_type === 'brand'`) keep the industry `Select`. If `account_type` isn't already on the settings form data, thread it in so the discriminator is reliable rather than inferred.
- `src/hooks/useBusinessProfileForm.ts` + `src/hooks/useBusinessProfileSubmit.ts` — add `cuisines: string[]` to `BusinessProfileFormData`; load/save it.
- `src/pages/PublicBusinessProfile.tsx` — add `cuisines` to the `BusinessProfile` type + `.select()`; where the industry label renders (~lines 208–211), show cuisine chips when `cuisines.length > 0`, else the existing industry label.
- `src/integrations/supabase/types.ts` — add `cuisines` to `business_profiles`: Row `string[]` (NOT NULL with a default), Insert `string[] | null` (optional — the default fills it), Update `string[] | null`.

## Behavior details

- **Restaurant onboarding:** identity → **cuisine** (≥1) → welcome. Submitting writes `business_name`, `logo`, `cuisines`, `industry='food'`, auto-detected location, `is_completed=true`.
- **Brand onboarding:** unchanged (identity → industry → welcome).
- **Creator onboarding:** unchanged.
- **Settings:** editing cuisines persists to `business_profiles.cuisines`; industry stays `'food'` for restaurants.
- **Public profile:** restaurants display cuisine chips; brands/legacy rows with empty cuisines fall back to the industry label (no blank state).

## Deploy ordering (hazard)

Per the project rule for new columns: **apply the migration to PROD first**, then deploy/merge the frontend that reads/writes `cuisines`. Shipping code before the column exists would 400 on insert/select. No edge-function changes in Phase 1.

## Testing

- **OnboardingWizard** (RTL, jsdom): cuisine step Continue is disabled with 0 selected, enabled with ≥1; submit payload includes selected `cuisines` and `industry='food'` for `business_client`, and `industry=<picked>` with no cuisines for `brand`.
- **Settings:** toggling cuisines updates form state and the save payload.
- **Public profile:** renders cuisine chips when present; falls back to industry label when empty.
- RTL files follow the per-file jsdom convention (`// @vitest-environment jsdom` + `@testing-library/jest-dom` import as the first two lines). Trust "N passed, 0 failed", not the suite exit code.

## Open questions (resolved)

- Storage: `text[]` (not enum). ✓
- Selection: multi-select, ≥1 required. ✓
- `industry` for restaurants: auto-set `'food'`, retained for compatibility; profile shows cuisines. ✓

## Risks

- **Settings multi-select UI** is the only net-new UI element (onboarding reuses `TapGrid`). Keep it a lightweight chip-toggle group driven by the shared constant — no new dependency.
- **`types.ts` drift:** prefer regenerating types post-migration over hand-editing if the generator is available; otherwise hand-edit the three `business_profiles` shapes consistently.
