# Code Architecture Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 12 issues from the code architecture audit across 7 sequential phases, each verified with `npm run build`.

**Architecture:** Config-first approach — enable strict TypeScript, then fix surfaced errors, then clean up conventions and dead code. Each phase builds on the previous. No UI/UX changes; code quality and type safety only.

**Tech Stack:** React, TypeScript (strict mode), Tailwind CSS, Supabase, React Query, Vite, ESLint.

**Spec:** `docs/superpowers/specs/2026-05-04-code-architecture-audit-remediation-design.md`

**Platform:** Windows 11 (PowerShell primary, Git Bash available). Shell commands in this plan use Git Bash syntax (`grep`, `wc -l`, `head`). Run these via the Bash tool, or use PowerShell equivalents: `Select-String` for grep, `Measure-Object` for wc -l, `Select-Object -First N` for head.

---

## Task 1: Enable TypeScript Strict Mode

**Files:**
- Modify: `tsconfig.app.json` (lines 15-19)
- Modify: `tsconfig.json` (lines 3-6)
- Modify: `package.json` (line 6-14, add `typecheck` script)

- [ ] **Step 1: Update `tsconfig.app.json` compiler options**

Replace the lax flags with strict mode:

```json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "noEmit": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "paths": { "@/*": ["./src/*"] },
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "target": "ES2020",
    "types": ["vitest/globals"],
    "useDefineForClassFields": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Update `tsconfig.json` root config**

```json
{
  "compilerOptions": {
    "allowJs": true,
    "paths": { "@/*": ["./src/*"] },
    "skipLibCheck": true,
    "strictNullChecks": true
  },
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 3: Add `typecheck` script to `package.json`**

Add to the `"scripts"` block:

```json
"typecheck": "tsc --noEmit -p tsconfig.app.json"
```

- [ ] **Step 4: Capture the full error list**

Run: `npm run typecheck 2>&1 | head -300`

Expected: ~200 errors. Save this output — it guides the next two tasks. The build will NOT pass yet. That's expected.

- [ ] **Step 5: Commit config changes only**

```bash
git add tsconfig.app.json tsconfig.json package.json
git commit -m "chore: enable TypeScript strict mode and add typecheck script"
```

---

## Task 2: Fix Unused Imports and Variables (~149 errors)

**Files:**
- Modify: All files reporting `TS6133`, `TS6196`, `TS6192` errors (unused imports/locals/declarations)

These are the ~149 unused import errors surfaced by `noUnusedLocals`/`noUnusedParameters`. Each fix is a line deletion or prefixing an unused parameter with `_`.

- [ ] **Step 1: Get the list of unused-import errors**

Run: `npm run typecheck 2>&1 | grep -E "TS6133|TS6196|TS6192"`

Expected: ~149 lines showing unused imports/variables.

- [ ] **Step 2: Fix all unused imports**

For each `TS6133` (declared but never read) and `TS6192` (all imports unused):
- Delete the unused import line entirely.
- If only some imports from a line are unused, remove just those identifiers.

For each `TS6196` (declared but never used):
- If it's a function parameter, prefix with `_` (e.g., `event` → `_event`).
- If it's a local variable, delete it.

Work file-by-file through the top offenders first:
- `src/pages/CreatorDashboard.tsx`
- `src/hooks/useDragonShare.ts`
- `src/components/projects/CreatorPayoutBanner.tsx`
- `src/components/messages/UserPresenceIndicator.tsx`
- `src/components/messages/MessageBubbleEnhanced.tsx`
- `src/pages/ROIDashboard.tsx`
- `src/pages/ReviewsManagement.tsx`
- `src/lib/navConfig.ts`
- `src/hooks/useProjectComplete.ts`
- `src/hooks/useMessageMutations.ts`
- `src/hooks/useAnonymousCampaignWizard.ts`
- `src/components/payments/PaymentTimeline.tsx`
- `src/components/messages/MessageInputEnhanced.tsx`
- `src/components/campaigns/CreatorMatchingSection.tsx`
- `src/components/campaigns/BrandCampaignCard.tsx`

Then fix remaining files from the error list.

- [ ] **Step 3: Verify unused-import errors are resolved**

Run: `npm run typecheck 2>&1 | grep -c "TS6133\|TS6196\|TS6192"`

Expected: 0

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: May still fail if real type errors remain. That's fine — Task 3 handles those.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: remove ~149 unused imports and variables (strict mode cleanup)"
```

---

## Task 3: Fix Real Type Errors (~30 errors)

**Files:**
- Modify: Files with `TS2322`, `TS2345`, `TS18047`, `TS18048`, `TS7006`, `TS2339`, `TS7034`, `TS7005`, `TS18046` errors

- [ ] **Step 1: Get the remaining type error list**

Run: `npm run typecheck 2>&1 | grep -E "error TS"`

Expected: ~30 real type errors.

- [ ] **Step 2: Fix each error using surgical one-line patterns**

Fix patterns by error type:

**TS18047 (possibly null) / TS18048 (possibly undefined):**
```tsx
// Before:
const x = obj.property;
// After:
const x = obj?.property ?? fallback;
```

**TS2322 (assignment type mismatch):**
```tsx
// Before: Type 'string | undefined' is not assignable to type 'string'
const name: string = profile?.name;
// After:
const name: string = profile?.name ?? '';
```

**TS2345 (argument type mismatch):**
Narrow the type before passing, or use a guard:
```tsx
if (value !== undefined) { fn(value); }
```

**TS7006 (implicit any parameter):**
```tsx
// Before:
skills.map(skill => ...)
// After:
skills.map((skill: string) => ...)
```

**TS2339 (property doesn't exist):**
In `UserPresenceIndicator.tsx` line 77, `.status` on `never` — this is dead code. Remove the unreachable branch.

**Key files to fix (from audit):**
- `src/pages/CreatorDashboard.tsx:94` — `string | undefined` → add `?? ''`
- `src/components/messages/UserPresenceIndicator.tsx:77` — `.status` on `never` → remove dead code branch
- `src/hooks/useProjectComplete.ts:132` — `creatorProfile` possibly null → add null check
- `src/components/campaigns/CreatorMatchingSection.tsx:362` — `skill` implicitly any → add `: string`
- `src/components/campaigns/BrandCampaignCard.tsx:125` — `sponsorship_count` possibly undefined → add `?? 0`

- [ ] **Step 3: Verify zero type errors**

Run: `npm run typecheck`

Expected: 0 errors.

- [ ] **Step 4: Verify build passes**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 5: Run existing tests**

Run: `npm run test`

Expected: All tests pass (we changed no logic, only added type safety).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: resolve ~30 real type errors surfaced by strict mode"
```

---

## Task 4: Regenerate Supabase Types and Remove @ts-ignore

**Files:**
- Regenerate: `src/integrations/supabase/types.ts`
- Modify: `src/hooks/useUploadCampaignMedia.ts:74`
- Modify: `src/hooks/useCampaignDeliverables.ts:9`
- Modify: `src/hooks/useCampaignEditForm.ts:186, 192`
- Modify: `src/hooks/useCampaignMedia.ts:9`
- Modify: `src/lib/cleanupCampaignMedia.ts:27, 64`

- [ ] **Step 1: Regenerate Supabase types**

Run: `npx supabase gen types typescript --project-id zocahiffooqdybdhguqv --schema public > src/integrations/supabase/types.ts`

If `supabase` CLI is not installed globally, install it first: `npm install -g supabase`

Expected: New types file with `campaign_media` and `campaign_deliverables` tables included.

- [ ] **Step 2: Remove all 7 @ts-ignore lines**

Delete the `// @ts-ignore` line (and any comment above it explaining why) from each file:

1. `src/hooks/useUploadCampaignMedia.ts:74`
2. `src/hooks/useCampaignDeliverables.ts:9`
3. `src/hooks/useCampaignEditForm.ts:186`
4. `src/hooks/useCampaignEditForm.ts:192`
5. `src/hooks/useCampaignMedia.ts:9`
6. `src/lib/cleanupCampaignMedia.ts:27`
7. `src/lib/cleanupCampaignMedia.ts:64`

- [ ] **Step 3: Verify**

Run: `grep -rn "@ts-ignore" src/`

Expected: 0 results.

Run: `npm run typecheck && npm run build`

Expected: Both pass. If new type errors surface from the regenerated types, fix them the same way as Task 3 (optional chaining, type narrowing).

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts src/hooks/useUploadCampaignMedia.ts src/hooks/useCampaignDeliverables.ts src/hooks/useCampaignEditForm.ts src/hooks/useCampaignMedia.ts src/lib/cleanupCampaignMedia.ts
git commit -m "fix: regenerate Supabase types and remove all @ts-ignore"
```

---

## Task 5: Replace `any` with Real Types

**Files:**
- Modify: ~97 files containing `any` (175 occurrences)
- Priority files: `src/hooks/useNotifications.ts` (10), `src/hooks/useProjectCompletion.ts` (7), `src/features/settings/ToastConnectionCard.tsx` (7), `src/hooks/useDonny.ts` (6), `src/hooks/useCampaignWizard.ts` (6), `src/components/brand-campaigns/BrandCampaignReviewStep.tsx` (6), `src/hooks/useProjectComplete.ts` (5), `src/pages/AdminDragonShareLedger.tsx` (4), `src/hooks/useOptimizedAnalytics.ts` (4)

- [ ] **Step 1: Get current `any` count**

Run: `grep -rn ": any\b\|as any\b\|<any>" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l`

Expected: ~175

- [ ] **Step 2: Fix `any` in Supabase query results**

Most `any` types come from untyped Supabase responses. Replace with generated types:

```tsx
// Before:
const data: any = result.data;
// After:
import { Database } from '@/integrations/supabase/types';
type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
const data: CampaignRow = result.data;
```

For each hook, check what table it queries and use the corresponding `Row` type.

- [ ] **Step 3: Fix `any` in catch blocks**

```tsx
// Before:
catch (e: any) { toast({ title: e.message }); }
// After:
catch (e: unknown) {
  const message = e instanceof Error ? e.message : 'An error occurred';
  toast({ title: message });
}
```

- [ ] **Step 4: Fix `any` in event handlers and callbacks**

```tsx
// Before:
onChange={(e: any) => setValue(e.target.value)}
// After:
onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
```

- [ ] **Step 5: Replace remaining `any` with `unknown`**

For genuinely unknowable shapes (e.g., third-party API responses with no published types), replace `any` with `unknown` and add type narrowing at the usage site.

- [ ] **Step 6: Verify**

Run: `grep -rn ": any\b\|as any\b\|<any>" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l`

Expected: 0 (or a small documented handful with `// eslint-disable-next-line` explaining why).

Run: `npm run typecheck && npm run build`

Expected: Both pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: replace 175 'any' usages with real types across 97 files"
```

---

## Task 6: Fix Supabase .select() Conventions

**Dependency note:** This task modifies `src/hooks/useUploadCampaignMedia.ts:88` which Task 12 may later delete. That's fine — if the file is deleted, the `.select()` fix goes with it. Complete this task as-is.

**Files:**
- Modify: `src/pages/help/HelpArticlePage.tsx:22`
- Modify: 27 files with `.select()` no-arg calls (see full list below)

Full list of `.select()` no-arg files:
- `src/features/promotions/hooks/usePromotionMutations.ts:66`
- `src/hooks/useBrandShortlist.ts:38`
- `src/hooks/useBrandSettings.ts:35`
- `src/hooks/useCreateApplication.ts:37`
- `src/hooks/useCounterOffers.ts:77`
- `src/hooks/useConversations.ts:133`
- `src/hooks/useCampaignMutations.ts:44, 196`
- `src/hooks/useFileUploadMutations.ts:44`
- `src/hooks/useFileTags.ts:41`
- `src/hooks/useFilePermissions.ts:24`
- `src/hooks/useFileComments.ts:24`
- `src/hooks/useUserPresence.ts:80`
- `src/hooks/useDragonShare.ts:99`
- `src/hooks/useUploadCampaignMedia.ts:88`
- `src/hooks/useSubmitSponsorshipProposal.ts:64`
- `src/hooks/useDonny.ts:67`
- `src/hooks/useSubmitRating.ts:20`
- `src/hooks/useSponsorshipComplete.ts:66, 88`
- `src/hooks/useMessageReactions.ts:51`
- `src/hooks/usePromotions.ts:250`
- `src/hooks/useMessageMutations.ts:42, 163`
- `src/hooks/useProjectComplete.ts:57, 80`
- `src/hooks/useManageApplication.ts:59`

- [ ] **Step 1: Fix `HelpArticlePage.tsx` explicit `.select("*")`**

Read the component to see which fields it actually uses, then replace `.select("*")` with those fields:

```tsx
// Before:
.select("*")
// After (example — check actual fields used):
.select("id, title, body, slug, summary, updated_at, category")
```

- [ ] **Step 2: Fix `.select()` no-arg calls after mutations**

For each file, read the surrounding code to determine what fields the caller destructures from the mutation result. Common patterns:

```tsx
// If caller only checks success (no data used):
.select('id')

// If caller reads specific fields:
.select('id, status, updated_at')
```

Work through each file. For most mutation `.select()` calls, `.select('id')` is sufficient since the mutation result is typically only used to confirm success.

- [ ] **Step 3: Verify**

Run: `grep -rn "\.select(\"\*\")" src/`

Expected: 0

Run: `grep -rn "\.select()" src/ --include="*.ts" --include="*.tsx" | grep -v "\.select('" | grep -v "\.select(\""`

Expected: 0 bare `.select()` calls.

Run: `npm run typecheck && npm run build`

Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: replace .select('*') and bare .select() with explicit column lists"
```

---

## Task 7: Create ErrorState Component

**Files:**
- Create: `src/components/ui/error-state.tsx`

- [ ] **Step 1: Create the ErrorState component**

```tsx
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <AlertTriangle className="h-12 w-12 text-dc-pink-accent mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Oops!</h3>
      <p className="text-gray-500 mb-6 max-w-md">{message}</p>
      {onRetry && (
        <Button
          onClick={onRetry}
          className="bg-dc-teal hover:bg-dc-teal/90 text-white rounded-full"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}
```

Note: Uses `text-gray-900` and `text-gray-500` as temporary fallbacks. Task 9 adds the `dc-text` and `dc-text-muted` tokens. Task 10 Step 3 updates this component to use them.

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm run build`

Expected: Both pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/error-state.tsx
git commit -m "feat: add reusable ErrorState component for query error handling"
```

---

## Task 8: Wire ReviewsErrorBoundary and Add Error States to Critical Pages

**Files:**
- Modify: `src/pages/ReviewsManagement.tsx` (wrap content with ReviewsErrorBoundary)
- Modify: `src/components/reviews/RatingModal.tsx` (wrap with ReviewsErrorBoundary)
- Modify: `src/App.tsx:88-98` (add `throwOnError: true` to QueryClient)
- Modify: Critical pages to add explicit error handling:
  - `src/pages/BrandDashboard.tsx`
  - `src/pages/CreatorDashboard.tsx`
  - `src/pages/DirectMessagesPage.tsx`
  - `src/pages/BrandCreators.tsx`
  - `src/pages/CreatorApplications.tsx`

- [ ] **Step 1: Wire ReviewsErrorBoundary into ReviewsManagement.tsx**

Add import and wrap the page content:

```tsx
import ReviewsErrorBoundary from '@/components/reviews/ReviewsErrorBoundary';

// Inside the return, wrap the main content:
<ReviewsErrorBoundary>
  {/* existing page content */}
</ReviewsErrorBoundary>
```

- [ ] **Step 2: Wire ReviewsErrorBoundary into RatingModal.tsx**

Wrap the Dialog content with the boundary.

- [ ] **Step 3: Add `throwOnError: true` to QueryClient in App.tsx**

At `src/App.tsx:88-98`, update the QueryClient config:

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        console.error('Query failed:', error);
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000,
      throwOnError: true,
    },
  },
});
```

**Safety note:** This causes unhandled query errors to throw to the nearest ErrorBoundary. Verify that the existing boundaries cover all routes:
- Root `<ErrorBoundary>` in `App.tsx:272` wraps the entire app (catches everything)
- `DashboardLayout.tsx:272` wraps all dashboard routes with `level="page"`

The root boundary is the catch-all — no route can white-screen because every route is a child of the root boundary in App.tsx. If a query fails on a page without a closer boundary, the root one catches it.

- [ ] **Step 4: Add explicit error handling to critical pages**

For each critical page, find the main data hook call and add error/loading handling. Pattern:

```tsx
import { ErrorState } from '@/components/ui/error-state';

