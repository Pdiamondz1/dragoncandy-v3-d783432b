# Handoff: Code Architecture Audit Remediation (Tasks 5-15)

## Session Metadata
- Created: 2026-05-04 23:21:58
- Project: C:\GIT\dragoncandy-v3-d783432b
- Branch: main
- Session duration: ~2 hours

### Recent Commits (for context)
  - 971c249 fix: regenerate Supabase types and remove all @ts-ignore
  - adc5ead fix: resolve 34 real type errors surfaced by strict mode
  - 4f2da82 fix: remove ~158 unused imports and variables (strict mode cleanup)
  - 43d45f4 chore: enable TypeScript strict mode and add typecheck script
  - bdf352e docs: add code architecture audit remediation implementation plan

## Handoff Chain

- **Continues from**: None (fresh start)
- **Supersedes**: None

## Current State Summary

We are executing a 15-task implementation plan to fix all 12 issues from a code architecture audit (`docs/code-architecture-audit.docx`). The plan is at `docs/superpowers/plans/2026-05-04-code-architecture-audit-remediation.md` and the design spec is at `docs/superpowers/specs/2026-05-04-code-architecture-audit-remediation-design.md`. Tasks 1-4 are complete (TypeScript strict mode enabled, 158 unused imports removed, 34 real type errors fixed, Supabase types regenerated and all 7 @ts-ignore removed). Task 5 (replace `any` with real types) is the current task -- there are 204 `any` usages across the codebase that need to be replaced with proper types. Tasks 6-15 remain pending.

## Codebase Understanding

### Architecture Overview

DragonCandy is a React/TypeScript/Supabase/Tailwind marketplace connecting restaurants with content creators. The codebase has 63 pages, 140+ hooks, and 42 edge functions. TypeScript strict mode is now fully enabled with zero type errors. The project uses React Query for data fetching, Supabase for backend, and shadcn/ui for components.

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `docs/superpowers/plans/2026-05-04-code-architecture-audit-remediation.md` | Implementation plan with 15 tasks | THE PLAN -- follow it task by task |
| `docs/superpowers/specs/2026-05-04-code-architecture-audit-remediation-design.md` | Design spec with rationale | Reference for "why" behind each change |
| `tsconfig.app.json` | TypeScript config | Already set to `strict: true` |
| `eslint.config.js` | ESLint config | Task 14 will add new rules here |
| `tailwind.config.ts` | Tailwind config with dc-* tokens | Task 9 adds new tokens here |
| `src/integrations/supabase/types.ts` | Generated Supabase types | Already regenerated with campaign_media/campaign_deliverables |
| `src/App.tsx` | Root app component with QueryClient and ErrorBoundary | Task 8 modifies QueryClient config |

### Key Patterns Discovered

- Supabase `any` types come from untyped query results -- fix by using `Database['public']['Tables']['x']['Row']` from generated types
- `catch (e: any)` should become `catch (e: unknown)` with `e instanceof Error` narrowing
- Many hooks have bare `.select()` calls after mutations that should specify columns
- 127 component files use `export default` instead of named exports (CLAUDE.md requires named for components)
- `src/components/ui/**` files (shadcn) are exempted from the export convention change

## Work Completed

### Tasks Finished

- [x] Task 1: Enable TypeScript strict mode (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, added `typecheck` script)
- [x] Task 2: Remove ~158 unused imports and variables (TS6133/TS6196/TS6192 errors)
- [x] Task 3: Fix 34 real type errors (TS2322/TS2345/TS18047/TS18048/TS7006/TS2339/TS4114)
- [x] Task 4: Regenerate Supabase types and remove all 7 @ts-ignore comments

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Enable strict mode all-at-once | All-at-once vs. defer to separate branch | 149 of 200 errors were trivial unused imports; overlap with other fix files made splitting counterproductive |
| Add `override` to ErrorBoundary methods | Add override vs. suppress error | `noImplicitOverride: true` is part of strict -- proper OOP practice |
| Use `?? 0` / `?? ''` for null/undefined fixes | Optional chaining vs. nullish coalescing vs. type assertion | Nullish coalescing provides safe defaults without changing logic |
| Skip `exactOptionalPropertyTypes` | Enable now vs. defer | Would surface 50+ additional errors; defer to post-launch |
| `throwOnError: true` for QueryClient (Task 8, upcoming) | Per-page error handling vs. global throwOnError | Root ErrorBoundary in App.tsx catches everything, so no route can white-screen |

## Pending Work

### Immediate Next Steps

