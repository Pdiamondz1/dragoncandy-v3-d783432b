# Code Architecture Audit Remediation Design

**Date:** 2026-05-04
**Source audit:** `docs/code-architecture-audit.docx`
**Scope:** All 12 issues identified in the audit, covering both desktop and mobile codepaths.

## Summary

The code architecture audit identified 12 issues ranging from Critical to Low severity. This spec defines a 7-phase remediation plan that addresses every issue. Phases are ordered so each builds on the previous one, with `npm run build` verification between each phase. No UI/UX changes are introduced — this is purely code quality, type safety, and convention enforcement.

## Phase 1: Strict Mode + Unused Imports

**Audit issues addressed:** #1 (Critical), partial #3 (High)

### Changes

1. **`tsconfig.app.json`** — update compiler options:
   - `strict: true`
   - `noUnusedLocals: true`
   - `noUnusedParameters: true`
   - `noFallthroughCasesInSwitch: true`
   - `noImplicitOverride: true`
   - `exactOptionalPropertyTypes: false` (deferred — would surface 50+ additional errors)

2. **`tsconfig.json`** (root) — set `strictNullChecks: true`, remove `noImplicitAny: false` and `noUnusedLocals: false` since the app config now governs these via `strict: true`.

3. **Fix ~149 `TS6133` / `TS6196` / `TS6192` errors** — delete unused imports, prefix unused function parameters with `_`. No logic changes.

4. **Add `typecheck` script to `package.json`:**
   ```json
   "typecheck": "tsc --noEmit -p tsconfig.app.json"
   ```

### Risk

Near zero. Deleting unused imports cannot change runtime behavior. The strict flag does not change compiled output.

### Verification

`npm run build` and `npm run typecheck` both pass with zero errors.

## Phase 2: Real Type Errors

**Audit issues addressed:** #3 (High), partial #2 (High)

### Changes

Fix ~30 genuine type bugs surfaced by strict mode:

| Error Type | Count | Fix Pattern |
|-----------|-------|-------------|
| `TS18047` — possibly null | 3 | Null check or optional chaining (`?.`) |
| `TS18048` — possibly undefined | 2 | `?? fallback` or guard clause |
| `TS2345` — argument type mismatch | 7 | Narrow type before passing, or fix function signature |
| `TS2322` — assignment type mismatch | 6 | Type assertion where safe, or fix source type |
| `TS7006` — implicit any parameter | 3 | Add explicit type annotation |
| `TS2339` — property doesn't exist | 2 | Fix type definition or add narrowing |
| Other (`TS7034`/`TS7005`/`TS18046`) | 3 | Add annotations |

### Key files

- `CreatorDashboard.tsx` — `string | undefined` assigned to `string`
- `UserPresenceIndicator.tsx` — `.status` on `never` type (likely dead code path)
- `useProjectComplete.ts` — `creatorProfile` possibly null
- `CreatorMatchingSection.tsx` — `skill` parameter implicitly `any`
- `BrandCampaignCard.tsx` — `sponsorship_count` possibly undefined

### Approach

Each fix is surgical — one-line optional chaining, nullish coalescing, or type narrowing. If any fix requires more than 3 lines, flag and assess individually. The `never` type error in `UserPresenceIndicator.tsx` likely indicates dead code that should be removed.

### Verification

`npm run typecheck` passes with zero errors. `npm run build` succeeds.

## Phase 3: `any` Elimination + `@ts-ignore` Removal

**Audit issues addressed:** #2 (High), #12 (Low)

### 3a: Regenerate Supabase types

All 7 `@ts-ignore` occurrences exist because `campaign_media` and `campaign_deliverables` tables were added but the type generator was never re-run.

```bash
supabase gen types typescript --project-id zocahiffooqdybdhguqv --schema public > src/integrations/supabase/types.ts
```

Then delete all `@ts-ignore` lines:
- `useUploadCampaignMedia.ts:74`
- `useCampaignDeliverables.ts:9`
- `useCampaignEditForm.ts:186, 192`
- `useCampaignMedia.ts:9`
- `cleanupCampaignMedia.ts:27, 64`

### 3b: Replace `any` with real types

175 occurrences across 97 files. Strategy by source:

| Source of `any` | Fix |
|----------------|-----|
| Supabase query results (majority) | Use `Database['public']['Tables']['x']['Row']` from generated types |
| Event handlers / callbacks | Type the event parameter (`React.ChangeEvent<HTMLInputElement>`, etc.) |
| Catch blocks (`catch (e: any)`) | Replace with `catch (e: unknown)` + type narrowing |
| Complex third-party types (Stripe, etc.) | Use library exported types, or narrow `unknown` |
| Genuinely unknowable shapes | Replace `any` with `unknown` |

**Priority files** (highest `any` count): `useNotifications.ts` (10), `useProjectCompletion.ts` (7), `ToastConnectionCard.tsx` (7), `useDonny.ts` (6), `useCampaignWizard.ts` (6).

**Out of scope:** `any` types inside `node_modules` / third-party library definitions.

