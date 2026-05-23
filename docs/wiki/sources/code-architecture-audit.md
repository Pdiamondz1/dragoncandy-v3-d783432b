---
title: Code Architecture Audit Remediation
type: source
created: 2026-05-23
updated: 2026-05-23
sources: [.claude/handoffs/2026-05-04-232158-code-architecture-audit-remediation.md]
tags: [architecture, typescript, audit, strict-mode]
---

# Code Architecture Audit Remediation

Session handoff from a 15-task remediation of a code architecture audit.
Covered TypeScript strict mode, type safety, Supabase conventions, error
handling, Tailwind tokens, and export conventions.

## Key Claims

- TypeScript strict mode enabled all-at-once (149 of 200 errors were
  trivial unused imports)
- 158 unused imports/variables removed, 34 real type errors fixed
- All 7 @ts-ignore comments removed after regenerating Supabase types
- 204 `any` usages identified for replacement with proper types
- Supabase `any` types fixed via `Database['public']['Tables']['x']['Row']`
- `catch (e: any)` pattern replaced with `catch (e: unknown)` + narrowing
- 127 component files used `export default` instead of named exports
- ~200 console.log/debug statements needed cleanup
- shadcn/ui components (`src/components/ui/**`) exempted from export
  convention changes

## Key Decisions

- Enable strict mode all-at-once rather than deferring to separate branch
- Skip `exactOptionalPropertyTypes` (would surface 50+ additional errors)
- Use `throwOnError: true` for QueryClient with root ErrorBoundary catch-all
- Use nullish coalescing (`?? 0`) over type assertions for null/undefined

## See Also

- [[TypeScript Patterns]]
- [[Supabase]]
- [[Error Handling Patterns]]
