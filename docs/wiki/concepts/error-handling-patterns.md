---
title: Error Handling Patterns
type: concept
created: 2026-05-23
updated: 2026-06-26
sources: [.claude/handoffs/2026-05-04-232158-code-architecture-audit-remediation.md, raw/sessions/2026-06-26-internal-only-user-fks.md]
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

## Backend: non-Error throws (edge functions)

`instanceof Error` narrowing has a sharp edge on the backend: a Supabase
**`PostgrestError` is a plain object, not an `Error` instance.** A catch-all that
does `err instanceof Error ? err.message : "internal error"` therefore collapses
every DB error (and any other plain-object throw) to a meaningless `"internal
error"` — erasing the real cause from both the response and the logs. This hid a
foreign-key violation in `google-workspace-proxy` for weeks (see
[[Internal-Only AIOS Users]]). Normalize non-`Error` throws instead: pull
`message`+`code` off the object and log the full value (PR #180's pure
`describeError` helper is the reference).

## See Also

- [[Internal-Only AIOS Users]] (the PostgrestError-is-not-an-Error incident)
- [[TypeScript Patterns]]
- [[Supabase]]
- [[DragonCandy Platform]]
- [[Realtime Edge Cases Session]]
