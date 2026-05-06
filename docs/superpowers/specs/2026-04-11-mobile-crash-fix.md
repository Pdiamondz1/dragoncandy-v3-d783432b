# Mobile Crash Fix — DonnyDock + PerformanceMonitor Isolation

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Fix crash-on-every-page on mobile Safari caused by unprotected app-shell components

---

## Problem

After TASK-026 (`b40f52d` — mount DonnyDock in root layout), the entire app crashes on mobile Safari. Users see the top-level ErrorBoundary fallback ("Something went wrong") on every page, making DragonCandy unusable on phones.

**Root cause:** `DonnyDock` is mounted at the app level (line 490 of `App.tsx`) outside any route. It always renders `DonnyChatSheet`, which initializes `useDonny()` — a hook that runs Supabase queries against `donny_conversations` and `donny_messages`, sets up Realtime subscriptions, and defines mutations. Any failure in this initialization chain (query error, RLS issue, network timing on mobile) crashes the entire app because there's no ErrorBoundary between `DonnyDock` and the top-level one.

A second fragile component, `PerformanceMonitor` (line 96), calls `new PerformanceObserver()` without try-catch, which can throw on browsers that don't support the `'measure'` entry type.

## Solution

Three targeted changes, no new files, no new dependencies.

### 1. Wrap DonnyDock and PerformanceMonitor in widget-level ErrorBoundaries

In `App.tsx`, wrap both components with `<ErrorBoundary level="widget" fallback={null}>`. This means:
- If DonnyDock crashes, only the floating chat button disappears — the rest of the app works
- If PerformanceMonitor crashes, monitoring silently stops — no user impact
- The existing `ErrorBoundary` component already supports `level="widget"` and custom `fallback`

### 2. Lazy-mount DonnyChatSheet in DonnyDock

In `DonnyDock.tsx`, conditionally render `DonnyChatSheet` only when `chatOpen` is true:

```tsx
{chatOpen && (
  <DonnyChatSheet open={chatOpen} onOpenChange={setChatOpen} initialMessage={initialMessage} />
)}
```

This prevents `useDonny()` from initializing (Supabase queries, Realtime subscription, mutation setup) until the user actually taps the Donny button. Benefits:
- Eliminates the crash vector — queries don't run on mount
- Reduces network requests on every page load
- Reduces memory usage on mobile

### 3. Guard PerformanceObserver with try-catch

In `PerformanceMonitor.tsx`, wrap the `new PerformanceObserver()` and `observer.observe()` calls in a try-catch. If the browser doesn't support it, silently skip monitoring. Update the cleanup function to handle the observer being null.

## Files Changed

| File | Change |
|---|---|
| `src/App.tsx` | Wrap `<DonnyDock />` and `<PerformanceMonitor />` in `<ErrorBoundary level="widget" fallback={null}>` |
| `src/components/DonnyDock.tsx` | Conditionally render `DonnyChatSheet` only when `chatOpen` is true |
| `src/components/analytics/PerformanceMonitor.tsx` | Wrap `PerformanceObserver` creation in try-catch |

## Out of Scope

- Fixing why `useDonny()` queries fail on mobile (separate investigation once crash is resolved)
- Adding mobile-specific error reporting
- Refactoring ErrorBoundary component