// Inside component:
const { data, isLoading, error, refetch } = useSomeHook();

if (error) return <ErrorState message={error.message} onRetry={refetch} />;
```

Pages to update:
- `src/pages/BrandDashboard.tsx` — `useBrandDashboardStats()` already has `isError: statsError`; add `<ErrorState>` render
- `src/pages/CreatorDashboard.tsx` — add `error` destructuring to main hooks
- `src/pages/DirectMessagesPage.tsx:15` — `useConversations()` currently ignores error
- `src/pages/BrandCreators.tsx` — `useCreatorBrowse()` — add error handling
- `src/pages/CreatorApplications.tsx` — already destructures `error`, verify it renders an error UI

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`

Expected: Both pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire error boundaries and add error states to critical pages"
```

---

## Task 9: Add Tailwind Design Tokens

**Files:**
- Modify: `tailwind.config.ts:27-37`

- [ ] **Step 1: Add missing tokens to tailwind.config.ts**

Update the `dc` color block to add `text`, `text-muted`, and `teal-hover`:

```ts
dc: {
  teal: '#4DD9C0',
  'teal-dark': '#00E5CC',
  'teal-hover': '#3ec4ac',
  pink: '#F9A8D4',
  'pink-accent': '#EC4899',
  'pink-bg': '#F9C8E0',
  gray: '#A8A8A0',
  yellow: '#FACC15',
  dark: '#1A1A2A',
  card: '#FFFFFF',
  text: '#111111',
  'text-muted': '#555555',
},
```

- [ ] **Step 2: Verify**

Run: `npm run build`

Expected: Clean build. New tokens are available but not yet used.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "chore: add dc-text, dc-text-muted, dc-teal-hover design tokens"
```

