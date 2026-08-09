# Donny Inline Canvas (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the business dashboard answer Donny inline on the page instead of launching a docked panel over it, with a multi-line ChatGPT-style composer.

**Architecture:** A fourth `DonnyStage` value, `'inline'`, is set by the new `DonnyCanvas` on mount. Because `DonnyProvider` already gates its chat hook on `enabled: stage !== 'closed'`, that one value turns the conversation on for the dashboard with no edit to the gate, closes any open panel by the same assignment, and gives the two launchers and two panel surfaces a single signal to switch on. Panel actions become inert while it holds. The canvas renders a resting state (greeting, composer, chips, widgets) and, on the first send of a visit, a thread state with the composer stuck to the bottom of `#main-content`.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind, shadcn/ui, React Query, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-09-donny-dashboard-unification-design.md`. Read §4 before starting. Phase 2 (attachments) and Phase 3 (creator/brand) are **out of scope** — do not build them.

## Global Constraints

- **TypeScript strict.** `noUnusedLocals`, `noUnusedParameters`. Prefix intentionally-unused params with `_`.
- **Named exports for components**, default exports only for pages.
- **`no-console`** — only `console.error` / `console.warn` pass lint.
- **Tailwind only, `dc-*` tokens.** Never hardcode hex. Light app kit: `PageBody`, `AppCard`, `AppChip`, `AppStatusBadge`.
- **No gray surfaces or badges.** Gray *text* (`dc-text-muted`) is fine. `amber` is the allowed warm-neutral status tone.
- **`AppChip`'s off state is muted on purpose and is the wrong default when a chip IS the content.** For action chips override at the call site: `className="text-dc-teal-btn border-dc-teal/30"`. Do **not** restyle `AppChip` itself. (`docs/DESIGN_SYSTEM.md`, added 2026-08-09 from this very dashboard.)
- **Desktop and mobile are separate targets.** `lg:`/`xl:` for desktop, unprefixed for mobile. Never alter working `lg:` classes when fixing mobile.
- **Bottom-anchored mobile UI uses `dvh`/`svh` + `env(safe-area-inset-bottom)`, never `vh`.**
- **`window.scrollY` is always `0`.** The app scroller is `<main id="main-content" className="flex-1 overflow-auto">` at `src/App.tsx:438`. Read it with `document.getElementById('main-content') ?? window`, the pattern at `src/components/landing/Header.tsx:29-38`.
- **Never put a transform on an ancestor of `position: fixed`.** This plan uses `sticky`, so the question does not arise — do not switch to `fixed`.
- **Every RTL test file starts with exactly these two lines**, in this order, before any other import:
  ```tsx
  // @vitest-environment jsdom
  import '@testing-library/jest-dom';
  ```
  jsdom is per-file here, not global.
- **`npm run test` exits `1`** from ~103 pre-existing failing files. Judge your work by the `Test Files`/`Tests` counts for the files you touched, never the exit code.
- **Run `npm run build` before any push.** `npm run typecheck` and `npm run lint` after each task.
- **Commit after every task.** Conventional-commit subjects.

---

## File Structure

**Create**

| Path | Responsibility |
|---|---|
| `src/lib/donny/donnyStage.ts` | The entire stage rulebook as one pure function. No React. |
| `src/lib/donny/donnyStage.test.ts` | Unit tests for it. |
| `src/components/donny/inline/DonnyComposer.tsx` | Textarea composer: auto-grow, Enter/Shift+Enter, IME guard. Presentational. |
| `src/components/donny/inline/DonnyComposer.test.tsx` | |
| `src/components/donny/inline/DonnyTurn.tsx` | One turn — user bubble, or Donny avatar + unbubbled prose + rich cards + actions. Presentational. |
| `src/components/donny/inline/DonnyTurn.test.tsx` | |
| `src/components/donny/inline/DonnyThread.tsx` | Turn list + pending shimmer + error/retry. Presentational. |
| `src/components/donny/inline/DonnyThread.test.tsx` | |
| `src/components/donny/inline/DonnyCanvas.tsx` | The only stateful piece: resting↔thread, `setInline()` on mount, composer registration, `#main-content` scroll anchoring. |
| `src/components/donny/inline/DonnyCanvas.test.tsx` | |

**Modify**

| Path | Change |
|---|---|
| `src/types/donnyNudge.ts:28` | Add `'inline'` to `DonnyStage`. |
| `src/contexts/DonnyProvider.tsx` | Stage transitions route through `nextStage`; add `setInline`/`exitInline`/`registerInlineComposer`/`focusInlineComposer` to the value **and to `DONNY_FALLBACK`**. |
| `src/components/donny/DonnyDesktopPanel.tsx:38` | Also return `null` when `stage === 'inline'`. |
| `src/components/donny/DonnyMobileSheet.tsx:43` | Also return `null` when `stage === 'inline'`. |
| `src/components/DashboardLayout.tsx:236-248` | Launcher becomes three-way on stage. |
| `src/components/donny/DonnyNavButton.tsx:5-13` | Launcher becomes three-way on stage. |
| `src/components/donny/DonnyMessage.tsx:119-123` | Skip the mobile `close()` when `stage === 'inline'`. |
| `src/components/donny/DonnyHome.tsx` | Render `DonnyCanvas` in place of `DonnyHomePrompt`; suggestions send inline. |
| `src/components/donny/DonnyHome.test.tsx:16-19` | Widen the `useDonnyContext` mock; update the two prompt-submit assertions. |

**Delete**

| Path | Why |
|---|---|
| `src/components/donny/DonnyHomePrompt.tsx` | Replaced by `DonnyComposer`. |
| `src/components/donny/DonnyHomePrompt.test.tsx` | Its input assertions move to `DonnyComposer.test.tsx`; its `BUSINESS_SUGGESTIONS` block moves to `donnyHomeSuggestions.test.ts` (Task 7). |

