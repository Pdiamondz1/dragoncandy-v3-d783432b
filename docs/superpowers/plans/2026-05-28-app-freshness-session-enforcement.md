# App Freshness & Session Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure users always see the latest deployed code and that inactive sessions are reliably terminated after 3 hours.

**Architecture:** Two independent mechanisms sharing a `visibilitychange` pattern. (1) Rewrite the inactivity timeout from a fragile `setTimeout` to a timestamp-based check on a 60-second interval + visibility change. (2) Add a build-time `version.json` file polled every 5 minutes, with a soft update banner that force-reloads on the next navigation. An `AppVersionContext` bridges data from `AuthenticatedShell` to `AppShell`.

**Tech Stack:** React 18, TypeScript strict, Vite (inline plugin), react-router-dom 6.x (`useBlocker`), Tailwind CSS with `dc-*` tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-28-app-freshness-session-enforcement-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/hooks/useInactivityTimeout.ts` | Timestamp-based inactivity detection (rewrite) |
| `src/hooks/useInactivityTimeout.test.ts` | Unit tests for inactivity hook logic |
| `src/hooks/useAppVersion.ts` | Build hash polling, visibility-aware (new) |
| `src/hooks/useAppVersion.test.ts` | Unit tests for version polling logic (new) |
| `src/contexts/AppVersionContext.tsx` | Context bridging AuthenticatedShell → AppShell (new) |
| `src/components/UpdateBanner.tsx` | Update available banner + useBlocker force-reload (new) |
| `src/lib/authCleanup.ts` | Add `dc_last_activity` cleanup (modify) |
| `src/App.tsx` | Wire AppVersionProvider + UpdateBanner (modify) |
| `vite.config.ts` | Inline plugin to generate `version.json` (modify) |
| `public/_headers` | Cache rule for `version.json` (modify) |

---

### Task 1: Rewrite useInactivityTimeout — tests

**Files:**
- Create: `src/hooks/useInactivityTimeout.test.ts`

- [ ] **Step 1: Write test file for timestamp-based inactivity hook**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInactivityTimeout } from './useInactivityTimeout';

const IDLE_WARNING_MS = 165 * 60 * 1000;
const IDLE_LOGOUT_MS = 180 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = 'dc_last_activity';

describe('useInactivityTimeout', () => {
  let onLogout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onLogout = vi.fn();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes dc_last_activity in localStorage on mount', () => {
    renderHook(() => useInactivityTimeout(onLogout, true));
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(0);
  });

  it('does not set timers when disabled', () => {
    renderHook(() => useInactivityTimeout(onLogout, false));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shows warning after 165 minutes of inactivity', () => {
    const { result } = renderHook(() => useInactivityTimeout(onLogout, true));
    expect(result.current.showWarning).toBe(false);

    const pastTimestamp = Date.now() - IDLE_WARNING_MS - 1000;
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));

    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS); });
    expect(result.current.showWarning).toBe(true);
  });

  it('triggers logout after 180 minutes of inactivity', () => {
    renderHook(() => useInactivityTimeout(onLogout, true));

    const pastTimestamp = Date.now() - IDLE_LOGOUT_MS - 1000;
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));

    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS); });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not trigger logout between 165-180 minutes (warning only)', () => {
    const { result } = renderHook(() => useInactivityTimeout(onLogout, true));

    const pastTimestamp = Date.now() - (170 * 60 * 1000);
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));

    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS); });
    expect(result.current.showWarning).toBe(true);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('confirmActive resets the timestamp and hides warning', () => {
    const { result } = renderHook(() => useInactivityTimeout(onLogout, true));

    const pastTimestamp = Date.now() - IDLE_WARNING_MS - 1000;
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));
    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS); });
    expect(result.current.showWarning).toBe(true);

    act(() => { result.current.confirmActive(); });
    expect(result.current.showWarning).toBe(false);

    const stored = Number(localStorage.getItem(STORAGE_KEY));
    expect(Date.now() - stored).toBeLessThan(5000);
  });

  it('checks immediately on visibilitychange to visible', () => {
    const { result } = renderHook(() => useInactivityTimeout(onLogout, true));

    const pastTimestamp = Date.now() - IDLE_WARNING_MS - 1000;
    localStorage.setItem(STORAGE_KEY, String(pastTimestamp));

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.showWarning).toBe(true);
  });

  it('updates localStorage on activity events when warning is not showing', () => {
    renderHook(() => useInactivityTimeout(onLogout, true));

    const beforeActivity = Date.now();
    act(() => { window.dispatchEvent(new Event('mousedown')); });
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    expect(stored).toBeGreaterThanOrEqual(beforeActivity);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useInactivityTimeout.test.ts`
Expected: FAIL — current implementation doesn't use localStorage or setInterval

