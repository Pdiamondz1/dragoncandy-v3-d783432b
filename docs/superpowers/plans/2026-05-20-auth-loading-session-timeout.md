# Auth Loading Guard & Global Session Timeout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the landing page flash during auth resolution and enforce a 3-hour global inactivity timeout across all authenticated pages.

**Architecture:** Two surgical changes to the auth/session layer. Part 1 adds a localStorage-based session hint check in `AppLayout` to show a branded splash instead of landing page content while Supabase auth state resolves. Part 2 updates the existing `useInactivityTimeout` hook from 45 min to 2h 45m, adds an `enabled` parameter, moves the hook from `DashboardLayout` to a new `AuthenticatedShell` wrapper in `App.tsx`, and removes the duplicate wiring from `DashboardLayout`.

**Tech Stack:** React 18, TypeScript, Supabase Auth, Tailwind CSS, shadcn/ui AlertDialog

**Spec:** `docs/superpowers/specs/2026-05-20-auth-loading-session-timeout-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/useInactivityTimeout.ts` | Modify | Update timing, add `enabled` parameter |
| `src/App.tsx` | Modify | Add `hasSessionHint()`, `AuthenticatedShell`, update `AppLayout` |
| `src/pages/LandingPage.tsx` | Modify | Remove broken cookie-based session hint check |
| `src/components/DashboardLayout.tsx` | Modify | Remove inactivity timeout hook + dialog |

---

### Task 1: Update `useInactivityTimeout` hook — timing and `enabled` parameter

**Files:**
- Modify: `src/hooks/useInactivityTimeout.ts`

- [ ] **Step 1: Update timing constants**

In `src/hooks/useInactivityTimeout.ts`, change the `IDLE_WARNING_MS` constant from 45 minutes to 165 minutes (2 hours 45 minutes). `IDLE_LOGOUT_MS` stays at 15 minutes. Total: 3 hours.

```ts
const IDLE_WARNING_MS = 165 * 60 * 1000;
const IDLE_LOGOUT_MS = 15 * 60 * 1000;
```

- [ ] **Step 2: Add `enabled` parameter to the hook**

Add a second parameter `enabled` (default `true`). When `false`, the hook clears all timers and removes event listeners. When `true`, normal behavior. The full updated file:

```ts
import { useEffect, useRef, useState, useCallback } from 'react';

const IDLE_WARNING_MS = 165 * 60 * 1000;
const IDLE_LOGOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

export function useInactivityTimeout(onLogout: () => void, enabled = true) {
  const [showWarning, setShowWarning] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
  }, []);

  const startLogoutCountdown = useCallback(() => {
    setShowWarning(true);
    logoutTimer.current = setTimeout(() => {
      setShowWarning(false);
      onLogout();
    }, IDLE_LOGOUT_MS);
  }, [onLogout]);

  const resetIdleTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    idleTimer.current = setTimeout(startLogoutCountdown, IDLE_WARNING_MS);
  }, [clearTimers, startLogoutCountdown]);

  const confirmActive = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setShowWarning(false);
      return;
    }

    resetIdleTimer();

    const onActivity = () => {
      if (!showWarning) resetIdleTimer();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [enabled, showWarning, resetIdleTimer, clearTimers]);

  return { showWarning, confirmActive };
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. The only consumer of `useInactivityTimeout` is `DashboardLayout.tsx` which calls it with one argument — the default `enabled = true` keeps its behavior unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useInactivityTimeout.ts
git commit -m "feat: update inactivity timeout to 3 hours and add enabled parameter"
```

---

### Task 2: Add `hasSessionHint()` and `AuthenticatedShell` to `App.tsx`, update `AppLayout`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports for new dependencies**

At the top of `src/App.tsx`, add these imports alongside the existing ones. `useLogout` is already used elsewhere in the codebase; `InactivityWarningDialog` is currently only in `DashboardLayout`. The `useInactivityTimeout` hook is already imported by `DashboardLayout` but needs to be available in `App.tsx` now.

Add after the existing `import { useAuth } from "@/hooks/useAuth";` line (line 28):

```ts
import { useLogout } from "@/hooks/useLogout";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { InactivityWarningDialog } from "@/components/InactivityWarningDialog";
```

- [ ] **Step 2: Add `hasSessionHint()` utility function**

Add this function above `AppLayout` (before line 305 in the current file, after `AnimatedRoutes`):