---

## Task 0: Verify the rebase landed

**Files:** none — verification only.

- [ ] **Step 1: Confirm the branch is current and the Phase A surface exists**

```bash
git fetch origin
git rev-list --left-right --count origin/main...HEAD   # left (behind) must be 0
ls src/components/donny/DonnyHome.tsx src/components/donny/DonnyHomePrompt.tsx
grep -n "DONNY_FIRST_DASHBOARD_ENABLED" src/lib/featureConfig.ts
grep -n "DonnyStage" src/types/donnyNudge.ts
```

Expected: behind-count `0`; both files present; the flag is `true`; `DonnyStage` is `'closed' | 'tray' | 'chat'` with **no** `'inline'`.

If the behind-count is not 0, stop and rebase — every line number in this plan assumes the rebased tree.

- [ ] **Step 2: Establish the pre-existing test baseline**

```bash
npx vitest run src/components/donny/ src/lib/donny/
```

Record the `Tests  N passed` number. That is your baseline; nothing in this plan may reduce it except the assertions Task 7 deliberately rewrites.

---

## Task 1: The stage rulebook

The provider's stage rules currently live as four one-line `useCallback`s. Adding `'inline'` adds conditional behaviour to all of them, so extract the rules into a pure function first — it is the only way to test them without mounting a provider that pulls in auth, React Query, the router, and three hooks.

**Files:**
- Create: `src/lib/donny/donnyStage.ts`
- Create: `src/lib/donny/donnyStage.test.ts`
- Modify: `src/types/donnyNudge.ts:28`

**Interfaces:**
- Consumes: `DonnyStage` from `@/types/donnyNudge`.
- Produces: `type DonnyStageAction = 'open' | 'expand' | 'collapse' | 'close' | 'inline' | 'exitInline'` and `nextStage(current: DonnyStage, action: DonnyStageAction): DonnyStage`. Task 2 consumes both.

- [ ] **Step 1: Widen the type**

In `src/types/donnyNudge.ts`, replace line 28:

```ts
export type DonnyStage = 'closed' | 'tray' | 'chat' | 'inline';
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/donny/donnyStage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextStage } from './donnyStage';
import type { DonnyStage } from '@/types/donnyNudge';

const PANEL_ACTIONS = ['open', 'expand', 'collapse', 'close'] as const;

describe('nextStage — panel behaviour is unchanged', () => {
  it('opens the tray from closed', () => {
    expect(nextStage('closed', 'open')).toBe('tray');
  });

  it('expands the tray to chat and collapses back', () => {
    expect(nextStage('tray', 'expand')).toBe('chat');
    expect(nextStage('chat', 'collapse')).toBe('tray');
  });

  it('closes from either panel stage', () => {
    expect(nextStage('tray', 'close')).toBe('closed');
    expect(nextStage('chat', 'close')).toBe('closed');
  });
});

describe('nextStage — inline', () => {
  it('enters inline from every stage, so mounting the canvas closes an open panel', () => {
    const stages: DonnyStage[] = ['closed', 'tray', 'chat', 'inline'];
    for (const from of stages) {
      expect(nextStage(from, 'inline')).toBe('inline');
    }
  });

  it('makes every panel action inert while inline', () => {
    for (const action of PANEL_ACTIONS) {
      expect(nextStage('inline', action)).toBe('inline');
    }
  });

  it('leaves inline only via exitInline, which lands closed', () => {
    expect(nextStage('inline', 'exitInline')).toBe('closed');
  });

  it('ignores exitInline when not inline, so a stray unmount cannot close the panel', () => {
    expect(nextStage('tray', 'exitInline')).toBe('tray');
    expect(nextStage('chat', 'exitInline')).toBe('chat');
    expect(nextStage('closed', 'exitInline')).toBe('closed');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run src/lib/donny/donnyStage.test.ts
```

Expected: FAIL — `Failed to resolve import "./donnyStage"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/donny/donnyStage.ts`:

```ts
import type { DonnyStage } from '@/types/donnyNudge';

export type DonnyStageAction =
  | 'open'
  | 'expand'
  | 'collapse'
  | 'close'
  | 'inline'
  | 'exitInline';

/**
 * The whole stage rulebook, in one pure function.
 *
 * 'inline' is the dashboard's own Donny surface. While it holds, the panel
 * actions are inert: a docked panel must never open over an inline thread, and
 * close() must never tear down the surface the user is reading. Only the canvas
 * unmounting (exitInline) leaves it.
 *
 * Entering inline is unconditional on purpose. The provider sits above the
 * router and nothing resets stage on navigation, so a panel opened on another
 * page is still open when the dashboard mounts. Assigning 'inline' closes it by
 * the same stroke — no separate close-on-entry rule needed.
 */
export function nextStage(current: DonnyStage, action: DonnyStageAction): DonnyStage {
  if (action === 'inline') return 'inline';
  if (action === 'exitInline') return current === 'inline' ? 'closed' : current;
  if (current === 'inline') return current;

  switch (action) {
    case 'open':
      return 'tray';
    case 'expand':
      return 'chat';
    case 'collapse':
      return 'tray';
    case 'close':
      return 'closed';
  }
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npx vitest run src/lib/donny/donnyStage.test.ts
npm run typecheck
```

Expected: all tests PASS. Typecheck clean — widening `DonnyStage` compiles because every existing `switch`/comparison on it is an equality check, not an exhaustive match.

- [ ] **Step 6: Commit**

```bash
git add src/types/donnyNudge.ts src/lib/donny/donnyStage.ts src/lib/donny/donnyStage.test.ts
git commit -m "feat(donny): add the 'inline' stage and extract the stage rulebook"
```

---

## Task 2: Provider — route transitions through the rulebook, expose the composer handle

**Files:**
- Modify: `src/contexts/DonnyProvider.tsx`