- [ ] **Step 3: Commit test file**

```bash
git add src/hooks/useInactivityTimeout.test.ts
git commit -m "test: add failing tests for timestamp-based inactivity timeout"
```

---

### Task 2: Rewrite useInactivityTimeout — implementation

**Files:**
- Modify: `src/hooks/useInactivityTimeout.ts` (full rewrite)

- [ ] **Step 1: Rewrite the hook**

Replace the entire contents of `src/hooks/useInactivityTimeout.ts` with:

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';

const IDLE_WARNING_MS = 165 * 60 * 1000;
const IDLE_LOGOUT_MS = 180 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = 'dc_last_activity';
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

function touchActivity(): void {
  const now = Date.now();
  try { localStorage.setItem(STORAGE_KEY, String(now)); } catch {}
}

function getLastActivity(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return Number(stored);
  } catch {}
  return Date.now();
}

export function useInactivityTimeout(onLogout: () => void, enabled = true) {
  const [showWarning, setShowWarning] = useState(false);
  const showWarningRef = useRef(false);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  const checkInactivity = useCallback(() => {
    const elapsed = Date.now() - getLastActivity();
    if (elapsed >= IDLE_LOGOUT_MS) {
      setShowWarning(false);
      showWarningRef.current = false;
      onLogoutRef.current();
    } else if (elapsed >= IDLE_WARNING_MS) {
      setShowWarning(true);
      showWarningRef.current = true;
    }
  }, []);

  const confirmActive = useCallback(() => {
    touchActivity();
    setShowWarning(false);
    showWarningRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setShowWarning(false);
      showWarningRef.current = false;
      return;
    }

    touchActivity();

    const intervalId = setInterval(checkInactivity, CHECK_INTERVAL_MS);

    const onActivity = () => {
      if (!showWarningRef.current) {
        touchActivity();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, checkInactivity]);

  return { showWarning, confirmActive };
}
```

Key design notes for the implementer:
- `showWarningRef` mirrors the `showWarning` state so the `onActivity` closure always reads the latest value without being in the `useEffect` dependency array.
- `onLogoutRef` avoids re-running the effect when the logout callback changes.
- `touchActivity()` writes to localStorage. During warning phase, `onActivity` checks `showWarningRef.current` and skips the write — only `confirmActive` can reset during warning.
- `getLastActivity()` fails open: if localStorage is corrupted/unavailable, returns `Date.now()` (treating user as active).

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/hooks/useInactivityTimeout.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useInactivityTimeout.ts
git commit -m "fix: rewrite inactivity timeout to use timestamps instead of setTimeout

setTimeout is unreliable in background browser tabs. The new approach
stores a lastActivity timestamp in localStorage and checks it on a
60-second interval + visibilitychange listener."
```

---

### Task 3: Add dc_last_activity cleanup to authCleanup

**Files:**
- Modify: `src/lib/authCleanup.ts:12`

- [ ] **Step 1: Add dc_last_activity to the cleanup function**

In `src/lib/authCleanup.ts`, after line 12 (`localStorage.removeItem('dc_site_unlocked_until');`), add:

```typescript
    localStorage.removeItem('dc_last_activity');
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/authCleanup.ts
git commit -m "fix: clean up dc_last_activity on logout"
```

---

### Task 4: Add version.json Vite plugin + cache headers

**Files:**
- Modify: `vite.config.ts:15-20` (add plugin to array)
- Modify: `public/_headers:10-11` (add cache rule)

- [ ] **Step 1: Add the version.json generation plugin to vite.config.ts**

Add `import { writeFileSync } from 'fs';` after the existing `import path from "path";` line (line 6).

Then in the `plugins` array (after line 19, before `].filter(Boolean)`), add:

```typescript
    mode === 'production' && {
      name: 'generate-version-json',
      closeBundle() {
        const hash = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const content = JSON.stringify({ hash, built: new Date().toISOString() });
        writeFileSync(path.resolve(__dirname, 'dist/version.json'), content);
      },
    },
```

The full plugins array should read:

```typescript
  plugins: [
    mdx({ remarkPlugins: [remarkFrontmatter, remarkGfm] }),
    react(),
    mode === 'development' &&
    componentTagger(),
    mode === 'production' && {
      name: 'generate-version-json',
      closeBundle() {
        const hash = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const content = JSON.stringify({ hash, built: new Date().toISOString() });
        writeFileSync(path.resolve(__dirname, 'dist/version.json'), content);
      },
    },
  ].filter(Boolean),
```

- [ ] **Step 2: Add cache headers for version.json**

In `public/_headers`, add after line 11 (the `index.html` block):

```
/version.json
  Cache-Control: no-cache, must-revalidate
```

The full file should read:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/logo.webp
  Cache-Control: public, max-age=86400

/index.html
  Cache-Control: public, s-maxage=3600, max-age=0, must-revalidate

/version.json
  Cache-Control: no-cache, must-revalidate

/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
```

- [ ] **Step 3: Run build to verify plugin works**

Run: `npm run build`
Expected: Build succeeds. Check that `dist/version.json` exists and contains `{"hash":"...","built":"..."}`.

Verify: `type dist\version.json`

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts public/_headers
git commit -m "feat: generate version.json at build time for app freshness detection

Vite plugin writes dist/version.json with a unique hash on every
production build. Cache headers ensure CDN/browser always fetches fresh."
```

---

### Task 5: Create useAppVersion hook — tests

**Files:**
- Create: `src/hooks/useAppVersion.test.ts`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppVersion } from './useAppVersion';