```ts
function hasSessionHint(): boolean {
  try {
    return Object.keys(localStorage).some(key => key.startsWith('sb-'));
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Add `AuthenticatedShell` component**

Add this component after `hasSessionHint()`, before `AppShell`:

```ts
function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const logout = useLogout();
  const { showWarning, confirmActive } = useInactivityTimeout(logout, isAuthenticated);

  return (
    <>
      {children}
      <InactivityWarningDialog open={showWarning} onConfirm={confirmActive} />
    </>
  );
}
```

- [ ] **Step 4: Update `AppLayout` function**

Replace the current `AppLayout` function (lines 325-336):

```ts
function AppLayout() {
  const { pathname } = useLocation();
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (isPublic) return <AppShell />;

  return (
    <DonnyProviderWithAuth>
      <AppShell />
    </DonnyProviderWithAuth>
  );
}
```

With:

```ts
function AppLayout() {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const isPublic = PUBLIC_PATHS.has(pathname);

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
      <AuthenticatedShell>
        <AppShell />
      </AuthenticatedShell>
    </DonnyProviderWithAuth>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds. At this point both the old `DashboardLayout` timeout AND the new `AuthenticatedShell` timeout are active — Task 3 removes the duplicate.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add app-level auth loading guard and global inactivity timeout shell"
```

---

### Task 3: Remove inactivity timeout from `DashboardLayout`

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Remove inactivity-related imports**

In `src/components/DashboardLayout.tsx`, remove these two import lines (lines 33-34):

```ts
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout';
import { InactivityWarningDialog } from '@/components/InactivityWarningDialog';
```

- [ ] **Step 2: Remove hook call from `DashboardLayoutInner`**

In the `DashboardLayoutInner` component (line 153), remove this line:

```ts
const { showWarning, confirmActive } = useInactivityTimeout(logout);
```

- [ ] **Step 3: Remove `InactivityWarningDialog` render**

Remove this line from the JSX (line 305 in current file, inside the closing of the SidebarProvider):

```tsx
<InactivityWarningDialog open={showWarning} onConfirm={confirmActive} />
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds. No unused-import warnings for the removed imports. The `logout` variable is still used by the logout button in the dropdown menu (line 284), so it stays.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "refactor: remove dashboard-scoped inactivity timeout (now global in AuthenticatedShell)"
```

---

### Task 4: Remove broken cookie-based session hint from `LandingPage`

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Remove the cookie-based session hint block**

In `src/pages/LandingPage.tsx`, remove the entire session hint check (lines 25-35). The block to remove:

```tsx
  // Show splash while auth resolves for returning users (Supabase sets sb- cookies)
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

The `useEffect` redirect (lines 19-23) stays — it handles the post-resolution redirect. The `Spinner` import also stays since it's unused after this removal — **wait, check**: `Spinner` is only used in this removed block. Remove the `Spinner` import too (line 13):

```ts
import { Spinner } from "@/components/ui/spinner";
```

The resulting `LandingPage.tsx` file should have:
- Imports: `SEO`, `Header`, `HeroSection`, `BriefGeneratorPreview` (lazy), `HowItWorks`, `FeatureSection`, `BrandSection`, `BottomCTA`, `useAuth`, `useNavigate`, `lazy`, `Suspense`, `useEffect`
- The `useEffect` redirect block (unchanged)
- The main JSX return (unchanged)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. No unused-import warnings.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "refactor: remove broken cookie-based session hint (replaced by app-level guard)"
```

---

### Task 5: Verify end-to-end

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, zero errors.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No new lint errors. Specifically check that no unused imports remain.

- [ ] **Step 5: Manual verification — landing page flash**

Start dev server (`npm run dev`). Log in as any role. Navigate to `/`. Refresh the page. Verify:
- A branded splash screen (DragonCandy logo + teal spinner on white background) appears briefly while auth resolves
- No landing page content (hero, features, CTA) flashes before redirecting to dashboard
- The splash disappears and dashboard loads normally

Test with all three accounts:
- Restaurant: `dwilliams@harbormill.net` / `Pdi@mondz1`
- Creator: `damewillie@gmail.com` / `Pdi@mondz1`
- Brand: `damesonpoint@gmail.com` / `Pdi@mondz1`

- [ ] **Step 6: Manual verification — public pages unaffected**

While logged out, visit `/`, `/auth`, `/help`, `/pricing`. Verify:
- No splash screen appears on any of these (no Supabase keys in localStorage)
- Landing page renders immediately with full content
- Auth page loads normally

- [ ] **Step 7: Manual verification — inactivity timeout**

Log in. To test without waiting 3 hours, temporarily set `IDLE_WARNING_MS` to `10 * 1000` (10 seconds) in `useInactivityTimeout.ts`. Verify:
- Warning dialog ("Are you still there?") appears after 10 seconds of inactivity on any page (dashboard, messages, campaigns, settings)
- Clicking "I'm still here" dismisses the dialog and resets the timer
- If you don't click, auto-logout fires 15 minutes later (temporarily set `IDLE_LOGOUT_MS` to `5000` for testing)
- After logout, you're redirected to `/landing`

**IMPORTANT:** Revert the test timing back to production values after testing:
```ts
const IDLE_WARNING_MS = 165 * 60 * 1000;
const IDLE_LOGOUT_MS = 15 * 60 * 1000;
```

- [ ] **Step 8: Check console for errors**

Open Chrome DevTools Console on each page tested. Verify no new errors or warnings related to auth, localStorage, or timers.

- [ ] **Step 9: Test desktop and mobile viewports**

Resize browser to mobile width (375px). Repeat steps 5-7. The splash screen is a simple centered flexbox layout — it should look correct at all viewport widths. Verify the inactivity warning dialog renders correctly on both desktop and mobile.