**Interfaces:**
- Consumes: `nextStage`, `DonnyStageAction` from Task 1.
- Produces, on `DonnyContextValue`: `setInline: () => void`, `exitInline: () => void`, `registerInlineComposer: (el: HTMLTextAreaElement | null) => void`, `focusInlineComposer: () => void`. Tasks 3, 5 and 6 consume these.

- [ ] **Step 1: Import the rulebook**

Add near the other `@/lib` imports:

```ts
import { nextStage } from '@/lib/donny/donnyStage';
```

- [ ] **Step 2: Add the composer ref beside the stage state**

Immediately after `const [stage, setStage] = useState<DonnyStage>('closed');` (line 98):

```ts
  // The inline dashboard composer, registered by DonnyCanvas while it is mounted.
  const inlineComposerRef = useRef<HTMLTextAreaElement | null>(null);
```

`useRef` is already imported in this file; confirm before adding it to the import list.

- [ ] **Step 3: Replace the four transitions (lines 150-158)**

Replace the whole `// Stage transitions` block with:

```tsx
  // Stage transitions — every rule lives in nextStage(); these only bind side effects.
  const open = useCallback(() => {
    // Guarded here rather than inside the updater: markAllRead is a side effect,
    // and React may invoke a state updater twice under StrictMode.
    if (stage === 'inline') return;
    setStage((s) => nextStage(s, 'open'));
    markAllRead();
  }, [stage, markAllRead]);

  const expand = useCallback(() => setStage((s) => nextStage(s, 'expand')), []);
  const collapse = useCallback(() => setStage((s) => nextStage(s, 'collapse')), []);
  const close = useCallback(() => setStage((s) => nextStage(s, 'close')), []);
  const setInline = useCallback(() => setStage((s) => nextStage(s, 'inline')), []);
  const exitInline = useCallback(() => setStage((s) => nextStage(s, 'exitInline')), []);

  const registerInlineComposer = useCallback((el: HTMLTextAreaElement | null) => {
    inlineComposerRef.current = el;
  }, []);

  const focusInlineComposer = useCallback(() => {
    const el = inlineComposerRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
  }, []);
```

- [ ] **Step 4: Add the four fields to the interface (lines 16-49)**

In `DonnyContextValue`, under the `// UI state` group:

```ts
  setInline: () => void;
  exitInline: () => void;
  registerInlineComposer: (el: HTMLTextAreaElement | null) => void;
  focusInlineComposer: () => void;
```

- [ ] **Step 5: Add them to `DONNY_FALLBACK` (lines 55-81)**

This is the object `useDonnyContext()` returns when there is no provider. Omitting a field is a type error; more importantly a component that reads it outside a provider would crash instead of no-op.

```ts
  setInline: () => {},
  exitInline: () => {},
  registerInlineComposer: () => {},
  focusInlineComposer: () => {},
```

- [ ] **Step 6: Add them to the context value object and its memo dependency array**

Find the `useMemo` building the provider value (~line 342-374). Add the four names to both the object literal and the dependency array. Missing a dep here means a stale closure, and `focusInlineComposer` would silently stop working after an unrelated re-render.

- [ ] **Step 7: Verify nothing else compiles against the old shape**

```bash
npm run typecheck
npm run lint
```

Expected: clean. If `useRef` was not already imported, add it.

- [ ] **Step 8: Commit**

```bash
git add src/contexts/DonnyProvider.tsx
git commit -m "feat(donny): route stage transitions through nextStage, expose the inline composer handle"
```

---

## Task 3: The four stage consumers

Both panels must disappear while inline, and both launchers must focus the composer instead of opening a panel. The spec's §4.10 audit found exactly these four (of thirteen `useDonnyContext()` consumers, five read `stage`; the fifth is the provider itself).

**Files:**
- Modify: `src/components/donny/DonnyDesktopPanel.tsx:38`
- Modify: `src/components/donny/DonnyMobileSheet.tsx:43`
- Modify: `src/components/DashboardLayout.tsx:236-248`
- Modify: `src/components/donny/DonnyNavButton.tsx:5-13`
- Create: `src/components/donny/DonnyNavButton.test.tsx`

**Interfaces:**
- Consumes: `stage`, `open`, `close`, `focusInlineComposer` from `useDonnyContext()`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing launcher test**

Create `src/components/donny/DonnyNavButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DonnyStage } from '@/types/donnyNudge';

const openMock = vi.fn();
const closeMock = vi.fn();
const focusInlineComposerMock = vi.fn();
const ctx = { stage: 'closed' as DonnyStage };

vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({
    stage: ctx.stage,
    open: openMock,
    close: closeMock,
    focusInlineComposer: focusInlineComposerMock,
    avatarState: 'idle',
    unreadCount: 0,
  }),
}));

import { DonnyNavButton } from './DonnyNavButton';

const tap = () => fireEvent.click(screen.getByRole('button'));

beforeEach(() => {
  vi.clearAllMocks();
  ctx.stage = 'closed';
});

describe('DonnyNavButton', () => {
  it('opens the panel when Donny is closed', () => {
    render(<DonnyNavButton />);
    tap();
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(focusInlineComposerMock).not.toHaveBeenCalled();
  });

  it('closes the panel when it is already open', () => {
    ctx.stage = 'chat';
    render(<DonnyNavButton />);
    tap();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('focuses the inline composer instead of opening a panel on the dashboard', () => {
    ctx.stage = 'inline';
    render(<DonnyNavButton />);
    tap();
    expect(focusInlineComposerMock).toHaveBeenCalledTimes(1);
    expect(openMock).not.toHaveBeenCalled();
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('keeps its tour anchor so RESTAURANT_TOUR does not orphan', () => {
    const { container } = render(<DonnyNavButton />);
    expect(container.querySelector("[data-tour='donny-help']")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch the third test fail**

```bash
npx vitest run src/components/donny/DonnyNavButton.test.tsx
```

Expected: the first, second and fourth PASS; **"focuses the inline composer" FAILS** — `close` is called because the current code treats every non-`closed` stage as open.

- [ ] **Step 3: Fix the mobile launcher**

In `src/components/donny/DonnyNavButton.tsx`, replace the click handler:

```tsx
  const { stage, open, close, focusInlineComposer } = useDonnyContext();

  const handleClick = () => {
    // On the dashboard Donny is already on the page; summoning a panel over him
    // is the duplicate surface this feature deletes.
    if (stage === 'inline') {
      focusInlineComposer();
      return;
    }
    if (stage === 'closed') {
      open();
    } else {
      close();
    }
  };
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/components/donny/DonnyNavButton.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Apply the same branch to the desktop header launcher**