const VERSION_POLL_MS = 5 * 60 * 1000;

describe('useAppVersion', () => {
  const originalEnv = import.meta.env.PROD;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns updateAvailable=false in dev mode', () => {
    vi.stubEnv('PROD', false);
    const { result } = renderHook(() => useAppVersion());
    expect(result.current.updateAvailable).toBe(false);
  });

  it('fetches version.json on mount in prod mode', () => {
    vi.stubEnv('PROD', true);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hash: 'abc123', built: '2026-05-28T00:00:00Z' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    renderHook(() => useAppVersion());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toMatch(/^\/version\.json\?_t=\d+$/);
  });

  it('sets updateAvailable when hash changes', async () => {
    vi.stubEnv('PROD', true);
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      const hash = callCount === 1 ? 'initial-hash' : 'new-hash';
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hash, built: '2026-05-28T00:00:00Z' }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAppVersion());

    await act(async () => { await vi.runAllTimersAsync(); });
    expect(result.current.updateAvailable).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(VERSION_POLL_MS); });
    expect(result.current.updateAvailable).toBe(true);
  });

  it('stays false when hash is unchanged', async () => {
    vi.stubEnv('PROD', true);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hash: 'same-hash', built: '2026-05-28T00:00:00Z' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAppVersion());

    await act(async () => { await vi.runAllTimersAsync(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(VERSION_POLL_MS); });
    expect(result.current.updateAvailable).toBe(false);
  });

  it('silently ignores fetch failures', async () => {
    vi.stubEnv('PROD', true);
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAppVersion());

    await act(async () => { await vi.runAllTimersAsync(); });
    expect(result.current.updateAvailable).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useAppVersion.test.ts`
Expected: FAIL — file `useAppVersion.ts` does not exist yet

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAppVersion.test.ts
git commit -m "test: add failing tests for app version polling hook"
```

---

### Task 6: Create useAppVersion hook — implementation

**Files:**
- Create: `src/hooks/useAppVersion.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';

const VERSION_POLL_MS = 5 * 60 * 1000;

interface VersionInfo {
  hash: string;
  built: string;
}

async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`/version.json?_t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useAppVersion(): { updateAvailable: boolean } {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialHashRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkVersion = useCallback(async () => {
    const info = await fetchVersion();
    if (!info) return;

    if (initialHashRef.current === null) {
      initialHashRef.current = info.hash;
    } else if (info.hash !== initialHashRef.current) {
      setUpdateAvailable(true);
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    checkVersion();
    intervalRef.current = setInterval(checkVersion, VERSION_POLL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkVersion]);

  return { updateAvailable };
}
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/hooks/useAppVersion.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppVersion.ts
git commit -m "feat: add useAppVersion hook for build hash polling

Polls /version.json every 5 minutes (prod only). Pauses in background
tabs, checks immediately on visibility change. Fails silently on errors."
```

---

### Task 7: Create AppVersionContext

**Files:**
- Create: `src/contexts/AppVersionContext.tsx`

- [ ] **Step 1: Create the context provider**

```tsx
import { createContext, useContext } from 'react';
import { useAppVersion } from '@/hooks/useAppVersion';

interface AppVersionContextValue {
  updateAvailable: boolean;
}

const AppVersionContext = createContext<AppVersionContextValue>({ updateAvailable: false });

export function AppVersionProvider({ children }: { children: React.ReactNode }) {
  const version = useAppVersion();
  return (
    <AppVersionContext.Provider value={version}>
      {children}
    </AppVersionContext.Provider>
  );
}

export function useAppVersionContext(): AppVersionContextValue {
  return useContext(AppVersionContext);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AppVersionContext.tsx
git commit -m "feat: add AppVersionContext to bridge AuthenticatedShell to AppShell"
```

---

### Task 8: Create UpdateBanner component

**Files:**
- Create: `src/components/UpdateBanner.tsx`

- [ ] **Step 1: Create the banner component with useBlocker**

```tsx
import { useState, useEffect } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { useAppVersionContext } from '@/contexts/AppVersionContext';
import { X, RefreshCw } from 'lucide-react';

export function UpdateBanner() {
  const { updateAvailable } = useAppVersionContext();
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (updateAvailable) setDismissed(false);
  }, [location.pathname, updateAvailable]);

  useBlocker(({ nextLocation }) => {
    if (updateAvailable && nextLocation.pathname !== location.pathname) {
      window.location.href = nextLocation.pathname + (nextLocation.search || '');
      return true;
    }
    return false;
  });

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-dc-teal px-4 py-2 text-white text-sm font-medium shadow-md">
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span>A new version of DragonCandy is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 transition-colors"
      >
        Refresh
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 rounded-full p-1 hover:bg-white/20 transition-colors"
        aria-label="Dismiss update notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

Design notes for the implementer:
- `useBlocker` returns `true` to block the navigation, then immediately sets `window.location.href` to do a full page reload to the target URL. The blocker never calls `proceed()`.
- The `dismissed` state resets on every route change (via the `location.pathname` dependency in the effect), so the banner reappears if the user navigates but the blocker doesn't fire (edge case: navigating to the same page).
- The banner is `fixed` with `z-50` so it overlays without shifting layout.
- The X button hides the banner visually but the `useBlocker` still intercepts navigation — `useBlocker` checks `updateAvailable` directly, not `dismissed`.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/UpdateBanner.tsx
git commit -m "feat: add UpdateBanner with soft prompt and force-reload on navigation

Shows a teal banner when a new version is detected. Dismissible but
reappears on navigation. useBlocker intercepts route changes to force
a full page reload to pick up new bundles."
```

---

### Task 9: Wire everything into App.tsx

**Files:**
- Modify: `src/App.tsx:9,31,323-334,336-351`

- [ ] **Step 1: Add imports**

In `src/App.tsx`, add these imports near the top with the other context/component imports:

After the `import { InactivityWarningDialog }` line (line 32), add:

```typescript
import { AppVersionProvider } from "@/contexts/AppVersionContext";
import { UpdateBanner } from "@/components/UpdateBanner";
```

- [ ] **Step 2: Wrap AuthenticatedShell children in AppVersionProvider**

Replace the `AuthenticatedShell` function (lines 323-334) with:

```typescript
function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const logout = useLogout();
  const { showWarning, confirmActive } = useInactivityTimeout(logout, isAuthenticated);

  return (
    <AppVersionProvider>
      {children}
      <InactivityWarningDialog open={showWarning} onConfirm={confirmActive} />
    </AppVersionProvider>
  );
}
```

- [ ] **Step 3: Add UpdateBanner to AppShell**

Replace the `AppShell` function (lines 336-352) with:

```typescript
function AppShell() {
  const { pathname } = useLocation();
  const showDonny = !PUBLIC_PATHS.has(pathname);

  return (
    <div className="flex h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:text-black focus:underline">Skip to main content</a>
      <main id="main-content" className="flex-1 overflow-auto">
        <UpdateBanner />
        <SiteGateGuard>
          <AnimatedRoutes />
        </SiteGateGuard>
        {showDonny && <ErrorBoundary level="widget" fallback={null}><Suspense fallback={null}><HelpBriefDrawer /></Suspense></ErrorBoundary>}
      </main>
      {showDonny && <ErrorBoundary level="widget" fallback={null}><Suspense fallback={null}><DonnyDesktopPanel /></Suspense></ErrorBoundary>}
    </div>
  );
}
```

The only change is adding `<UpdateBanner />` as the first child inside `<main>`, above `<SiteGateGuard>`.

Note: `UpdateBanner` uses `useAppVersionContext()` internally. When rendered on public routes (where `AppVersionProvider` is not in the tree), the context falls back to `{ updateAvailable: false }` from the default value, so the banner simply doesn't render. No error boundary needed.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors

- [ ] **Step 5: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire AppVersionProvider and UpdateBanner into app shell

AppVersionProvider wraps AuthenticatedShell children, making
updateAvailable accessible to UpdateBanner in AppShell. Banner renders
above routes, shows update prompt and intercepts navigation for reload."
```

---

### Task 10: Run full test suite + final verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, including the new inactivity and version tests

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (warnings acceptable for existing code)

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds. Verify `dist/version.json` exists.

- [ ] **Step 5: Verify dev server starts**

Run: `npm run dev`
Expected: Dev server starts on http://127.0.0.1:8080 without errors. Open in browser, verify no console errors. The update banner should NOT appear in dev mode.