---

## Task 10: Replace Arbitrary Hex Colors with Design Tokens

**Files:**
- Modify: `src/components/donny/DonnyMessage.tsx`
- Modify: `src/components/donny/DonnyRichCard.tsx`
- Modify: `src/components/donny/DonnyTypingIndicator.tsx`
- Modify: `src/components/donny/DonnyChatView.tsx`
- Modify: `src/components/donny/DonnyQuickChips.tsx`
- Modify: `src/components/landing/HowItWorks.tsx`
- Modify: `src/components/ErrorBoundary.tsx`
- Modify: All other files with arbitrary hex Tailwind classes
- Modify: `src/components/ui/error-state.tsx` (update to use `dc-text`/`dc-text-muted` tokens now available)

- [ ] **Step 1: Find all arbitrary hex color usages**

Run: `grep -rn "bg-\[#\|text-\[#\|border-\[#\|hover:bg-\[#\|hover:text-\[#" src/ --include="*.tsx" --include="*.ts" | grep -v main.tsx`

Expected: ~53 occurrences.

- [ ] **Step 2: Replace hex colors with dc-* tokens**

Use find-and-replace across the codebase:

| Find | Replace |
|------|---------|
| `bg-[#4DD9C0]` | `bg-dc-teal` |
| `text-[#4DD9C0]` | `text-dc-teal` |
| `border-[#4DD9C0]` | `border-dc-teal` |
| `bg-[#F9A8D4]` | `bg-dc-pink` |
| `text-[#F9A8D4]` | `text-dc-pink` |
| `text-[#EC4899]` | `text-dc-pink-accent` |
| `bg-[#EC4899]` | `bg-dc-pink-accent` |
| `bg-[#F9C8E0]` | `bg-dc-pink-bg` |
| `bg-[#A8A8A0]` | `bg-dc-gray` |
| `text-[#111111]` | `text-dc-text` |
| `text-[#111]` | `text-dc-text` |
| `bg-[#111]` | `bg-dc-text` |
| `bg-[#111111]` | `bg-dc-text` |
| `text-[#555555]` | `text-dc-text-muted` |
| `text-[#555]` | `text-dc-text-muted` |
| `bg-[#FACC15]` | `bg-dc-yellow` |
| `hover:bg-[#3ec4ac]` | `hover:bg-dc-teal-hover` |