1. **Task 5: Replace `any` with real types** -- 204 occurrences across the codebase. Priority files: `useNotifications.ts` (10), `useProjectCompletion.ts` (7), `ToastConnectionCard.tsx` (7), `useDonny.ts` (6), `useCampaignWizard.ts` (6). Strategy: Supabase Row types for DB results, `React.ChangeEvent` for handlers, `unknown` + narrowing for catch blocks. See plan Task 5 for full details.
2. **Task 6: Fix Supabase .select() conventions** -- Replace `.select("*")` in HelpArticlePage.tsx and 27 bare `.select()` calls with explicit column lists.
3. **Task 7-8: Error handling** -- Create ErrorState component, wire ReviewsErrorBoundary, add `throwOnError: true` to QueryClient, add error states to 5 critical pages.
4. **Tasks 9-10: Tailwind tokens** -- Add `dc-text`, `dc-text-muted`, `dc-teal-hover` tokens, then replace ~53 arbitrary hex colors with tokens.
5. **Tasks 11-12: Export conventions + dead code** -- Convert 127 default exports to named, delete ~14 unused files/hooks, fix re-export shims.
6. **Tasks 13-14: Console cleanup + ESLint** -- Remove ~200 console.log/debug statements, harden ESLint rules.
7. **Task 15: Post-remediation audit** -- Verify all grep counts at zero, build/typecheck/lint/test all pass.

### Blockers/Open Questions

- None currently. All tasks are unblocked.

### Deferred Items

- `exactOptionalPropertyTypes` in tsconfig (50+ additional errors, defer to post-launch)
- `eslint-plugin-import` for `import/no-default-export` rule (new dependency, convention enforced by refactor instead)
- Custom logger abstraction (premature without observability pipeline)
- Granular ErrorBoundary wrappers per page (defer to post-launch when crash telemetry exists)

## Context for Resuming Agent

### Important Context

- **Execution method**: We are using the `superpowers:subagent-driven-development` skill. Dispatch a fresh subagent per task, with two-stage review (spec compliance then code quality) after each. For mechanical tasks (unused imports, console removal), spec/quality review can be skipped.
- **Plan file is authoritative**: Follow `docs/superpowers/plans/2026-05-04-code-architecture-audit-remediation.md` task by task. Each task has exact file paths, fix patterns, verification commands, and commit messages.
- **Current state**: `npm run typecheck` passes with 0 errors. `npm run build` succeeds. All 674 tests pass. There are 0 `@ts-ignore` in the codebase.
- **`any` count to fix**: Run `grep -rn ": any\b\|as any\b\|<any>" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l` -- currently 204.
- **Platform**: Windows 11, PowerShell primary, Git Bash available via the Bash tool. Plan commands use Git Bash syntax.
- **CLAUDE.md rules**: One change per prompt, `npm run build` verification between phases, never drop/rename tables, always use RLS-safe queries, Tailwind only (no custom CSS), named exports for components / default exports for pages.

### Assumptions Made

- The Supabase project ID `zocahiffooqdybdhguqv` is correct and accessible for type generation
- `src/components/ui/**` files (shadcn) are exempt from export convention changes
- The root `<ErrorBoundary>` in App.tsx wraps all routes (verified)
- `main.tsx` pre-React fallback hex colors are exempt from Tailwind token replacement (Tailwind not loaded at that point)

### Potential Gotchas

- Task 6 modifies `useUploadCampaignMedia.ts` which Task 12 later deletes -- that's fine, the fix goes with the file
- Task 7 creates ErrorState with `text-gray-900`/`text-gray-500` fallbacks; Task 10 updates them to `dc-text`/`dc-text-muted` after tokens are added in Task 9
- Task 11 (127 export conversions) is broken into sub-batches by directory (campaigns, messages, files, reviews, projects, then remaining) with `npm run typecheck` between each batch
- Task 12 Step 5 (remove module-only exports) uses `ts-prune` for detection, NOT `noUnusedLocals` -- if `ts-prune` is unavailable, this step is best-effort
- The Supabase CLI plugin may inject an XML tag at the end of generated types.ts -- strip it before typecheck

## Environment State

### Tools/Services Used

- Node.js / npm (Vite build system)
- TypeScript compiler (`npm run typecheck`)
- Supabase CLI v2.98.1 (via npx, for type generation)
- ESLint (`npm run lint`)
- Vitest (`npm run test`)

### Active Processes

- None running. Dev server is not started.

### Environment Variables

- `VITE_SUPABASE_URL` -- Supabase project URL
- `VITE_SUPABASE_ANON_KEY` -- Supabase anonymous key
- `VITE_STRIPE_PUBLISHABLE_KEY` -- Stripe test mode key

## Related Resources

- Plan: `docs/superpowers/plans/2026-05-04-code-architecture-audit-remediation.md`
- Spec: `docs/superpowers/specs/2026-05-04-code-architecture-audit-remediation-design.md`
- Source audit: `docs/code-architecture-audit.docx`
- Project context: `docs/PROJECT_CONTEXT.md`
- Design system / coding conventions: `CLAUDE.md`
