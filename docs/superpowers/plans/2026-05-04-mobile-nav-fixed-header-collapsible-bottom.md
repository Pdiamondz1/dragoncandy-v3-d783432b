# Mobile Nav: Fixed Header + Collapsible Bottom Nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mobile top header to the viewport so it never scrolls, and make the bottom nav auto-hide on scroll-down / reappear on scroll-up (Instagram pattern).

**Architecture:** A new `useScrollDirection` hook listens to scroll events on the `#main-content` element (the App.tsx scroll container) and returns `"up"` or `"down"`. `MobileBottomNav` consumes the hook to toggle a `translate-y-full` CSS class. `MobileTopNav` switches from `sticky` to `fixed` positioning, with a `pt-14` offset added to the mobile content area in `DashboardLayout`.

**Tech Stack:** React hooks, Tailwind CSS, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-04-mobile-nav-fixed-header-collapsible-bottom-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/useScrollDirection.ts` | Create | Scroll direction detection hook |
| `src/hooks/useScrollDirection.test.ts` | Create | Unit tests for the hook |
| `src/components/MobileTopNav.tsx` | Modify | Change `sticky` → `fixed` positioning |
| `src/components/DashboardLayout.tsx` | Modify | Add `pt-14` top padding on mobile `<main>` |
| `src/components/MobileBottomNav.tsx` | Modify | Consume hook, add collapse animation |

---

### Task 1: Create the `useScrollDirection` hook

**Files:**
- Create: `src/hooks/useScrollDirection.ts`

- [ ] **Step 1: Create `src/hooks/useScrollDirection.ts`**

```ts
import { useState, useEffect, useRef } from 'react';

type ScrollDirection = 'up' | 'down';

const THRESHOLD = 10;

export function useScrollDirection(elementId = 'main-content'): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>('up');
  const prevScrollTop = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const el = document.getElementById(elementId);
    if (!el) return;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentScrollTop = el.scrollTop;
        const diff = currentScrollTop - prevScrollTop.current;

        if (diff > THRESHOLD) {
          setDirection('down');
        } else if (diff < -THRESHOLD) {
          setDirection('up');
        }

        prevScrollTop.current = currentScrollTop;
        ticking.current = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [elementId]);

  return direction;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/hooks/useScrollDirection.ts`

If that errors due to project config, run: `npx vitest run --reporter=verbose 2>&1 | head -5` to confirm vitest can see the file.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScrollDirection.ts
git commit -m "feat: add useScrollDirection hook for scroll-direction detection"
```

---

### Task 2: Test the `useScrollDirection` hook

**Files:**
- Create: `src/hooks/useScrollDirection.test.ts`

- [ ] **Step 1: Create `src/hooks/useScrollDirection.test.ts`**

```ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollDirection } from './useScrollDirection';

function createScrollContainer(id: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = id;
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true });
  document.body.appendChild(el);
  return el;
}

function fireScroll(el: HTMLDivElement, scrollTop: number) {
  (el as any).scrollTop = scrollTop;
  el.dispatchEvent(new Event('scroll'));
}

describe('useScrollDirection', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createScrollContainer('main-content');
  });

  afterEach(() => {
    container.remove();
  });

  test('returns "up" as initial direction', () => {
    const { result } = renderHook(() => useScrollDirection());
    expect(result.current).toBe('up');
  });

  test('returns "down" after scrolling past threshold', async () => {
    const { result } = renderHook(() => useScrollDirection());

    await act(async () => {
      fireScroll(container, 20);
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(result.current).toBe('down');
  });

  test('returns "up" after scrolling back up past threshold', async () => {
    const { result } = renderHook(() => useScrollDirection());

    await act(async () => {
      fireScroll(container, 50);
      await new Promise((r) => requestAnimationFrame(r));
    });

    await act(async () => {
      fireScroll(container, 20);
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(result.current).toBe('up');
  });

  test('ignores scroll within threshold deadzone', async () => {
    const { result } = renderHook(() => useScrollDirection());

    await act(async () => {
      fireScroll(container, 5);
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(result.current).toBe('up');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/hooks/useScrollDirection.test.ts --reporter=verbose`

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScrollDirection.test.ts
git commit -m "test: add useScrollDirection unit tests"
```

---

### Task 3: Fix the mobile top header to the viewport

**Files:**
- Modify: `src/components/MobileTopNav.tsx:32`

- [ ] **Step 1: Change the header className**

In `src/components/MobileTopNav.tsx`, line 32, replace the header's className:

```tsx
// BEFORE
<header className={`sticky top-0 z-50 flex items-center justify-between px-4 py-2 ${bgClass} border-b border-border`}>

// AFTER
<header className={`fixed top-0 left-0 right-0 w-full z-50 flex items-center justify-between px-4 py-2 ${bgClass} border-b border-border`}>
```

- [ ] **Step 2: Add top padding offset in DashboardLayout**

In `src/components/DashboardLayout.tsx`, line 271, update the mobile className string in the `<main>` element:

```tsx
// BEFORE
<main className={`${isMobile ? 'flex-1 min-h-screen overflow-x-hidden pb-24 px-4 w-full min-w-0 max-w-full' : 'flex-1 p-6 lg:p-8'} animate-fade-in`}>

// AFTER
<main className={`${isMobile ? 'flex-1 min-h-screen overflow-x-hidden pt-14 pb-24 px-4 w-full min-w-0 max-w-full' : 'flex-1 p-6 lg:p-8'} animate-fade-in`}>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileTopNav.tsx src/components/DashboardLayout.tsx
git commit -m "fix: make mobile top header fixed to viewport, add content offset"
```

---

### Task 4: Add scroll-direction collapse to the bottom nav

**Files:**
- Modify: `src/components/MobileBottomNav.tsx`

- [ ] **Step 1: Import the hook and consume it**

In `src/components/MobileBottomNav.tsx`, add the import at the top (after the existing imports around line 4):

```tsx
import { useScrollDirection } from '@/hooks/useScrollDirection';
```

- [ ] **Step 2: Use the hook inside the component and apply the transition classes**

Inside the `MobileBottomNav` component body (after the `isActive` function, around line 17), add:

```tsx
const scrollDirection = useScrollDirection();
```

Then update the `<nav>` element's className on line 21:

```tsx
// BEFORE
<nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">

// AFTER
<nav className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ${scrollDirection === 'down' ? 'translate-y-full' : 'translate-y-0'}`}>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Open the app on mobile viewport (375px width in browser devtools):
1. Scroll down on any dashboard page — bottom nav should slide off-screen smoothly.
2. Scroll up — bottom nav should slide back into view.
3. Top header should remain fixed at top throughout all scrolling.
4. Switch to desktop viewport (>768px) — desktop sidebar/header should be unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/components/MobileBottomNav.tsx
git commit -m "feat: auto-hide mobile bottom nav on scroll down, reappear on scroll up"
```

---

### Task 5: Final build verification

- [ ] **Step 1: Run full build**

Run: `npm run build`

Expected: Build succeeds with zero errors and zero warnings related to the changed files.

- [ ] **Step 2: Run tests**

Run: `npx vitest run --reporter=verbose`

Expected: All tests pass, including the new `useScrollDirection` tests.

- [ ] **Step 3: Final commit (if any lint/type fixes were needed)**

Only commit if previous steps required fixes. Otherwise skip.