`src/components/DashboardLayout.tsx` — add `focusInlineComposer` to the destructure at line 162, then replace the button's `onClick` (in the `236-248` block):

```tsx
  onClick={() => {
    if (stage === 'inline') {
      focusInlineComposer();
    } else if (stage === 'closed') {
      open();
    } else {
      close();
    }
  }}
```

Leave `data-donny-launcher` and every class untouched — `DonnyDesktopPanel`'s outside-click handler skips elements carrying that attribute, and the button is `hidden md:block`.

- [ ] **Step 6: Suppress both panel surfaces while inline**

`src/components/donny/DonnyDesktopPanel.tsx:38`:

```tsx
  // 'inline' means the dashboard is rendering its own Donny; a docked panel over
  // it would be two Donnys on one screen.
  if (stage === 'closed' || stage === 'inline') return null;
```

`src/components/donny/DonnyMobileSheet.tsx:43`:

```tsx
  if (stage === 'closed' || stage === 'inline') return null;
```

- [ ] **Step 7: Stop `DonnyMessage` closing the inline surface**

`src/components/donny/DonnyMessage.tsx` — add `stage` to the destructure at line 21, then guard the mobile close (lines 119-123):

```tsx
    // The mobile chat is a fullscreen overlay, so dismiss it before navigating.
    // Inline there is no overlay — close() is already inert, and skipping it
    // keeps the intent legible here.
    if (stage !== 'inline' && window.matchMedia('(max-width: 767px)').matches) {
      close();
    }
```

- [ ] **Step 8: Verify the whole Donny suite still passes**

```bash
npx vitest run src/components/donny/
npm run typecheck && npm run lint
```

Expected: no reduction against the Task 0 baseline. `DonnyMessage.test.tsx:19-21` mocks the context with only `close` and `sendMessage`, so `stage` is `undefined` there — `undefined !== 'inline'` is `true`, and its existing assertions still hold. Do not "fix" that mock.

- [ ] **Step 9: Commit**

```bash
git add src/components/donny/DonnyNavButton.tsx src/components/donny/DonnyNavButton.test.tsx \
        src/components/donny/DonnyDesktopPanel.tsx src/components/donny/DonnyMobileSheet.tsx \
        src/components/donny/DonnyMessage.tsx src/components/DashboardLayout.tsx
git commit -m "feat(donny): launchers focus the inline composer; panels stand down while inline"
```

---

## Task 4: `DonnyComposer`

The four reported input defects live here. It is presentational — no context, no data — which puts it in the same test tier as `DonnyHomePrompt.test.tsx` (no mocks, no wrappers).

Three constraints are load-bearing and easy to lose:

1. **Keep the `<form>` wrapper.** Existing suites drive this input with `fireEvent.submit(input.closest('form')!)`. Without a form ancestor that non-null assertion throws.
2. **Keep `aria-label="Ask Donny"`.** A `<textarea>` reports `role="textbox"`, so `getByRole('textbox', { name: /ask donny/i })` keeps working.
3. **Keep `data-tour="brief-generator"`.** RESTAURANT_TOUR step 2 targets it and `DonnyHome.test.tsx:37` asserts it.

**Files:**
- Create: `src/components/donny/inline/DonnyComposer.tsx`
- Create: `src/components/donny/inline/DonnyComposer.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  interface DonnyComposerProps {
    onSubmit: (text: string) => void;
    disabled?: boolean;
    registerRef?: (el: HTMLTextAreaElement | null) => void;
    variant?: 'resting' | 'stuck';
  }
  export function DonnyComposer(props: DonnyComposerProps): JSX.Element;
  ```
  Tasks 6 and 7 consume this.

- [ ] **Step 1: Write the failing test**

Create `src/components/donny/inline/DonnyComposer.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DonnyComposer } from './DonnyComposer';

const onSubmit = vi.fn();
const field = () => screen.getByRole('textbox', { name: /ask donny/i });

beforeEach(() => vi.clearAllMocks());

describe('DonnyComposer', () => {
  it('is a textarea, so a long prompt is visible as a whole', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    expect(field().tagName).toBe('TEXTAREA');
  });

  it('keeps the tour anchor the restaurant tour targets', () => {
    const { container } = render(<DonnyComposer onSubmit={onSubmit} />);
    expect(container.querySelector("[data-tour='brief-generator']")).toBeInTheDocument();
  });

  it('submits on Enter and clears', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'find creators near me' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('find creators near me');
    expect(field()).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter instead of submitting', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'first paragraph' } });
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('first paragraph');
  });

  it('does not submit a half-composed IME word', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'ラーメ' } });
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ignores empty and whitespace-only input', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.change(field(), { target: { value: '   ' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('trims what it submits', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: '  hello  ' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('still submits through the form, which the dashboard suites rely on', () => {
    render(<DonnyComposer onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: 'via form' } });
    fireEvent.submit(field().closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('via form');
  });

  it('sends nothing while disabled', () => {
    render(<DonnyComposer onSubmit={onSubmit} disabled />);
    fireEvent.change(field(), { target: { value: 'while streaming' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hands its element to the provider and releases it on unmount', () => {
    const registerRef = vi.fn();
    const { unmount } = render(<DonnyComposer onSubmit={onSubmit} registerRef={registerRef} />);
    expect(registerRef).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement));
    unmount();
    expect(registerRef).toHaveBeenLastCalledWith(null);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/components/donny/inline/DonnyComposer.test.tsx
```

