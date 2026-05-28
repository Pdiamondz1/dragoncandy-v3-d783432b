# App Freshness & Session Enforcement

> Ensures users always see the latest deployed code and that inactive sessions
> are reliably terminated after 3 hours.

## Problem

Two related issues with a shared root cause — nothing forces the app to refresh itself:

1. **Stale app code after deploys.** Users who leave the app open in a tab
   continue running old JavaScript bundles indefinitely. Vite content-hashes
   JS bundles and `index.html` is served with `must-revalidate`, but there's
   no mechanism to tell an already-loaded app that new code is available.

2. **Inactivity timeout not firing.** The current `useInactivityTimeout` hook
   uses `setTimeout` with a 165-minute delay. Browsers throttle and suspend
   `setTimeout` in background tabs — a user who switches to another tab for
   8 hours may never see the timeout fire. Meanwhile, Supabase's
   `autoRefreshToken` silently keeps the JWT alive on the server side.

## Solution Overview

Two lightweight mechanisms that share a `visibilitychange` listener pattern:

- **Timestamp-based inactivity timeout** — replaces the fragile `setTimeout`
  approach with a `lastActivity` timestamp checked on an interval and on tab
  visibility change.
- **Build hash version polling** — a `version.json` file generated at build
  time, polled every 5 minutes by the running app, with a soft update prompt.

## Design

### 1. Inactivity Timeout (rewrite of `useInactivityTimeout`)

**Current state:** `src/hooks/useInactivityTimeout.ts` sets a single
`setTimeout` for 165 minutes. Activity events (`mousedown`, `keydown`,
`touchstart`, `scroll`) clear and restart the timer. This is unreliable
because browsers suspend long timeouts in background tabs.

**New behavior:**

- On every user interaction (same four event types), write `Date.now()` to
  a ref AND to `localStorage` key `dc_last_activity`. The localStorage write
  survives tab crashes and makes the timestamp available across tabs.
- A `setInterval` runs every 60 seconds. It compares `Date.now()` against
  `dc_last_activity`. If elapsed > 165 minutes, show the warning dialog. If
  elapsed > 180 minutes, trigger logout.
- A `visibilitychange` listener runs the same check immediately when the tab
  becomes visible. This is the critical fix — when a user returns to a
  backgrounded tab after hours, the check fires instantly regardless of
  whether the interval was suspended.
- The warning dialog and "I'm still here" button work identically to today.
  Clicking the button resets `dc_last_activity` to `Date.now()`.
- Activity event listeners MUST check the warning state before writing to
  `dc_last_activity`. During the warning phase, only the "I'm still here"
  button writes to `dc_last_activity` and resets the timer. Mouse movement,
  keystrokes, and scrolling while the warning is showing are ignored — same
  as current behavior, but explicitly: don't write to localStorage either.
- On logout, `dc_last_activity` is cleaned up alongside existing auth keys
  in `src/lib/authCleanup.ts`.

**Multi-tab behavior:** Activity in any tab resets the inactivity timer for
all tabs via the shared `dc_last_activity` localStorage key. This is
intentional — if a user is active anywhere in DragonCandy, no tab should
log them out. The shared timestamp inherently provides cross-tab
synchronization of activity state.

**Constants (unchanged):**
- Warning threshold: 165 minutes (2 hours 45 minutes)
- Logout after warning: 15 minutes
- Total inactivity before logout: 180 minutes (3 hours)
- Check interval: 60 seconds

**No hard maximum session duration.** Active users stay logged in
indefinitely. Only inactivity triggers logout.

### 2. Build Hash Version Detection

**Build step — Vite plugin:**

A small inline plugin in `vite.config.ts` runs during the `closeBundle` hook
(production builds only). It writes `dist/version.json`:

```json
{
  "hash": "<8-char hex from crypto.randomUUID or Date.now()>",
  "built": "2026-05-28T14:30:00.000Z"
}
```

The hash changes on every build. No git dependency required (avoids CI
environments where `.git` may not be available).

**Cache headers:**

Add to `public/_headers`:
```
/version.json
  Cache-Control: no-cache, must-revalidate
```

This ensures CDN/browser always fetches fresh `version.json`.

**Runtime hook — `useAppVersion`:**

New file: `src/hooks/useAppVersion.ts`

- On mount, fetches `/version.json?_t=<timestamp>` (cache-bust query param).
  Stores the hash as `initialHash`.
- Sets a `setInterval` to re-fetch every 5 minutes (300,000 ms).
- On each fetch, compares response hash against `initialHash`. If different,
  sets `updateAvailable = true`.
- Listens for `visibilitychange`: pauses polling when tab is hidden (no
  wasted requests), does an immediate check when tab becomes visible.
- Uses raw `fetch`, not React Query. This avoids the app's `staleTime` and
  `refetchOnWindowFocus: false` settings.
- If the fetch fails (network error, 404 during deploy), silently retries
  on the next interval. No error UI — a failed version check is not
  user-actionable.
- Only runs in production mode (`import.meta.env.PROD`). In dev mode, the
  hook returns `{ updateAvailable: false }` immediately — no polling, no
  fetches. To test the feature locally, run `npm run build` and
  `npm run preview`.
