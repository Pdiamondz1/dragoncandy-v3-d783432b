---
title: Error Handling Patterns
type: concept
created: 2026-05-23
updated: 2026-05-24
sources: [.claude/handoffs/2026-05-04-232158-code-architecture-audit-remediation.md]
tags: [error-handling, error-boundary, patterns]
---

# Error Handling Patterns

Error handling architecture established during the code architecture
audit remediation.

## ErrorBoundary Levels

Three levels: `'page'` (default), `'section'`, `'widget'`.
Pass `fallback={null}` for silent widget errors.

## QueryClient Configuration

`throwOnError: true` on the root QueryClient so unhandled query errors
bubble up to the nearest ErrorBoundary. No route can white-screen because
the root ErrorBoundary in App.tsx catches everything.

## Async Error Handling

- All Supabase queries must have error handling
- All mutations must handle loading and error states in UI
- `catch (e: unknown)` with `instanceof Error` narrowing (see
  [[TypeScript Patterns]])

## See Also

- [[TypeScript Patterns]]
- [[Supabase]]
- [[DragonCandy Platform]]
- [[Realtime Edge Cases Session]]