Expected: FAIL — `Failed to resolve import "./DonnyComposer"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/donny/inline/DonnyComposer.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Grows to about eight lines, then scrolls internally. A pill cannot do this,
// which is why the composer is a rounded rectangle.
const MAX_COMPOSER_HEIGHT = 200;

interface DonnyComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  /** Lets DonnyProvider focus this field when a launcher is tapped. */
  registerRef?: (el: HTMLTextAreaElement | null) => void;
  variant?: 'resting' | 'stuck';
}

export function DonnyComposer({
  onSubmit,
  disabled = false,
  registerRef,
  variant = 'resting',
}: DonnyComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [text]);

  useEffect(() => {
    registerRef?.(ref.current);
    return () => registerRef?.(null);
  }, [registerRef]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME candidate window swallows Enter to confirm a word. Submitting here
    // would send a half-composed one — a bug DonnyChatInput and
    // MessageInputEnhanced both still have.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div data-tour="brief-generator" className="w-full">
      <form
        onSubmit={handleSubmit}
        className={cn(
          'flex w-full flex-col gap-2 rounded-3xl border-2 border-dc-teal bg-white px-4 pb-3 pt-3 shadow-dc-sm',
          'focus-within:border-dc-teal-dark focus-within:ring-2 focus-within:ring-dc-teal/40',
          variant === 'stuck' && 'shadow-lg'
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Ask Donny"
          placeholder="Ask Donny anything…"
          className="w-full resize-none bg-transparent text-base text-dc-text placeholder:text-dc-text/60 focus:outline-none lg:text-lg"
        />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-dc-text-muted sm:inline">
            Enter to send · Shift+Enter for a new line
          </span>
          <button
            type="submit"
            aria-label="Send to Donny"
            disabled={!text.trim() || disabled}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-dc-teal-btn text-white transition-colors hover:bg-dc-teal-btn-hover disabled:opacity-50"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/components/donny/inline/DonnyComposer.test.tsx
npm run typecheck && npm run lint
```

Expected: 10 passed.

> If "does not submit a half-composed IME word" fails, jsdom did not carry `isComposing` onto the native event. Assert against a `compositionstart`/`compositionend` pair instead — do **not** delete the guard.

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/inline/DonnyComposer.tsx src/components/donny/inline/DonnyComposer.test.tsx
git commit -m "feat(donny): multi-line composer with Shift+Enter and an IME guard"
```

---

## Task 5: `DonnyTurn`

One turn. The whole visual thesis lives here: **the user gets a bubble, Donny does not.** He keeps his avatar (founder decision D5) and his prose sits flat on the page, which is what stops the surface reading as a texting app.

**Files:**
- Create: `src/components/donny/inline/DonnyTurn.tsx`
- Create: `src/components/donny/inline/DonnyTurn.test.tsx`

**Interfaces:**
- Consumes: `DonnyMessage` type from `@/types/donny`; `DonnyAvatar` from `@/components/donny/DonnyAvatar`; `DonnyRichCard` from `@/components/donny/DonnyRichCard`.
- Produces:
  ```ts
  interface DonnyTurnProps {
    message: DonnyMessage;
    onRetry?: () => void;   // rendered only when provided — newest Donny turn only
  }
  export function DonnyTurn(props: DonnyTurnProps): JSX.Element;
  ```
  Task 6 consumes this.

- [ ] **Step 1: Write the failing test**

Create `src/components/donny/inline/DonnyTurn.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/donny/DonnyRichCard', () => ({
  DonnyRichCard: () => <div data-testid="rich-card" />,
}));

import { DonnyTurn } from './DonnyTurn';
import type { DonnyMessage } from '@/types/donny';

const msg = (over: Partial<DonnyMessage>): DonnyMessage =>
  ({
    id: 'm1',
    conversation_id: 'c1',
    role: 'assistant',
    content: 'Three creators near Hoboken shoot food content.',
    created_at: '2026-08-09T12:00:00Z',
    ...over,
  }) as DonnyMessage;