### 3c: Supabase query convention fixes (Issue #10)

- `HelpArticlePage.tsx:22` — replace `.select("*")` with explicit column list (the columns the component actually reads).
- 27 `.select()` no-arg calls after mutations — replace with explicit fields. If the mutation only needs the returned ID, use `.select('id')`. The implementer determines the correct column list per-query by checking what the surrounding code destructures from the result.

### Verification

`npm run typecheck` passes. Grep `": any"` in `src/` returns zero or a documented, justified handful with inline `eslint-disable-next-line` comments. Grep `.select("*")` in `src/` returns zero.

## Phase 4: Error Handling

**Audit issues addressed:** #4 (High), #5 (High)

### 4a: Build shared `<ErrorState>` component

Create `src/components/ui/error-state.tsx` — named export, Tailwind-styled (dc-teal retry button, dc-dark text). Props: `message: string`, `onRetry?: () => void`.

### 4b: Wire `ReviewsErrorBoundary`

Currently defined in `src/components/reviews/ReviewsErrorBoundary.tsx` but never imported. Wire it into `ReviewsManagement.tsx` and `RatingModal` — reviews involve user-submitted content and are a plausible crash site.

### 4c: Add error states to query consumers

Combined approach:

1. Set `throwOnError: true` on the `QueryClient` default options for queries (not mutations — those still toast). Unhandled query errors propagate to the nearest `ErrorBoundary` automatically. The `ErrorBoundary` fallback displays a generic user-friendly message ("Something went wrong"), never raw error text or stack traces.

2. For critical user paths (dashboard, messaging, campaign browse, creator profile), add explicit `error` destructuring with `<ErrorState>` and retry buttons:
   ```tsx
   const { data, isLoading, error, refetch } = useFoo();
   if (isLoading) return <LoadingSpinner />;
   if (error) return <ErrorState message={error.message} onRetry={refetch} />;
   ```

3. Everything else falls back to existing `ErrorBoundary` wrappers in `App.tsx` and `DashboardLayout.tsx`.

### Not doing

We will not add new `ErrorBoundary` wrappers around every public page and messaging surface. The `throwOnError: true` default plus existing root and dashboard boundaries covers 90% of crash scenarios. Granular boundaries can be added post-launch when we have real crash telemetry.

### Verification

`npm run build` passes. To verify error handling: temporarily modify a hook's `queryFn` to throw (e.g., `throw new Error('test')`) and confirm the `<ErrorState>` component renders on critical pages instead of an empty page or raw error text. Revert the test throw after verification.

## Phase 5: Tailwind Token Drift

**Audit issues addressed:** #6 (Medium), #11 (Low)

### 5a: Add missing tokens to `tailwind.config.ts`

```ts
dc: {
  // existing tokens...
  text: '#111111',
  'text-muted': '#555555',
}
```

### 5b: Replace arbitrary hex classes with `dc-*` tokens

53 occurrences. Mapping:

| Arbitrary Class | Replacement |
|----------------|-------------|
| `bg-[#4DD9C0]` | `bg-dc-teal` |
| `text-[#4DD9C0]` | `text-dc-teal` |
| `bg-[#F9A8D4]` | `bg-dc-pink` |
| `text-[#F9A8D4]` | `text-dc-pink` |
| `text-[#EC4899]` | `text-dc-pink-accent` |
| `bg-[#EC4899]` | `bg-dc-pink-accent` |
| `bg-[#F9C8E0]` | `bg-dc-pink-bg` |
| `bg-[#A8A8A0]` | `bg-dc-gray` |
| `text-[#111]`, `text-[#111111]` | `text-dc-text` |
| `bg-[#111]` | `bg-dc-text` |
| `text-[#555]`, `text-[#555555]` | `text-dc-text-muted` |
| `bg-[#FACC15]` | `bg-dc-yellow` |
| `hover:bg-[#3ec4ac]` | `hover:bg-dc-teal-hover` |

### 5c: Define `dc-teal-hover` token

Add `'teal-hover': '#3ec4ac'` to the `dc` color block for the hover state used in `ErrorBoundary.tsx`.

### 5d: `!important` declarations — no change

The 7 `!important` declarations on `.fixed-sidebar` utilities in `index.css` work correctly for the landing page portfolio sidebar. Cosmetic issue, not worth the regression risk.

### Not doing

- `style={{...}}` inline styles (33 occurrences) — audit confirmed these are legitimate dynamic values.
- Hex values in `main.tsx` pre-React error fallback — Tailwind isn't loaded at that point.

### Verification

`npm run build` passes. Visual spot-check of Donny chat, landing page HowItWorks section, and ErrorBoundary fallback to confirm identical color rendering.

## Phase 6: Export Conventions + Dead Code

**Audit issues addressed:** #7 (Medium), #8 (Medium)

### 6a: Flip 127 default exports to named exports in `src/components/`

Per file:
1. `export default function Foo` becomes `export function Foo`
2. Update every importer from `import Foo from './Foo'` to `import { Foo } from './Foo'`
3. Files with BOTH default and named export of same component: remove default, keep named.

