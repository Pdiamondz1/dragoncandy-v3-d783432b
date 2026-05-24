# Auth Loading Guard & Global Session Timeout

> **Date**: 2026-05-20
> **Status**: Draft
> **Scope**: Fix landing page flash on auth resolution; enforce 3-hour global inactivity timeout

## Context

Two auth UX issues affect all three user roles (Restaurant, Creator, Brand):

1. **Landing page flash**: When an authenticated user refreshes the browser, logs in, or logs out, the landing page content briefly appears before the correct page loads. A cookie-based session hint check exists in `LandingPage.tsx:26-35` but fails because Supabase stores sessions in localStorage, not cookies.

2. **Indefinite sessions**: The existing inactivity timeout (45 min warning + 15 min logout = 1 hour) only runs inside `DashboardLayout`. Users on messaging, profile, campaign detail, or any non-dashboard page are never timed out. Supabase's refresh token keeps the session alive indefinitely server-side.

## Design

### Part 1: App-Level Auth Loading Guard

**Goal**: Prevent any page content from rendering while Supabase auth state is resolving for returning users.

**Approach**: Add a loading guard in `AppLayout` that intercepts rendering on landing-page routes while Supabase auth state resolves.

**Scope constraint**: The splash only renders on landing-page routes (`/`, `/home`, `/landing`) — the routes where an authenticated user would otherwise see landing content before being redirected. Other public routes (`/auth`, `/help`, `/pricing`) render immediately because they don't redirect authenticated users. Protected routes already show their own loading spinners via `ProtectedRoute`, `BusinessRoute`, etc.

#### Changes

**`src/App.tsx` — `AppLayout` function**

Add a localStorage-based session hint check. When auth is loading, a Supabase session key exists in localStorage, AND the user is on a landing-page route, render a branded splash screen (DragonCandy logo + spinner on white background) instead of `<AppShell />`.

```tsx
function hasSessionHint(): boolean {
  try {
    return Object.keys(localStorage).some(key => key.startsWith('sb-'));
  } catch {
    return false;
  }
}

function AppLayout() {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const isPublic = PUBLIC_PATHS.has(pathname);

  // Branded splash on landing routes while auth resolves for returning users.
  // Only on PUBLIC_PATHS (/, /home, /landing) — other routes like /auth, /help
  // render immediately since they don't redirect authenticated users.
  if (loading && isPublic && hasSessionHint()) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <img src="/logo.webp" alt="DragonCandy" className="h-16 w-auto mb-6" />
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (isPublic) return <AppShell />;
  return (
    <DonnyProviderWithAuth>
      <AppShell />
    </DonnyProviderWithAuth>
  );
}
```

**`src/pages/LandingPage.tsx` — Remove redundant session hint check**

Delete the cookie-based `hasSessionHint` check (lines 26-35). The `useEffect` redirect on lines 19-23 stays — it handles the post-resolution redirect for authenticated users.

Before:
```tsx
const hasSessionHint = typeof document !== 'undefined' &&
  document.cookie.includes('sb-');
if (loading && hasSessionHint) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <img src="/logo.webp" alt="DragonCandy" className="h-16 w-auto mb-6" />
      <Spinner className="h-10 w-10 border-teal-400" />
    </div>
  );
}
```

After: Removed entirely. The app-level guard in `AppLayout` handles this case.

### Part 2: Global 3-Hour Inactivity Timeout

**Goal**: Log out any user inactive for 3 hours, regardless of which authenticated page they are on. Enforce server-side.

#### Changes

**`src/hooks/useInactivityTimeout.ts` — Update timing constants**

```ts
// Before
const IDLE_WARNING_MS = 45 * 60 * 1000;    // 45 minutes
const IDLE_LOGOUT_MS = 15 * 60 * 1000;     // 15 minutes

// After
const IDLE_WARNING_MS = 165 * 60 * 1000;   // 2 hours 45 minutes
const IDLE_LOGOUT_MS = 15 * 60 * 1000;     // 15 minutes (unchanged)
// Total: 3 hours before auto-logout
```