describe('DonnyTurn', () => {
  it('bubbles the user, so the thread reads as a document', () => {
    const { container } = render(<DonnyTurn message={msg({ role: 'user', content: 'hi' })} />);
    expect(container.querySelector('[data-turn="user"]')).toBeInTheDocument();
    expect(container.querySelector('[data-bubble="true"]')).toBeInTheDocument();
  });

  it('does not bubble Donny', () => {
    const { container } = render(<DonnyTurn message={msg({})} />);
    expect(container.querySelector('[data-turn="assistant"]')).toBeInTheDocument();
    expect(container.querySelector('[data-bubble="true"]')).not.toBeInTheDocument();
  });

  it('keeps Donny his avatar', () => {
    const { container } = render(<DonnyTurn message={msg({})} />);
    expect(container.querySelector('[data-donny-avatar]')).toBeInTheDocument();
  });

  it('gives the user no avatar', () => {
    const { container } = render(<DonnyTurn message={msg({ role: 'user', content: 'hi' })} />);
    expect(container.querySelector('[data-donny-avatar]')).not.toBeInTheDocument();
  });

  it('renders rich cards inline under the prose', () => {
    render(
      <DonnyTurn
        message={msg({ rich_cards: [{ type: 'creator_profile' }, { type: 'creator_profile' }] } as Partial<DonnyMessage>)}
      />
    );
    expect(screen.getAllByTestId('rich-card')).toHaveLength(2);
  });

  it('offers Retry only when the caller supplies a handler', () => {
    const { rerender } = render(<DonnyTurn message={msg({})} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    rerender(<DonnyTurn message={msg({})} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows no timestamp — nothing here is a message from a person', () => {
    const { container } = render(<DonnyTurn message={msg({})} />);
    expect(container.querySelector('time')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/components/donny/inline/DonnyTurn.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/components/donny/inline/DonnyTurn.tsx`. Render:

- `role === 'user'` → a right-aligned `<div data-turn="user">` containing `<div data-bubble="true">` with `bg-dc-teal/[0.06] text-dc-text rounded-2xl px-4 py-2 max-w-[80%]`. **No avatar, no timestamp.**
- otherwise → `<div data-turn="assistant" className="flex gap-3">` containing `<DonnyAvatar state="idle" size="sm" />` wrapped in a `<span data-donny-avatar>`, then a `flex-1 min-w-0` column holding the prose (reuse the markdown rendering already in `DonnyMessage.tsx:55-102` — extract it rather than re-implementing if it is self-contained), then `message.rich_cards?.map(...)` and the singular `message.rich_card`, then a Copy/Retry row.

The action row is `opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity`, with Copy always present and Retry rendered only when `onRetry` is passed. Put `group` on the assistant wrapper.

Use `dc-*` tokens throughout. No gray surfaces.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/components/donny/inline/DonnyTurn.test.tsx
npm run typecheck && npm run lint
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/inline/DonnyTurn.tsx src/components/donny/inline/DonnyTurn.test.tsx
git commit -m "feat(donny): inline turn — the user is bubbled, Donny is not"
```

---

## Task 6: `DonnyThread`

The turn list, the pending state, and the failure states. Still presentational — every input arrives as a prop, so it tests without a provider.

`donny-orchestrator` assembles its whole SSE body after the model finishes (`index.ts:564`), so there is no token-by-token reveal: one pending state covers the entire latency. It renders as Donny's avatar plus a shimmer where his prose will land.

**Files:**
- Create: `src/components/donny/inline/DonnyThread.tsx`
- Create: `src/components/donny/inline/DonnyThread.test.tsx`

**Interfaces:**
- Consumes: `DonnyTurn` (Task 5).
- Produces:
  ```ts
  interface DonnyThreadProps {
    messages: DonnyMessage[];
    isStreaming: boolean;
    streamingContent: string;
    error: string | null;
    onRetry: () => void;
  }
  export function DonnyThread(props: DonnyThreadProps): JSX.Element;
  ```
  Task 7 consumes this.

- [ ] **Step 1: Write the failing test**

Create `src/components/donny/inline/DonnyThread.test.tsx`, asserting:

1. Renders one `[data-turn]` per message, in order.
2. `isStreaming` with empty `streamingContent` → a `[data-testid="donny-pending"]` shimmer is present and **no** three-dot indicator.
3. `isStreaming` with partial `streamingContent` → that text renders (a dropped stream must not lose what arrived).
4. `error` non-null → the message renders with a Retry button, and clicking it calls `onRetry`.
5. `error` non-null **and** `streamingContent` non-empty → the partial text is still on screen next to the error.
6. Container carries `role="log"` and `aria-live="polite"`.
7. Retry is passed to the **last** assistant turn only — assert exactly one Retry button given two assistant messages.

Use the same `vi.mock('@/components/donny/DonnyRichCard', …)` stub as Task 5.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/components/donny/inline/DonnyThread.test.tsx
```

- [ ] **Step 3: Write the implementation**

Create `src/components/donny/inline/DonnyThread.tsx`. Key points:

- Root: `<div role="log" aria-live="polite" aria-label="Donny conversation" className="flex flex-col gap-6">`.
- **No `overflow-y-auto`, no `h-full`.** The thread grows in the page; `#main-content` is the scroller. This is #410 design-doc hazard 6 — `DonnyChatView` gets this wrong for an inline context.
- Map `messages` to `<DonnyTurn>`, passing `onRetry` only to the last `role === 'assistant'` message.
- Pending: when `isStreaming`, render an assistant-shaped row with the avatar and either `streamingContent` or, when empty, a shimmer bar carrying `data-testid="donny-pending"`. Animate with Tailwind `animate-pulse` and honour reduced motion via `motion-reduce:animate-none`.
- Error: an `AppCard` with `variant="inset"`, the message, and a Retry button. Never clear `streamingContent` on error.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/components/donny/inline/DonnyThread.test.tsx
npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/inline/DonnyThread.tsx src/components/donny/inline/DonnyThread.test.tsx
git commit -m "feat(donny): inline thread with a shimmer pending state and honest error recovery"
```

---

## Task 7: `DonnyCanvas`

The only stateful piece. It owns resting↔thread, claims the `'inline'` stage, registers the composer, and anchors scrolling to the real scroller.

**Two requirements are easy to break and expensive to debug:**

1. **The composer must occupy the same slot in the element tree in both states.** React reconciles by position, so a ternary that renders it in two different places remounts it — dropping half-typed text, focus, and any in-flight IME composition. Render one fixed structure and toggle wrapper classes.
2. **State starts at `resting` on every mount, regardless of message count** (decision D6). The conversation may already hold fifty turns; landing on the dashboard still shows the dashboard.

**Files:**
- Create: `src/components/donny/inline/DonnyCanvas.tsx`
- Create: `src/components/donny/inline/DonnyCanvas.test.tsx`

**Interfaces:**
- Consumes: `useDonnyContext()` — `setInline`, `exitInline`, `registerInlineComposer`, `markAllRead`, `messages`, `isStreaming`, `streamingContent`, `error`, `retry`. Plus `DonnyComposer` (Task 4) and `DonnyThread` (Task 6).

> **`markAllRead` is not currently on the context.** `DonnyProvider.tsx:140-146`
> destructures it from `useDonnyNudges()` and uses it only inside `open()`. Since
> `open()` is now inert while inline, nothing would ever clear the unread badge on
> the dashboard — the app's most-visited route — and the header would show a "3"
> whose click focuses a textarea. **Add `markAllRead: () => void` to
> `DonnyContextValue`, to the value object and its memo deps, and to
> `DONNY_FALLBACK` as a no-op, in Task 2 alongside the other four fields.** The
> canvas then calls it in the same mount effect as `setInline()` — the moment
> `open()` would have. This closes spec §4.6.
- Produces:
  ```ts
  interface DonnyCanvasProps {
    suggestions: DonnySuggestion[];
    onSuggestionTap: (s: DonnySuggestion) => void;
    onPromptSubmit: (text: string) => void;
    children?: ReactNode;   // resting-state dashboard content
  }
  export function DonnyCanvas(props: DonnyCanvasProps): JSX.Element;
  ```
  Task 8 consumes this.

- [ ] **Step 1: Write the failing test**

Create `src/components/donny/inline/DonnyCanvas.test.tsx` with a mutable context mock (the `DonnyHome.test.tsx:26-31` wrapper-object pattern). Assert:

1. `setInline` is called once on mount.
2. `exitInline` is called on unmount.
3. **With messages already present, the canvas still mounts resting** — the dashboard `children` are visible and no `[data-turn]` renders. (D6.)
4. Submitting the composer calls `onPromptSubmit` and switches to thread — `children` are gone, turns render.
5. The composer is present in **both** states, and its DOM node is the **same element** across the transition. Capture `field()` before submit, compare identity after:
   ```tsx
   const before = screen.getByRole('textbox', { name: /ask donny/i });
   fireEvent.change(before, { target: { value: 'hi' } });
   fireEvent.keyDown(before, { key: 'Enter' });
   expect(screen.getByRole('textbox', { name: /ask donny/i })).toBe(before);
   ```
   **This is the regression test for the remount hazard. Do not weaken it.**
6. A suggestion tap calls `onSuggestionTap` and also enters thread state.
7. The "← Dashboard" link appears only in thread state and points at `/dashboard/business/overview`.

Wrap renders in `<MemoryRouter>`.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/components/donny/inline/DonnyCanvas.test.tsx
```

- [ ] **Step 3: Write the implementation**

Create `src/components/donny/inline/DonnyCanvas.tsx`:

```tsx
  const { setInline, exitInline, registerInlineComposer, messages,
          isStreaming, streamingContent, error, retry } = useDonnyContext();
  const [mode, setMode] = useState<'resting' | 'thread'>('resting');

  // Claim the stage for as long as this canvas is mounted. Unconditional on
  // purpose: it also closes a panel opened on another page, because nothing
  // resets stage on navigation.
  useEffect(() => {
    setInline();
    return () => exitInline();
  }, [setInline, exitInline]);
```

Structure — note the composer sits at one fixed position:

```tsx
  <div className="flex flex-col gap-6">
    <div className={cn(mode === 'thread' && 'hidden')}>{greeting/chips slot}</div>
    <div className={cn(mode === 'resting' && 'hidden')}><DonnyThread … /></div>
    <div className={cn(mode === 'thread' && 'sticky bottom-0 z-10 bg-white pb-[env(safe-area-inset-bottom)] pt-3')}>
      <DonnyComposer
        onSubmit={handleSubmit}
        disabled={isStreaming}
        registerRef={registerInlineComposer}
        variant={mode === 'thread' ? 'stuck' : 'resting'}
      />
    </div>
    <div className={cn(mode === 'thread' && 'hidden')}>{children}</div>
  </div>
```

`handleSubmit` sets `mode` to `'thread'` **before** calling `onPromptSubmit(text)`, so the thread is mounted when the reply lands.

Scroll anchoring — copy the `landing/Header.tsx:29-38` resolution pattern:

```tsx
  useEffect(() => {
    if (mode !== 'thread') return;
    const scroller = document.getElementById('main-content');
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }, [mode, messages.length]);
```

**`streamingContent` is deliberately absent from that dependency array** — on a page-length scroller it would fight the user's own scroll on every delta. `DonnyChatView.tsx:42` includes it because it drives a short fixed-height panel.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/components/donny/inline/DonnyCanvas.test.tsx
npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/components/donny/inline/DonnyCanvas.tsx src/components/donny/inline/DonnyCanvas.test.tsx
git commit -m "feat(donny): inline canvas — resting to thread without remounting the composer"
```

---

## Task 8: Wire it into the dashboard

`DonnyHome` stops launching the panel and renders the canvas. This is where the reported defect actually disappears.

**Files:**
- Modify: `src/components/donny/DonnyHome.tsx`
- Modify: `src/components/donny/DonnyHome.test.tsx`
- Create: `src/lib/donny/donnyHomeSuggestions.test.ts`
- Delete: `src/components/donny/DonnyHomePrompt.tsx`, `src/components/donny/DonnyHomePrompt.test.tsx`

- [ ] **Step 1: Preserve the suggestion-list guarantees before deleting their test**

`DonnyHomePrompt.test.tsx:10-27` asserts there are exactly three suggestions with exact message strings, and that no label or message matches `/stats|analytics|roi/` — that guard exists because only four Donny tools verifiably work on prod. Move that `describe('BUSINESS_SUGGESTIONS')` block verbatim into a new `src/lib/donny/donnyHomeSuggestions.test.ts` (importing from `./donnyHomeSuggestions`), so deleting the component test cannot silently drop it.

- [ ] **Step 2: Run the moved test**

```bash
npx vitest run src/lib/donny/donnyHomeSuggestions.test.ts
```

Expected: PASS, unchanged.

- [ ] **Step 3: Widen the context mock in `DonnyHome.test.tsx`**

`DonnyHome.test.tsx:16-19` supplies only `openDonnyWithContext`. The canvas reads eight more fields; each would be `undefined` and throw across all 12 tests.

```tsx
const openDonnyWithContextMock = vi.fn();
const sendMessageMock = vi.fn();
const setInlineMock = vi.fn();
vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({
    openDonnyWithContext: openDonnyWithContextMock,
    sendMessage: sendMessageMock,
    setInline: setInlineMock,
    exitInline: () => {},
    registerInlineComposer: () => {},
    focusInlineComposer: () => {},
    stage: 'inline',
    messages: [],
    isStreaming: false,
    streamingContent: '',
    error: null,
    retry: () => {},
  }),
}));
```

- [ ] **Step 4: Update the two submit assertions**

`DonnyHome.test.tsx:130-135` and `:119-120` assert `openDonnyWithContextMock` was called. That is now wrong **by design** — the whole point is that submitting no longer opens the panel. Rewrite both to assert `sendMessageMock` was called with the same string, and add a new assertion that `openDonnyWithContextMock` was **not** called. Keep the `trackEvent('donny_home_prompt_submitted', {})` assertion at `:135` as-is.

`:270-271` (textbox and chips present) survive unchanged.

- [ ] **Step 5: Run and watch the two rewritten tests fail**

```bash
npx vitest run src/components/donny/DonnyHome.test.tsx
```

Expected: FAIL on the two submit tests — `DonnyHome` still calls `openDonnyWithContext`.

- [ ] **Step 6: Rewrite `DonnyHome`'s handlers and render**

Replace the three handlers (lines 121-151). `handleProposalTap`'s `route` branch is unchanged; its `message` branch and both other handlers switch to `sendMessage`:

```tsx
  const handleSuggestionTap = (suggestion: DonnySuggestion) => {
    void trackEvent('donny_home_suggestion_tapped', { label: suggestion.label });
    sendMessage(suggestion.message);
  };

  const handlePromptSubmit = (text: string) => {
    void trackEvent('donny_home_prompt_submitted', {});
    sendMessage(text);
  };
```

In the render (lines 200-220), replace `<DonnyHomePrompt … />` with `<DonnyCanvas>`, moving `DonnyHomeProposals` and the rating managers inside it as `children` so they hide in thread state. The greeting stays above.

- [ ] **Step 7: Run the suite and watch it pass**

```bash
npx vitest run src/components/donny/ src/lib/donny/
```

Expected: at or above the Task 0 baseline, minus nothing.

- [ ] **Step 8: Delete the replaced component**

```bash
git rm src/components/donny/DonnyHomePrompt.tsx src/components/donny/DonnyHomePrompt.test.tsx
grep -rn "DonnyHomePrompt" src/    # must return nothing
```

- [ ] **Step 9: Full verification**

```bash
npm run typecheck && npm run lint && npm run build
npx vitest run src/components/donny/ src/lib/donny/ src/contexts/
```

Expected: build succeeds, no new failures.

- [ ] **Step 10: Commit**

```bash
git add -A src/components/donny src/lib/donny
git commit -m "feat(donny): the dashboard answers inline instead of launching a panel"
```

---

## Task 9: Review gates and prod verification

Non-negotiable, in order. Phase 1 touches no edge function, no migration and no RLS, so `data-exposure-reviewer` and `edge-function-reviewer` do **not** apply — they are Phase 2 gates.

- [ ] **Step 1: `/simplify`** over the changed files.

- [ ] **Step 2: Codex second review**

```bash
codex review --base main --title "Donny inline canvas (Phase 1)"
```

Fix what it finds and re-run until clean. **A blank run is a failed gate, not a pass** — it needs `shell_environment_policy.inherit=all` and the sandbox off.

- [ ] **Step 3: Open the PR, merge, wait for Vercel (~1–3 min).**

- [ ] **Step 4: `verify-prod` on dragoncandy.io, both viewports.**

This is the **first** both-viewport check this surface has ever had — #410, #411 and #413 all shipped without one (`featureConfig.ts:38-46`). Expect to find Phase A bugs alongside Phase 1's.

Check, on desktop **and** mobile:

1. A multi-line prompt typed with Shift+Enter stays fully visible.
2. Enter sends; the takeover has no flicker, loses no text, and keeps focus.
3. The docked panel / bottom sheet does **not** open on the dashboard.
4. The header avatar and the nav center button both focus the composer.
5. Open the panel on `/campaigns`, navigate to `/dashboard/business` — the panel closes.
6. The thread matches what the panel shows on another route.
7. Reload — you land on the dashboard, not mid-thread (D6).
8. The unread badge clears on dashboard arrival.
9. No console errors on either viewport.

> Verify on **prod**, not staging — staging is drift-corrupted, so its green smoke gate is false assurance. Test credentials are in the project memory system; never type them yourself.

- [ ] **Step 5: `knowledge-sync`** — wiki session source, `/wiki-ops ingest`, prepend to `docs/SHIPPED_LOG.md`, update `PROJECT_CONTEXT.md` §5 index line and §4, then sync Donny's RAG after merge.

---

## Out of scope

Do not build these here. Each is specified in the design doc.

- Attachments — the `+` control, the migration, the bucket, the `donny-orchestrator` changes (Phase 2, spec §5).
- Creator and brand dashboards, and their `/overview` routes (Phase 3, spec §6).
- An `AbortController` for `useDonny`'s send (spec §4.10, hazard 5 — accepted as contract).
- Changing how the docked panel or mobile sheet *render*; only their triggering changes.
- Fixing the IME bug in `DonnyChatInput`, `MessageInputEnhanced`, or `SmartInput`.
- Thread pagination or virtualization.
- Real token-by-token streaming.