- Exports: `{ updateAvailable: boolean }`.

### 3. Update Available UI

**Component — `UpdateBanner`:**

New file: `src/components/UpdateBanner.tsx`

- Non-blocking banner rendered at the top of the main content area, above
  `AnimatedRoutes` inside `AppShell`. Does not shift layout — overlays with
  a slight drop shadow.
- Teal background (`bg-dc-teal`), white text, pill-shaped "Refresh" button.
- Message: "A new version of DragonCandy is available."
- Dismissible via X button. Reappears on the next route navigation.
- Clicking "Refresh" triggers `window.location.reload()`.

**Force-reload on navigation:**

When `updateAvailable` is true and the user navigates to a new route, a
`useBlocker` hook (inside a component that is a descendant of
`<BrowserRouter>` — placed in `AppShell`) intercepts the navigation. The
blocker reads the target pathname and search from the blocked transition
object, then performs `window.location.href = transition.location.pathname +
transition.location.search` — a full page reload to the target URL. The
blocker never calls `proceed()` (no client-side navigation). The reload
fetches fresh `index.html` (which has `max-age=0, must-revalidate`) and
loads new content-hashed JS bundles.

Dismissing the banner via the X button hides the visual banner but does NOT
prevent the force-reload on navigation. The X button is cosmetic — once
`updateAvailable` is true, any navigation triggers a full reload regardless
of whether the banner is visible.

This is the most seamless forced-update path — it happens at a natural break
point where the user was already expecting a page transition.

### 4. Integration & Provider Placement

**`useAppVersion`** runs inside `AuthenticatedShell` in `src/App.tsx`,
alongside the existing `useInactivityTimeout`. Only authenticated users get
version polling — unauthenticated users get fresh code on next page load.

**Data flow via context:** `AuthenticatedShell` receives `AppShell` as
opaque `children`, so props cannot be injected. A small `AppVersionContext`
solves this:

- New file: `src/contexts/AppVersionContext.tsx` — exports
  `AppVersionProvider` and `useAppVersionContext`.
- `AuthenticatedShell` wraps its `children` in `<AppVersionProvider>`.
  The provider calls `useAppVersion` internally and provides
  `{ updateAvailable }` to consumers.
- `UpdateBanner` (inside `AppShell`) calls `useAppVersionContext()` to
  read `updateAvailable`.
- The `useBlocker` for force-reload on navigation also lives inside
  `AppShell` and reads from the same context.

**`UpdateBanner`** renders inside `AppShell`, positioned above
`AnimatedRoutes`.

**React Query:** Version polling deliberately avoids React Query to prevent
interaction with the app's global query settings.

**Error handling:** Version fetch failures are silent. Inactivity check
failures (corrupted localStorage) fall back to treating the user as active
(fail-open, not fail-closed — we don't want to accidentally log out an
active user).

## Files Touched

| File | Change |
|------|--------|
| `src/hooks/useInactivityTimeout.ts` | Rewrite: `setTimeout` → timestamp + `setInterval` + `visibilitychange` |
| `src/hooks/useAppVersion.ts` | New: build hash polling hook |
| `src/contexts/AppVersionContext.tsx` | New: context provider bridging `AuthenticatedShell` → `AppShell` |
| `src/components/UpdateBanner.tsx` | New: update available banner UI + `useBlocker` for force-reload |
| `src/App.tsx` | Wrap `AuthenticatedShell` children in `AppVersionProvider`, add `UpdateBanner` to `AppShell` |
| `src/lib/authCleanup.ts` | Add `dc_last_activity` to cleanup list |
| `vite.config.ts` | Add inline plugin to generate `version.json` on production build |
| `public/_headers` | Add `version.json` cache rule |

## What This Doesn't Do

- No service worker, PWA offline support, or push notifications.
- No server-side session expiry changes (Supabase JWT config unchanged).
- No hard maximum session duration for active users.
- Multi-tab activity is intentionally shared via `dc_last_activity` in
  localStorage — activity in any tab keeps all tabs alive. This is a
  feature, not a limitation.

## Testing

- **Inactivity timeout:** Manually set `dc_last_activity` to a timestamp
  >165 minutes ago, then trigger `visibilitychange` or wait for the
  60-second interval. Warning dialog should appear. Set to >180 minutes —
  logout should trigger.
- **Version detection:** Build the app, note the hash in `version.json`.
  Modify `version.json` manually to have a different hash. Within 5 minutes
  (or on tab focus), the update banner should appear.
- **Force-reload on navigation:** With the update banner showing, click a
  nav link. The page should do a full reload instead of a client-side
  route change.
- **Background tab behavior:** Open the app, switch to another tab for
  several minutes, return. The inactivity check and version check should
  both fire immediately on return.

## Risk

Low. Both mechanisms are additive — they don't modify auth logic, Supabase
session config, or existing route guards. The inactivity timeout rewrite
preserves the same thresholds and UX (warning dialog + confirm button).
The version polling is read-only and fails silently.