**Exception:** `src/components/ui/**` (shadcn-generated files) — leave as-is.

### 6b: Delete truly unused exports

107 exports never imported anywhere. Key deletions:
- `src/components/DesktopGate.tsx` — entire file
- Unused hooks: `useBetaFeedback`, `useBetaOnboarding`, `useBudgetStatus`, `useCampaignMarketplaceFilters`, `useDonnyDashboard`, `useFeatureFlags`, `usePageTracking`, `useProfileCompletion`, `useRequireAuth`, `useUploadCampaignMedia`
- Re-export shim files: `useCampaignApplications.ts`, `useFileOperations.ts`, `useFileUploads.ts`

**Safety check:** Before deleting, grep for dynamic imports (`import()`) and string references to each symbol.

### 6c: Remove `export` keyword from 236 "used in module" exports

Symbols exported but only used within the same file. Drop the `export` keyword to keep module surface clean.

### 6d: Move utility helpers out of page files

Move `isSiteUnlocked` and `isPublicPath` from `SiteGate.tsx` to `src/lib/siteGate.ts`. Update importers.

### Verification

`npm run build` passes. `npm run typecheck` passes. Grep `export default` in `src/components/` (excluding `ui/`) returns zero.

## Phase 7: Console Cleanup + ESLint Hardening

**Audit issues addressed:** #9 (Medium), partial #2 (High)

### 7a: Remove console statements

302 occurrences. Strategy:
- `console.log` and `console.debug` — delete (leftover debugging).
- `console.error` in `catch` blocks and `ErrorBoundary` — keep (legitimate error reporting).
- `console.warn` — keep where it guards against genuinely unexpected states, delete where it's debugging noise.

Expected: ~200 deletions, ~100 intentional `console.error`/`console.warn` retained.

### 7b: ESLint rule additions

Update `eslint.config.js`:

```js
rules: {
  // Existing rules...
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": "error",  // currently "off"
  "no-console": ["warn", { allow: ["error", "warn"] }],
}
```

### Not doing

- No `eslint-plugin-import` for `import/no-default-export` — would require a new dependency. Convention enforced by Phase 6 refactor.
- No custom `src/lib/logger.ts` abstraction — premature without an observability pipeline (Sentry, Datadog, etc.).

### Verification

`npm run build` passes. `npm run lint` passes with no new warnings. Grep `console.log` in `src/` returns zero.

## Phase 8: Post-Remediation Audit

After all 7 phases, run a verification audit:

1. `npm run typecheck` — zero errors under strict mode
2. `npm run build` — clean build
3. `npm run lint` — zero errors, only expected warnings
4. Grep verification:
   - `@ts-ignore` in `src/` -> 0
   - `": any"` in `src/` -> 0 (or documented exceptions)
   - `console.log` in `src/` -> 0
   - `bg-[#` / `text-[#` in `src/` -> 0 (excluding `main.tsx` pre-React fallback)
   - `export default` in `src/components/` (excluding `ui/`) -> 0
   - `.select("*")` in `src/` -> 0
5. Visual spot-check: landing page, Donny chat, dashboard, messaging — confirm no regressions.

## Out of Scope

- `exactOptionalPropertyTypes` in tsconfig (deferred — 50+ additional errors)
- `style={{...}}` inline styles (legitimate dynamic values)
- `!important` declarations in `index.css` (working correctly, cosmetic only)
- Hex values in `main.tsx` pre-React fallback (Tailwind not loaded)
- `eslint-plugin-import` dependency (convention enforced by refactor)
- Custom logger abstraction (premature without observability pipeline)
- New `ErrorBoundary` wrappers for every page (deferred to post-launch)
- `any` types inside `node_modules` / third-party definitions

## Files Referenced

### Config files (modified)
- `tsconfig.json`
- `tsconfig.app.json`
- `package.json`
- `eslint.config.js`
- `tailwind.config.ts`

### New files
- `src/components/ui/error-state.tsx`

### Deleted files
- `src/components/DesktopGate.tsx`
- `src/hooks/useBetaFeedback.ts`
- `src/hooks/useBetaOnboarding.ts`
- `src/hooks/useBudgetStatus.ts`
- `src/hooks/useCampaignMarketplaceFilters.ts`
- `src/hooks/useDonnyDashboard.ts`
- `src/hooks/useFeatureFlags.ts`
- `src/hooks/usePageTracking.ts`
- `src/hooks/useProfileCompletion.ts`
- `src/hooks/useRequireAuth.tsx`
- `src/hooks/useUploadCampaignMedia.ts`
- `src/hooks/useCampaignApplications.ts` (re-export shim)
- `src/hooks/useFileOperations.ts` (re-export shim)
- `src/hooks/useFileUploads.ts` (re-export shim)

### Regenerated files
- `src/integrations/supabase/types.ts`

### Moved
- `isSiteUnlocked`, `isPublicPath` from `SiteGate.tsx` to `src/lib/siteGate.ts`