**`src/App.tsx` — Create `AuthenticatedShell` component**

Wrap non-public routes in a new component that runs the inactivity timeout hook globally across all authenticated pages. The component checks `isAuthenticated` so the timer only runs when a user is actually logged in — this prevents the hook from firing on routes like `/auth` that happen to fall outside `PUBLIC_PATHS`.

```tsx
function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const logout = useLogout();
  const { showWarning, confirmActive } = useInactivityTimeout(
    logout,
    isAuthenticated,
  );

  return (
    <>
      {children}
      <InactivityWarningDialog
        open={showWarning}
        onConfirm={confirmActive}
      />
    </>
  );
}
```

**`src/hooks/useInactivityTimeout.ts` — Add `enabled` parameter**

Add a second parameter `enabled: boolean` to the hook. When `false`, timers are cleared and no activity listeners are attached. This prevents the timeout from running on pages where the user isn't authenticated.

```ts
export function useInactivityTimeout(onLogout: () => void, enabled = true) {
  // ... existing logic, but guard timer start and event listeners with `enabled`
}
```

Update `AppLayout` to use `AuthenticatedShell`:

```tsx
function AppLayout() {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (loading && isPublic && hasSessionHint()) {
    return <AuthLoadingSplash />;
  }

  if (isPublic) return <AppShell />;

  return (
    <DonnyProviderWithAuth>
      <AuthenticatedShell>
        <AppShell />
      </AuthenticatedShell>
    </DonnyProviderWithAuth>
  );
}
```

**`src/components/DashboardLayout.tsx` — Remove inactivity timeout**

Remove the `useInactivityTimeout` hook call and `InactivityWarningDialog` render from `DashboardLayout`. These are now handled globally by `AuthenticatedShell`.

**Server-side session invalidation** — Already handled. `AuthContext.signOut()` already calls `supabase.auth.signOut({ scope: 'global' })`, so the refresh token is revoked server-side on every logout. No changes needed.

#### Cross-Tab Behavior

Each browser tab runs its own inactivity timer. When Tab B goes idle and triggers logout:
1. `signOut({ scope: 'global' })` clears localStorage and revokes server session
2. Tab A detects session loss via `onAuthStateChange` and redirects to `/auth`
3. No additional code needed — this is already handled by the existing auth listener

## Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Add `hasSessionHint()`, `AuthenticatedShell`, update `AppLayout` |
| `src/pages/LandingPage.tsx` | Remove cookie-based session hint check |
| `src/hooks/useInactivityTimeout.ts` | Update `IDLE_WARNING_MS` from 45 min to 165 min; add `enabled` parameter |
| `src/components/DashboardLayout.tsx` | Remove `useInactivityTimeout` hook and `InactivityWarningDialog` |

## What This Deletes
- Broken cookie-based session hint check in `LandingPage.tsx`
- Per-layout inactivity timeout wiring in `DashboardLayout.tsx`

## What This Simplifies
- One auth loading guard at the app level instead of per-page checks
- One inactivity timeout location instead of per-layout

## Verification Plan

1. **Landing page flash** — Log in as each role, refresh the browser on various pages (dashboard, messaging, campaign detail). Confirm: no landing page content flashes; branded splash screen (logo + spinner) appears briefly during auth resolution.
2. **Session timeout** — Log in, remain idle. Confirm warning dialog appears after 2h 45m (use reduced timing for dev testing). Confirm auto-logout after 15 more minutes. Verify server-side session is invalidated (attempt to use the refresh token via API — should fail).
3. **Cross-tab** — Open two tabs logged in. Let one go idle to timeout. Confirm the other tab also redirects to auth.
4. **Public pages** — Visit landing page, help center, pricing while logged out. Confirm no splash screen appears (no session hint in localStorage).
5. **Desktop & Mobile** — Test all scenarios above on both viewport sizes. The loading splash is a simple centered layout — works on all sizes without responsive-specific classes.
6. **Console errors** — Open Chrome DevTools on production after deploy. Confirm no new console errors or warnings.