Case matters — `#4DD9C0` and `#4dd9c0` are the same color. Check both cases.

- [ ] **Step 3: Update ErrorState component to use new tokens**

If `error-state.tsx` was using fallback colors, update to `text-dc-text` and `text-dc-text-muted`.

- [ ] **Step 4: Verify zero remaining arbitrary hex**

Run: `grep -rn "bg-\[#\|text-\[#\|border-\[#\|hover:bg-\[#\|hover:text-\[#" src/ --include="*.tsx" --include="*.ts" | grep -v main.tsx`

Expected: 0 (only `main.tsx` pre-React fallback is excluded).

- [ ] **Step 5: Verify build and visual check**

Run: `npm run build`

Expected: Clean build.

Run: `npm run dev`

Visual spot-check: Donny chat bubbles (teal outbound, pink inbound), landing page HowItWorks section, ErrorBoundary fallback UI. Colors should be identical — we replaced hex values with tokens that resolve to the same hex values.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: replace 53 arbitrary hex colors with dc-* design tokens"
```

---

## Task 11: Convert Default Exports to Named Exports in Components

**Files:**
- Modify: 127 files in `src/components/` (excluding `src/components/ui/**`)
- Modify: All files that import from those 127 components

- [ ] **Step 1: Get the list of component files with default exports**

Run: `grep -rl "export default" src/components/ --include="*.tsx" --include="*.ts" | grep -v "src/components/ui/" | sort`

Expected: ~127 files.

- [ ] **Step 2: Convert files in `src/components/campaigns/` (largest batch, ~30 files)**

For each file, the change is mechanical:

```tsx
// Before:
export default function MobileTopNav() { ... }
// After:
export function MobileTopNav() { ... }

// Before (at end of file):
export default MobileTopNav;
// After: delete this line entirely

// Before (both default and named):
export function MobileTopNav() { ... }
export default MobileTopNav;
// After: just keep the named export, delete the default line
```

For each converted file, find and update all importers:

```tsx
// Before:
import MobileTopNav from '@/components/MobileTopNav';
// After:
import { MobileTopNav } from '@/components/MobileTopNav';
```

Run `npm run typecheck` after this batch to verify.

- [ ] **Step 3: Convert files in `src/components/messages/` (~12 files)**

Same pattern as Step 2. Run `npm run typecheck` after.

- [ ] **Step 4: Convert files in `src/components/files/` (~12 files)**

Same pattern. Run `npm run typecheck` after.

- [ ] **Step 5: Convert files in `src/components/reviews/` (~8 files)**

Same pattern. Run `npm run typecheck` after.

- [ ] **Step 6: Convert files in `src/components/projects/` (~8 files)**

Same pattern. Run `npm run typecheck` after.

- [ ] **Step 7: Convert remaining component files (root components, `applications/`, `notifications/`, `profiles/`, `creator-browse/`, `creator-profile/`, `creator-search/`, `promotions/`)**

Same pattern. Run `npm run typecheck` after.

- [ ] **Step 8: Verify zero default exports in components (excluding ui/)**

Run (PowerShell): `Get-ChildItem -Recurse src/components -Include *.tsx,*.ts | Where-Object { $_.FullName -notmatch 'components\\ui\\' } | Select-String 'export default' | Measure-Object | Select-Object -ExpandProperty Count`

Or (Git Bash): `grep -rl "export default" src/components/ --include="*.tsx" --include="*.ts" | grep -v "src/components/ui/" | wc -l`

Expected: 0

- [ ] **Step 9: Verify build**

Run: `npm run typecheck && npm run build`

Expected: Both pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: convert 127 component default exports to named exports"
```

---

## Task 12: Delete Unused Exports and Dead Code

**Files:**
- Delete: `src/components/DesktopGate.tsx`
- Delete: `src/hooks/useBetaFeedback.ts`
- Delete: `src/hooks/useBetaOnboarding.ts`
- Delete: `src/hooks/useBudgetStatus.ts`
- Delete: `src/hooks/useCampaignMarketplaceFilters.ts`
- Delete: `src/hooks/useDonnyDashboard.ts`
- Delete: `src/hooks/useFeatureFlags.ts`
- Delete: `src/hooks/usePageTracking.ts`
- Delete: `src/hooks/useProfileCompletion.ts`
- Delete: `src/hooks/useRequireAuth.tsx`
- Delete: `src/hooks/useUploadCampaignMedia.ts`
- Modify or delete: `src/hooks/useCampaignApplications.ts` (re-export shim)
- Modify or delete: `src/hooks/useFileOperations.ts` (re-export shim)
- Modify or delete: `src/hooks/useFileUploads.ts` (re-export shim)
- Modify: `src/pages/SiteGate.tsx` (remove utility exports)
- Create: `src/lib/siteGate.ts` (moved utilities)

- [ ] **Step 1: Safety check — grep for dynamic imports and string references**

For each file to be deleted, verify it's truly unused:

```bash
grep -rn "DesktopGate" src/ --include="*.ts" --include="*.tsx"
grep -rn "useBetaFeedback" src/ --include="*.ts" --include="*.tsx"
grep -rn "useBetaOnboarding" src/ --include="*.ts" --include="*.tsx"
grep -rn "useBudgetStatus" src/ --include="*.ts" --include="*.tsx"
grep -rn "useCampaignMarketplaceFilters" src/ --include="*.ts" --include="*.tsx"
grep -rn "useDonnyDashboard" src/ --include="*.ts" --include="*.tsx"
grep -rn "useFeatureFlags" src/ --include="*.ts" --include="*.tsx"
grep -rn "usePageTracking" src/ --include="*.ts" --include="*.tsx"
grep -rn "useProfileCompletion" src/ --include="*.ts" --include="*.tsx"
grep -rn "useRequireAuth" src/ --include="*.ts" --include="*.tsx"
```

Each should only appear in its own file definition. If any appears in an import elsewhere, do NOT delete it — investigate instead.

- [ ] **Step 2: Delete confirmed unused files**

Delete each file that passed the safety check.

- [ ] **Step 3: Fix re-export shims**

For the three re-export shim files, check what they re-export and whether importers exist:

**`src/hooks/useCampaignApplications.ts`** — re-exports from canonical files. Importers:
- `src/components/campaigns/ApplicationsList.tsx:12`
- `src/components/campaigns/CreatorApplicationsCard.tsx:6`

Update these importers to import directly from the canonical source files, then delete the shim.

**`src/hooks/useFileOperations.ts`** — re-exports. Importers:
- `src/components/files/FileCommentsPanel.tsx:8`
- `src/components/files/FilePermissionsDialog.tsx:11`
- `src/hooks/useFileUploadLogic.ts:4`

Update importers to canonical sources, then delete the shim.

**`src/hooks/useFileUploads.ts`** — re-exports. Importers:
- `src/pages/BusinessProjects.tsx:17`
- `src/pages/ProjectDetailsPage.tsx:28`

Update importers, then delete the shim.

- [ ] **Step 4: Move SiteGate utilities to `src/lib/siteGate.ts`**

Create `src/lib/siteGate.ts` with `isSiteUnlocked`, `isPublicPath`, and the constants they need (`SITE_GATE_KEY`, `SITE_PASSWORD`, `ONE_HOUR_MS`, `PUBLIC_PATH_PREFIXES`).

Update `src/pages/SiteGate.tsx` to import these from `@/lib/siteGate`.

Find all other importers of `isSiteUnlocked`/`isPublicPath` from `SiteGate.tsx` and update them to import from `@/lib/siteGate`.

- [ ] **Step 5: Remove `export` from module-only exports**

These are symbols marked `export` but only used within the same file (the audit tagged ~236 as "used in module"). `noUnusedLocals` does NOT detect these because they ARE used locally — the issue is the unnecessary `export` keyword.

To find them, use `ts-prune` (which the original audit used):

Run (Git Bash): `npx ts-prune -p tsconfig.app.json 2>/dev/null | grep "(used in module)" | head -50`

Or manually: for each hook and utility file in `src/hooks/` and `src/lib/`, check if any exported symbol is only used inside that same file. If so, remove the `export` keyword.

Focus on hooks and utility files. Skip component files (those were handled in Task 11). This is a best-effort cleanup — if `ts-prune` is unavailable or produces noise, skip to Step 6.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build`

Expected: Both pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: delete unused exports, remove re-export shims, move SiteGate utilities"
```

---

## Task 13: Remove Console Statements

**Files:**
- Modify: ~100+ files containing `console.log`, `console.debug`

- [ ] **Step 1: Count current console statements**

Run: `grep -rn "console\.\(log\|debug\)" src/ --include="*.ts" --include="*.tsx" | wc -l`

Expected: ~200 `console.log`/`console.debug` to remove.

- [ ] **Step 2: Remove `console.log` and `console.debug` statements**

Delete all `console.log(...)` and `console.debug(...)` lines. These are leftover debugging.

**Do NOT remove:**
- `console.error(...)` in catch blocks and ErrorBoundary — these are legitimate error reporting
- `console.warn(...)` that guards against unexpected states (e.g., missing env vars, invalid enum values)

**Do remove:**
- `console.warn(...)` that's clearly debugging noise (e.g., logging state values, "entering function X")

- [ ] **Step 3: Handle the QueryClient retry console.error**

In `src/App.tsx:91`, the QueryClient retry callback has:
```tsx
console.error('Query failed:', error);
```

Keep this — it's legitimate error logging for failed queries.

- [ ] **Step 4: Verify**

Run: `grep -rn "console\.log\|console\.debug" src/ --include="*.ts" --include="*.tsx" | wc -l`

Expected: 0

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove ~200 console.log/debug statements from production code"
```

---

## Task 14: Harden ESLint Config

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Update ESLint rules**

Add project-specific rules to `eslint.config.js`:

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  }
);
```

Key changes from current config:
- `@typescript-eslint/no-unused-vars`: `"off"` → `"error"`
- Added `@typescript-eslint/no-explicit-any`: `"warn"`
- Added `"no-console"`: `["warn", { allow: ["error", "warn"] }]`

- [ ] **Step 2: Run lint and fix any issues**

Run: `npm run lint`

Expected: May surface warnings for any remaining `console.warn` statements or edge-case `any` usage. Fix or add `// eslint-disable-next-line` with justification for documented exceptions.

- [ ] **Step 3: Verify full pipeline**

Run: `npm run typecheck && npm run lint && npm run build`

Expected: All three pass.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "chore: harden ESLint with no-explicit-any, no-unused-vars, no-console rules"
```

---

## Task 15: Post-Remediation Audit

**Files:** None modified — verification only.

- [ ] **Step 1: Run full verification pipeline**

```bash
npm run typecheck
npm run build
npm run lint
npm run test
```

Expected: All four pass.

- [ ] **Step 2: Run grep verification checks**

```bash
# @ts-ignore count
grep -rn "@ts-ignore" src/ --include="*.ts" --include="*.tsx" | wc -l
# Expected: 0

# any usage count
grep -rn ": any\b\|as any\b\|<any>" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
# Expected: 0 (or documented exceptions)

# console.log count
grep -rn "console\.log\|console\.debug" src/ --include="*.ts" --include="*.tsx" | wc -l
# Expected: 0

# Arbitrary hex in Tailwind
grep -rn "bg-\[#\|text-\[#\|border-\[#" src/ --include="*.tsx" --include="*.ts" | grep -v main.tsx | wc -l
# Expected: 0

# Default exports in components (excluding ui/)
grep -rl "export default" src/components/ --include="*.tsx" --include="*.ts" | grep -v "src/components/ui/" | wc -l
# Expected: 0

# .select("*")
grep -rn '\.select("\*")' src/ --include="*.ts" --include="*.tsx" | wc -l
# Expected: 0
```

- [ ] **Step 3: Visual spot-check**

Run: `npm run dev`

Check these pages in the browser:
- Landing page — HowItWorks section colors correct
- Donny chat — teal outbound bubbles, pink inbound bubbles
- Business dashboard — loads without error, stats display
- Messaging — conversation list loads
- Creator browse — grid renders

All colors should render identically to before the remediation.

- [ ] **Step 4: Commit verification results (optional)**

If all checks pass, the remediation is complete. No commit needed for verification.
