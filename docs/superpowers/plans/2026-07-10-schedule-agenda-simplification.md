# Schedule / Calendar Agenda-First Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scheduling experience simplest-possible — one scrolling Agenda list + one "＋ Schedule" button as the default on both mobile and desktop — while keeping the desktop Week/Month grids as an optional toggle and fixing the Review panel's dead-ends.

**Architecture:** A pure, unit-tested `AgendaItem` model + adapters normalize two different data sources (Outstand `Post`, campaign deadlines) into one presentational `AgendaView`. `CalendarTab` renders `AgendaView` as its default view (replacing the mobile day-strip; adding a desktop toggle). The campaign `ScheduleReviewScreen` keeps its existing `PostCard` list and just drops the overlapping `ScheduleTimeline` and fixes its states. Frontend-only — no schema/edge/data changes.

**Tech Stack:** React 18 + TypeScript (strict), Tailwind (`dc-*` tokens), shadcn/ui (`Sheet`, `Popover`), Vitest + @testing-library/react, react-router-dom.

**Spec:** `docs/superpowers/specs/2026-07-10-schedule-agenda-simplification-design.md`

## Global Constraints

- **TypeScript strict.** No `any`. Named exports for components; no default export except pages.
- **Styling:** Tailwind `dc-*` tokens; pill buttons (`rounded-full`); brand-adjacent neutrals — no flat-gray badges/banners (per "no gray" rule). Match existing calendar styling where already present.
- **Viewport discipline:** mobile changes use base classes; desktop uses `md:`/`lg:`. Never cross-apply. **Do not touch the working desktop grid `lg:`/`md:` layout** (`DayGrid`/`WeekGrid`/`MonthGrid` internals stay, except the Month-chips task).
- **No schema / edge-function / data-layer change.** Frontend only.
- **Tests:** co-located `*.test.ts(x)`; header `// @vitest-environment jsdom` for DOM tests; `import { describe, it, expect } from 'vitest'`; wrap routed components in `MemoryRouter`.
- **ESLint:** only `console.error` / `console.warn`. Prefix intentionally-unused vars with `_`.
- **Build gate:** `npm run build` must pass before each commit; run `npm run test` for touched tests.
- Run each command from the worktree: `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\DC-20`.

---

### Task 1: Agenda model (pure functions)

**Files:**
- Create: `src/components/schedule/agenda/agendaModel.ts`
- Test: `src/components/schedule/agenda/agendaModel.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type AgendaItemKind = 'post' | 'deadline'`
  - `interface AgendaItem { id: string; date: string; kind: AgendaItemKind; title: string; platform?: string; contentType?: string; status?: string; onClick?: () => void }`
  - `interface AgendaDay { dateKey: string; date: Date; items: AgendaItem[] }`
  - `function startOfDay(d: Date): Date`
  - `function dateKey(d: Date): string`
  - `function groupByDay(items: AgendaItem[], opts?: { from?: Date }): AgendaDay[]`
  - `function relativeDayLabel(date: Date, today: Date): string`
  - `function contentTypeEmoji(contentType?: string): string`
  - `function monthMatrix(year: number, month: number): (Date | null)[][]`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/schedule/agenda/agendaModel.test.ts
import { describe, it, expect } from 'vitest';
import {
  groupByDay, relativeDayLabel, contentTypeEmoji, monthMatrix, dateKey, startOfDay,
  type AgendaItem,
} from './agendaModel';

// Local ISO round-trips through the runner's own tz, so getDate() is stable.
const iso = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).toISOString();
const post = (id: string, date: string, extra: Partial<AgendaItem> = {}): AgendaItem =>
  ({ id, date, kind: 'post', title: id, ...extra });

describe('startOfDay / dateKey', () => {
  it('zeroes the time and builds a local key', () => {
    const d = new Date(2026, 6, 10, 15, 30);
    expect(startOfDay(d).getHours()).toBe(0);
    expect(dateKey(d)).toBe('2026-6-10');
  });
});

describe('groupByDay', () => {
  it('groups by day, drops days before `from`, sorts days and items ascending', () => {
    const items = [
      post('a', iso(2026, 6, 10, 15)),
      post('b', iso(2026, 6, 11, 12)),
      post('c', iso(2026, 6, 10, 9)),
      post('past', iso(2026, 6, 1, 9)),
    ];
    const days = groupByDay(items, { from: new Date(2026, 6, 10) });
    expect(days.map((d) => d.dateKey)).toEqual(['2026-6-10', '2026-6-11']);
    expect(days[0].items.map((i) => i.id)).toEqual(['c', 'a']); // 9am before 3pm
    expect(days[1].items.map((i) => i.id)).toEqual(['b']);
  });

  it('skips items with an invalid timestamp', () => {
    const days = groupByDay([post('bad', 'not-a-date'), post('ok', iso(2026, 6, 10))]);
    expect(days.flatMap((d) => d.items.map((i) => i.id))).toEqual(['ok']);
  });
});

describe('relativeDayLabel', () => {
  const today = new Date(2026, 6, 10);
  it('labels today and tomorrow', () => {
    expect(relativeDayLabel(new Date(2026, 6, 10), today)).toBe('Today');
    expect(relativeDayLabel(new Date(2026, 6, 11), today)).toBe('Tomorrow');
  });
  it('labels other days with the date number', () => {
    expect(relativeDayLabel(new Date(2026, 6, 13), today)).toMatch(/13/);
  });
});

describe('contentTypeEmoji', () => {
  it('maps known types and falls back', () => {
    expect(contentTypeEmoji('video_reel')).toBe('🎬');
    expect(contentTypeEmoji('carousel')).toBe('📱');
    expect(contentTypeEmoji(undefined)).toBe('📸');
  });
});

describe('monthMatrix', () => {
  it('lays out July 2026 Monday-first with leading nulls', () => {
    const weeks = monthMatrix(2026, 6); // July (Jul 1 2026 is a Wednesday)
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toBeNull();
    expect(weeks[0][2]?.getDate()).toBe(1);
    expect(weeks[0][6]?.getDate()).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/agenda/agendaModel.test.ts`
Expected: FAIL — cannot resolve `./agendaModel`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/schedule/agenda/agendaModel.ts
export type AgendaItemKind = 'post' | 'deadline';

export interface AgendaItem {
  id: string;
  date: string; // ISO
  kind: AgendaItemKind;
  title: string;
  platform?: string;
  contentType?: string;
  status?: string;
  onClick?: () => void;
}

export interface AgendaDay {
  dateKey: string;
  date: Date;
  items: AgendaItem[];
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function groupByDay(items: AgendaItem[], opts: { from?: Date } = {}): AgendaDay[] {
  const fromKeyTime = opts.from ? startOfDay(opts.from).getTime() : null;
  const buckets = new Map<string, AgendaDay>();

  for (const item of items) {
    const d = new Date(item.date);
    if (isNaN(d.getTime())) continue;
    if (fromKeyTime !== null && startOfDay(d).getTime() < fromKeyTime) continue;
    const key = dateKey(d);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { dateKey: key, date: startOfDay(d), items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(item);
  }

  const days = Array.from(buckets.values());
  days.sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const day of days) {
    day.items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  return days;
}

export function relativeDayLabel(date: Date, today: Date): string {
  const k = dateKey(date);
  if (k === dateKey(today)) return 'Today';
  const tomorrow = startOfDay(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (k === dateKey(tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const CONTENT_EMOJI: Record<string, string> = {
  photo: '📸',
  video_reel: '🎬',
  carousel: '📱',
  story: '📱',
  tiktok: '🎬',
  youtube_short: '🎬',
};

export function contentTypeEmoji(contentType?: string): string {
  if (!contentType) return '📸';
  return CONTENT_EMOJI[contentType] ?? '📸';
}

export function monthMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon = 0
  const totalDays = lastDay.getDate();
  const weeks: (Date | null)[][] = [];
  let current = 1 - startDow;
  for (let w = 0; w < 6; w++) {
    const week: (Date | null)[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(current >= 1 && current <= totalDays ? new Date(year, month, current) : null);
      current++;
    }
    if (week.every((d) => d === null)) break;
    weeks.push(week);
  }
  return weeks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/agenda/agendaModel.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/agenda/agendaModel.ts src/components/schedule/agenda/agendaModel.test.ts
git commit -m "feat(schedule): pure agenda model (grouping, labels, month matrix)"
```

---

### Task 2: Agenda adapters (Outstand post + deadline → AgendaItem)

**Files:**
- Create: `src/components/schedule/agenda/agendaAdapters.ts`
- Test: `src/components/schedule/agenda/agendaAdapters.test.ts`

**Interfaces:**
- Consumes: `AgendaItem` from `agendaModel`; `Post` from `@outstand-so/ui`; `CampaignDeadline` from `@/components/outstand/CalendarTab`; `getCaption`, `getUniqueNetworks` from `@/components/outstand/postUtils`; `isScheduled` from `@/lib/outstandUtils`.
- Produces:
  - `function outstandPostToAgendaItem(post: Post): AgendaItem | null` (null when no timestamp)
  - `function deadlineToAgendaItem(d: CampaignDeadline): AgendaItem`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/schedule/agenda/agendaAdapters.test.ts
import { describe, it, expect } from 'vitest';
import type { Post } from '@outstand-so/ui';
import { outstandPostToAgendaItem, deadlineToAgendaItem } from './agendaAdapters';

const makePost = (over: Partial<Post> = {}): Post =>
  ({
    id: 'p1',
    scheduledAt: new Date(2026, 6, 10, 9).toISOString(),
    publishedAt: null,
    socialAccounts: [{ id: 'sa1', network: 'instagram', status: 'scheduled' }],
    containers: [{ content: 'Café Symphony' }],
    ...over,
  }) as unknown as Post;

describe('outstandPostToAgendaItem', () => {
  it('maps caption, platform, status and id', () => {
    const item = outstandPostToAgendaItem(makePost());
    expect(item).not.toBeNull();
    expect(item!.id).toBe('p1');
    expect(item!.title).toBe('Café Symphony');
    expect(item!.platform).toBe('instagram');
    expect(item!.kind).toBe('post');
    expect(item!.status).toBe('scheduled');
  });

  it('falls back to a title when caption is empty', () => {
    const item = outstandPostToAgendaItem(makePost({ containers: [] } as unknown as Partial<Post>));
    expect(item!.title).toBe('Untitled post');
  });

  it('returns null when there is no timestamp', () => {
    const item = outstandPostToAgendaItem(
      makePost({ scheduledAt: null, publishedAt: null } as unknown as Partial<Post>),
    );
    expect(item).toBeNull();
  });
});

describe('deadlineToAgendaItem', () => {
  it('maps a campaign deadline', () => {
    const item = deadlineToAgendaItem({
      id: 'd1', title: 'Café Symphony', deadline: new Date(2026, 6, 13), campaignId: 'c1',
    });
    expect(item.kind).toBe('deadline');
    expect(item.title).toBe('Café Symphony');
    expect(item.id).toBe('deadline-d1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/agenda/agendaAdapters.test.ts`
Expected: FAIL — cannot resolve `./agendaAdapters`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/schedule/agenda/agendaAdapters.ts
import type { Post } from '@outstand-so/ui';
import type { CampaignDeadline } from '@/components/outstand/CalendarTab';
import { getCaption, getUniqueNetworks } from '@/components/outstand/postUtils';
import { isScheduled } from '@/lib/outstandUtils';
import type { AgendaItem } from './agendaModel';

export function outstandPostToAgendaItem(post: Post): AgendaItem | null {
  const stamp = post.scheduledAt ?? post.publishedAt;
  if (!stamp) return null;
  return {
    id: post.id,
    date: stamp,
    kind: 'post',
    title: getCaption(post) || 'Untitled post',
    platform: getUniqueNetworks(post)[0],
    status: isScheduled(post) ? 'scheduled' : 'published',
  };
}

export function deadlineToAgendaItem(d: CampaignDeadline): AgendaItem {
  return {
    id: `deadline-${d.id}`,
    date: d.deadline.toISOString(),
    kind: 'deadline',
    title: d.title,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/agenda/agendaAdapters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/agenda/agendaAdapters.ts src/components/schedule/agenda/agendaAdapters.test.ts
git commit -m "feat(schedule): adapters mapping Outstand posts + deadlines to AgendaItem"
```

---

### Task 3: `AgendaView` presentational component

**Files:**
- Create: `src/components/schedule/agenda/AgendaView.tsx`
- Test: `src/components/schedule/agenda/AgendaView.test.tsx`

**Interfaces:**
- Consumes: `AgendaDay`, `AgendaItem`, `relativeDayLabel`, `contentTypeEmoji` from `agendaModel`; `MonthJumpControl` from `./MonthJumpControl` (Task 4 — a stub is created here first so this task builds; Task 4 fills it in).
- Produces:
  - `interface AgendaViewProps { days: AgendaDay[]; today: Date; anchorDate: Date; onJumpToDate?: (d: Date) => void; onTodayClick?: () => void; onScheduleClick?: () => void; hasContentOn?: (d: Date) => boolean; variant?: 'mobile' | 'desktop'; emptyState?: React.ReactNode }`
  - `function AgendaView(props: AgendaViewProps): JSX.Element`

- [ ] **Step 1: Create a minimal `MonthJumpControl` stub so this task compiles**

```tsx
// src/components/schedule/agenda/MonthJumpControl.tsx  (STUB — completed in Task 4)
export interface MonthJumpControlProps {
  anchorDate: Date;
  onSelect: (d: Date) => void;
  hasContentOn?: (d: Date) => boolean;
  variant?: 'mobile' | 'desktop';
}

export function MonthJumpControl({ anchorDate }: MonthJumpControlProps) {
  return (
    <span className="font-bold text-dc-teal text-base">
      {anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
    </span>
  );
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/schedule/agenda/AgendaView.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgendaView } from './AgendaView';
import type { AgendaDay } from './agendaModel';

const days: AgendaDay[] = [
  {
    dateKey: '2026-6-10',
    date: new Date(2026, 6, 10),
    items: [
      { id: 'a', date: new Date(2026, 6, 10, 9).toISOString(), kind: 'post', title: 'Café Symphony', platform: 'instagram', status: 'scheduled' },
    ],
  },
];

describe('AgendaView', () => {
  it('renders day headers, items, and fires schedule + today', () => {
    const onSchedule = vi.fn();
    const onToday = vi.fn();
    render(
      <AgendaView
        days={days}
        today={new Date(2026, 6, 10)}
        anchorDate={new Date(2026, 6, 10)}
        onScheduleClick={onSchedule}
        onTodayClick={onToday}
      />,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Café Symphony')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }));
    expect(onSchedule).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^today$/i }));
    expect(onToday).toHaveBeenCalled();
  });

  it('shows the empty state when there are no days', () => {
    render(
      <AgendaView
        days={[]}
        today={new Date(2026, 6, 10)}
        anchorDate={new Date(2026, 6, 10)}
        emptyState={<div>Nothing scheduled yet</div>}
      />,
    );
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/agenda/AgendaView.test.tsx`
Expected: FAIL — cannot resolve `./AgendaView`.

- [ ] **Step 4: Write minimal implementation**

```tsx
// src/components/schedule/agenda/AgendaView.tsx
import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgendaDay, AgendaItem, relativeDayLabel, contentTypeEmoji } from './agendaModel';
import { MonthJumpControl } from './MonthJumpControl';

export interface AgendaViewProps {
  days: AgendaDay[];
  today: Date;
  anchorDate: Date;
  onJumpToDate?: (d: Date) => void;
  onTodayClick?: () => void;
  onScheduleClick?: () => void;
  hasContentOn?: (d: Date) => boolean;
  variant?: 'mobile' | 'desktop';
  emptyState?: React.ReactNode;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function AgendaItemRow({ item }: { item: AgendaItem }) {
  if (item.kind === 'deadline') {
    return (
      <div className="bg-dc-pink/10 border border-dc-pink/40 rounded-2xl px-4 py-3 mb-2">
        <p className="text-[10px] font-bold text-dc-pink-accent uppercase tracking-wide">⚑ Campaign deadline</p>
        <p className="text-sm font-semibold text-dc-text truncate">{item.title}</p>
      </div>
    );
  }
  const time = formatTime(item.date);
  const platform = item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : '';
  return (
    <button
      type="button"
      onClick={item.onClick}
      className="w-full flex items-center gap-3 bg-white border border-dc-teal/15 rounded-2xl p-3 mb-2 text-left min-h-[56px] hover:border-dc-teal transition-colors"
    >
      <span className="w-10 h-10 rounded-xl bg-dc-teal/15 flex items-center justify-center text-lg shrink-0">
        {contentTypeEmoji(item.contentType)}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-sm text-dc-text truncate">{item.title}</span>
        <span className="block text-xs text-dc-text-muted mt-0.5">
          {[time, platform].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  );
}

export function AgendaView({
  days, today, anchorDate, onJumpToDate, onTodayClick, onScheduleClick, hasContentOn, variant = 'mobile', emptyState,
}: AgendaViewProps) {
  const isEmpty = days.length === 0;
  return (
    <div>
      {/* Sticky header: month-jump (left) + Today + Schedule (right) */}
      <div className="sticky top-0 z-10 bg-white flex items-center justify-between gap-2 pb-3 mb-1">
        <MonthJumpControl
          anchorDate={anchorDate}
          onSelect={onJumpToDate ?? (() => {})}
          hasContentOn={hasContentOn}
          variant={variant}
        />
        <div className="flex items-center gap-2">
          {onTodayClick && (
            <button
              type="button"
              onClick={onTodayClick}
              className="text-xs font-bold text-dc-teal border border-dc-teal bg-dc-teal/5 rounded-full px-4 py-2"
            >
              Today
            </button>
          )}
          {onScheduleClick && (
            <button
              type="button"
              onClick={onScheduleClick}
              className="flex items-center gap-1 bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full px-4 py-2 text-xs font-bold transition-colors"
            >
              <Plus className="w-4 h-4" /> Schedule
            </button>
          )}
        </div>
      </div>

      {isEmpty ? (
        emptyState ?? (
          <div className="text-center py-14 text-sm text-dc-text-muted">Nothing scheduled yet.</div>
        )
      ) : (
        <div className={cn(variant === 'desktop' && 'max-w-xl')}>
          {days.map((day) => (
            <div key={day.dateKey}>
              <div className="text-[11px] font-bold text-dc-teal uppercase tracking-wide mt-5 mb-2">
                {relativeDayLabel(day.date, today)}
              </div>
              {day.items.map((item) => (
                <AgendaItemRow key={item.id} item={item} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/agenda/AgendaView.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/agenda/AgendaView.tsx src/components/schedule/agenda/MonthJumpControl.tsx src/components/schedule/agenda/AgendaView.test.tsx
git commit -m "feat(schedule): AgendaView list component + MonthJumpControl stub"
```

---

### Task 4: `MonthJumpControl` (jump to any date)

**Files:**
- Modify: `src/components/schedule/agenda/MonthJumpControl.tsx` (replace the stub)
- Test: `src/components/schedule/agenda/MonthJumpControl.test.tsx`

**Interfaces:**
- Consumes: `monthMatrix`, `dateKey` from `agendaModel`; `Sheet`/`SheetContent`/`SheetTrigger` from `@/components/ui/sheet`; `Popover`/`PopoverContent`/`PopoverTrigger` from `@/components/ui/popover`; `ChevronLeft`/`ChevronRight`/`ChevronDown` from `lucide-react`.
- Produces: unchanged `MonthJumpControlProps` + `MonthJumpControl` (now interactive).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/schedule/agenda/MonthJumpControl.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MonthJumpControl } from './MonthJumpControl';

describe('MonthJumpControl', () => {
  it('shows the anchor month on the trigger and selects a day', () => {
    const onSelect = vi.fn();
    render(
      <MonthJumpControl anchorDate={new Date(2026, 6, 10)} onSelect={onSelect} variant="desktop" />,
    );
    const trigger = screen.getByRole('button', { name: /july 2026/i });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    // day 18 is present in the opened month grid
    fireEvent.click(screen.getByRole('button', { name: '18' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const picked = onSelect.mock.calls[0][0] as Date;
    expect(picked.getDate()).toBe(18);
    expect(picked.getMonth()).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/agenda/MonthJumpControl.test.tsx`
Expected: FAIL — stub renders a `<span>`, no trigger button / no day buttons.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/schedule/agenda/MonthJumpControl.tsx
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { monthMatrix, dateKey } from './agendaModel';

export interface MonthJumpControlProps {
  anchorDate: Date;
  onSelect: (d: Date) => void;
  hasContentOn?: (d: Date) => boolean;
  variant?: 'mobile' | 'desktop';
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function MonthGridPicker({
  anchorDate, onPick, hasContentOn,
}: {
  anchorDate: Date;
  onPick: (d: Date) => void;
  hasContentOn?: (d: Date) => boolean;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
  const today = new Date();
  const weeks = monthMatrix(viewMonth.getFullYear(), viewMonth.getMonth());
  const shift = (delta: number) =>
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-dc-teal/10">
          <ChevronLeft className="w-4 h-4 text-dc-text-muted" />
        </button>
        <span className="text-sm font-bold text-dc-text">
          {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-dc-teal/10">
          <ChevronRight className="w-4 h-4 text-dc-text-muted" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-[9px] font-bold text-dc-text-muted text-center">{w}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) =>
            day ? (
              <button
                key={di}
                type="button"
                onClick={() => onPick(day)}
                className={cn(
                  'aspect-square rounded-lg text-xs flex flex-col items-center justify-center hover:bg-dc-teal/10',
                  dateKey(day) === dateKey(today) ? 'text-dc-teal font-bold ring-1 ring-dc-teal' : 'text-dc-text',
                )}
              >
                {day.getDate()}
                {hasContentOn?.(day) && <span className="w-1 h-1 rounded-full bg-dc-teal mt-0.5" />}
              </button>
            ) : (
              <div key={di} className="aspect-square" />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function MonthJumpControl({ anchorDate, onSelect, hasContentOn, variant = 'mobile' }: MonthJumpControlProps) {
  const [open, setOpen] = useState(false);
  const label = anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const handlePick = (d: Date) => {
    onSelect(d);
    setOpen(false);
  };
  const trigger = (
    <button type="button" className="flex items-center gap-1 font-bold text-dc-teal text-base">
      {label}
      <ChevronDown className="w-4 h-4" />
    </button>
  );

  if (variant === 'desktop') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <MonthGridPicker anchorDate={anchorDate} onPick={handlePick} hasContentOn={hasContentOn} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl pb-8">
        <p className="text-sm font-bold text-dc-text mb-2 mt-2">Jump to date</p>
        <MonthGridPicker anchorDate={anchorDate} onPick={handlePick} hasContentOn={hasContentOn} />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/agenda/MonthJumpControl.test.tsx`
Expected: PASS. (If Radix Popover portal content is not found in jsdom, the test already uses `align`/default behavior; the content renders on click. Keep the assertion on the day button role/name.)

- [ ] **Step 5: Run the whole agenda folder + build**

Run: `npx vitest run src/components/schedule/agenda` then `npm run build`
Expected: tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/agenda/MonthJumpControl.tsx src/components/schedule/agenda/MonthJumpControl.test.tsx
git commit -m "feat(schedule): interactive MonthJumpControl (sheet on mobile, popover on desktop)"
```

---

### Task 5: Integrate Agenda as the default view in `CalendarTab`

**Files:**
- Modify: `src/components/outstand/CalendarTab.tsx`

**Interfaces:**
- Consumes: `AgendaView` (Task 3), `groupByDay`/`startOfDay` (Task 1), `outstandPostToAgendaItem`/`deadlineToAgendaItem` (Task 2), existing `postsForDay`/`isSameDay` from `./calendar/calendarUtils`.
- Produces: `CalendarView` now includes `'agenda'`; `CalendarTab` renders `AgendaView` on both breakpoints by default. (No signature change yet; `onSchedule` prop added in Task 6.)

- [ ] **Step 1: Add `'agenda'` to the view type and default to it**

In `src/components/outstand/CalendarTab.tsx`:

```tsx
type CalendarView = 'agenda' | 'day' | 'week' | 'month';
```

```tsx
const [view, setView] = useState<CalendarView>('agenda');
```

- [ ] **Step 2: Add imports**

```tsx
import { AgendaView } from '@/components/schedule/agenda/AgendaView';
import { groupByDay, startOfDay, type AgendaItem } from '@/components/schedule/agenda/agendaModel';
import { outstandPostToAgendaItem, deadlineToAgendaItem } from '@/components/schedule/agenda/agendaAdapters';
```

Also extend the existing `./calendar/calendarUtils` import — `CalendarTab` currently imports only `isScheduled` (from `@/lib/outstandUtils`) and does **not** import `postsForDay`/`isSameDay`, which Step 3 needs:

```tsx
import { isScheduled } from '@/lib/outstandUtils';
import { postsForDay, isSameDay } from './calendar/calendarUtils';
```

- [ ] **Step 3: Build the agenda data + helpers (place after `filteredPosts`)**

```tsx
const agendaItems = useMemo<AgendaItem[]>(() => {
  const postItems = filteredPosts
    .map((p) => {
      const item = outstandPostToAgendaItem(p);
      if (item) item.onClick = () => handlePostClick(p);
      return item;
    })
    .filter((x): x is AgendaItem => x !== null);
  const deadlineItems = campaignDeadlines.map(deadlineToAgendaItem);
  return [...postItems, ...deadlineItems];
}, [filteredPosts, campaignDeadlines, handlePostClick]);

const agendaDays = useMemo(
  () => groupByDay(agendaItems, { from: startOfDay(currentDate) }),
  [agendaItems, currentDate],
);

const hasContentOn = useCallback(
  (day: Date) =>
    postsForDay(filteredPosts, day).length > 0 ||
    campaignDeadlines.some((d) => isSameDay(d.deadline, day)),
  [filteredPosts, campaignDeadlines],
);
```

> Note: `handlePostClick` is defined below its first use here; move the `agendaItems` memo to sit **after** the existing `handlePostClick` declaration (it already exists near the other callbacks). Keep all hooks above the early `isLoading` return.

- [ ] **Step 4: Add an "Agenda" toggle button (desktop) as the first option**

Inside the existing `hidden md:flex gap-1` toolbar group, add before the Day button:

```tsx
<button
  type="button"
  onClick={() => setView('agenda')}
  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === 'agenda' ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'}`}
>
  Agenda
</button>
```

- [ ] **Step 5: Hide the chevron header when in agenda view**

Wrap the existing navigation header block (`<div className="flex items-center justify-between mb-3">…</div>` containing the prev/next chevrons + `headerLabel` + the `hidden md:flex` toggle group) so the chevron/label portion is hidden in agenda view but the toggle group stays reachable on desktop. Concretely, keep the outer row, but render the left chevron+label group only when `view !== 'agenda'`:

```tsx
<div className="flex items-center justify-between mb-3">
  {view !== 'agenda' ? (
    <div className="flex items-center gap-2">
      {/* existing prev button, headerLabel span, next button — unchanged */}
    </div>
  ) : <div />}
  <div className="hidden md:flex gap-1">
    {/* Agenda + Day + Week + Month + Today buttons */}
  </div>
</div>
```

- [ ] **Step 6: Render AgendaView for the agenda view; remove the mobile `DayStrip`**

Replace the "Desktop views" conditional block AND the mobile `DayStrip` block with:

```tsx
{view === 'agenda' ? (
  <AgendaView
    days={agendaDays}
    today={new Date()}
    anchorDate={currentDate}
    onJumpToDate={(d) => { setCurrentDate(d); setSelectedDay(d); }}
    onTodayClick={goToToday}
    onScheduleClick={() => onSwitchTab?.('compose')}
    hasContentOn={hasContentOn}
    variant="desktop"
    emptyState={
      <div className="text-center py-14">
        <p className="text-sm text-dc-text-muted mb-3">Nothing scheduled yet.</p>
      </div>
    }
  />
) : view === 'day' ? (
  <DayGrid /* …existing props… */ />
) : view === 'week' ? (
  <WeekGrid /* …existing props… */ />
) : (
  <MonthGrid /* …existing props… */ />
)}
```

Delete the `<DayStrip … />` JSX block entirely (the component file stays but is no longer mounted here). Remove the now-unused `DayStrip` import. Update `goToToday` to `setView('agenda')` instead of `setView('day')` so "Today" keeps the user in the agenda:

```tsx
const goToToday = useCallback(() => {
  const today = new Date();
  setCurrentDate(today);
  setSelectedDay(today);
  setView('agenda');
}, []);
```

> The `variant="desktop"` above renders fine on mobile too (it only widens the max-width). Because the toggle group is `hidden md:flex`, mobile can never leave `'agenda'`, so mobile is single-view by design. The desktop legend + `DonnyWeeklyPlanner` below stay unchanged.

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no unused-var errors (confirm `DayStrip` import removed; `headerLabel` still used by non-agenda views), build succeeds.

- [ ] **Step 8: Manual verification (both viewports)**

- Mobile (≤767px): calendar opens to the Agenda list; scroll shows upcoming days; tap month → sheet opens, pick a date → list jumps; "Today" returns to today. No day-strip, no tiny chevrons.
- Desktop (≥768px): opens to Agenda; toggle to Week/Month/Day still works and grids + drag-to-reschedule behave as before; toggling back to Agenda works.

- [ ] **Step 9: Commit**

```bash
git add src/components/outstand/CalendarTab.tsx
git commit -m "feat(schedule): Agenda is the default calendar view (mobile replaces day-strip; desktop toggle)"
```

---

### Task 6: Wire "＋ Schedule" to the composer (fix the dead-end)

**Files:**
- Modify: `src/components/outstand/CalendarTab.tsx` (add `onSchedule` prop + resolution)
- Modify: `src/pages/ContentCalendar.tsx` (pass a navigating `onSchedule`)

**Interfaces:**
- Consumes: `CalendarTabProps` from Task 5.
- Produces: `CalendarTabProps` gains `onSchedule?: () => void`; `AgendaView.onScheduleClick` resolves to `onSchedule ?? (() => onSwitchTab?.('compose'))`.

- [ ] **Step 1: Add the prop to `CalendarTab`**

In `CalendarTabProps`:

```tsx
onSchedule?: () => void;
```

Destructure `onSchedule` in the component signature, and change the AgendaView prop:

```tsx
onScheduleClick={onSchedule ?? (() => onSwitchTab?.('compose'))}
```

- [ ] **Step 2: Pass a navigating handler from the standalone page**

In `src/pages/ContentCalendar.tsx`, add the router hook and a role→path map, then pass `onSchedule`:

```tsx
import { useSearchParams, useNavigate } from 'react-router-dom';
```

```tsx
const navigate = useNavigate();
const roleSeg = role === 'business_client' ? 'business' : role === 'brand' ? 'brand' : 'creator';
```

```tsx
<CalendarTab
  posts={posts}
  isLoading={isLoading}
  onChanged={() => refetch()}
  campaignDeadlines={deadlines ?? []}
  initialDate={initialDate}
  onPostClick={handlePostClick}
  onSchedule={() => navigate(`/dashboard/${roleSeg}/social?tab=compose`)}
/>
```

> `OutstandManager` already passes `onSwitchTab`, so its "＋ Schedule" keeps working via the fallback with no change there.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 4: Manual verification**

- On `/calendar` (standalone), tap "＋ Schedule" → navigates to the social manager's Compose tab (previously did nothing).
- In the social manager's Calendar tab, "＋ Schedule" switches to Compose as before.

- [ ] **Step 5: Commit**

```bash
git add src/components/outstand/CalendarTab.tsx src/pages/ContentCalendar.tsx
git commit -m "fix(schedule): +Schedule opens the composer on every surface (kills the calendar dead-end)"
```

---

### Task 7: Fix the campaign `ScheduleReviewScreen` (remove overlap, fix states)

**Files:**
- Modify: `src/components/schedule/ScheduleReviewScreen.tsx`
- Test: `src/components/schedule/ScheduleReviewScreen.test.tsx`

**Interfaces:**
- Consumes: `useScheduledPosts` (mocked in the test), existing `ScheduleStatsRow`, `PostCard`.
- Produces: no signature change. Removes `ScheduleTimeline` usage; conditional header badge; friendly empty state; footer only when there is something to confirm.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/schedule/ScheduleReviewScreen.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScheduleReviewScreen } from './ScheduleReviewScreen';
import type { ScheduledPost } from '@/hooks/useScheduledPosts';

const mockUse = vi.fn();
vi.mock('@/hooks/useScheduledPosts', () => ({
  useScheduledPosts: (...args: unknown[]) => mockUse(...args),
}));

const basePost: ScheduledPost = {
  id: 'p1', user_id: 'u1', campaign_id: 'c1', platform: 'instagram', content_type: 'photo',
  caption: 'Hello', media_urls: null, hashtags: null, scheduled_at: new Date(2026, 6, 10, 9).toISOString(),
  published_at: null, status: 'scheduled', ai_suggested_time: true, ai_reasoning: null, metadata: null,
  plan_group_id: null, plan_order: 1, deliverable_id: null, created_at: new Date(2026, 6, 1).toISOString(),
};

describe('ScheduleReviewScreen', () => {
  it('empty state explains and offers an action instead of a dead disabled button', () => {
    mockUse.mockReturnValue({ data: [], isLoading: false });
    render(
      <ScheduleReviewScreen open onOpenChange={() => {}} campaignId="c1" campaignTitle="Café Symphony" connectedPlatformCount={2} />,
    );
    expect(screen.getByText(/no posts scheduled yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm & schedule all posts/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to campaign/i })).toBeInTheDocument();
    // The "Donny Optimized" badge is hidden when there is nothing scheduled.
    expect(screen.queryByText(/donny optimized/i)).not.toBeInTheDocument();
  });

  it('populated state shows posts, the confirm button, and no timeline overlap element', () => {
    mockUse.mockReturnValue({ data: [basePost], isLoading: false });
    render(
      <ScheduleReviewScreen open onOpenChange={() => {}} campaignId="c1" campaignTitle="Café Symphony" connectedPlatformCount={2} />,
    );
    expect(screen.getByText(/donny optimized/i)).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & schedule all posts/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/ScheduleReviewScreen.test.tsx`
Expected: FAIL — current empty state has no "Back to campaign" button and always renders the confirm button + badge.

- [ ] **Step 3: Edit `ScheduleReviewScreen.tsx`**

1. Remove the import and usage of `ScheduleTimeline`:

```tsx
// delete: import { ScheduleTimeline } from './ScheduleTimeline';
```

and delete the `<div className="mt-4"><ScheduleTimeline …/></div>` block.

2. Make the header count + badge honest and conditional. Replace the header's meta row with:

```tsx
{posts.length > 0 && (
  <div className="flex items-center gap-2 mt-1">
    <span className="text-xs text-dc-text-muted">
      {posts.length} post{posts.length !== 1 ? 's' : ''}
    </span>
    <span className="bg-dc-teal/10 text-dc-teal text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
      <Sparkles className="w-3 h-3" />
      Donny Optimized
    </span>
  </div>
)}
```

3. Replace the empty block with a friendly, actionable state:

```tsx
{!isLoading && posts.length === 0 && (
  <div className="text-center py-12 px-4">
    <div className="w-14 h-14 rounded-2xl bg-dc-teal/15 flex items-center justify-center mx-auto mb-3">
      <Calendar className="w-7 h-7 text-dc-teal" />
    </div>
    <p className="font-bold text-dc-text">No posts scheduled yet</p>
    <p className="text-sm text-dc-text-muted mt-1.5 max-w-xs mx-auto">
      Once this campaign has deliverables, Donny builds a posting schedule you can review and confirm right here.
    </p>
    <button
      type="button"
      onClick={() => onOpenChange(false)}
      className="mt-5 bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full px-6 py-3 text-sm font-bold transition-colors"
    >
      Back to campaign
    </button>
  </div>
)}
```

4. Render the sticky confirm footer **only when there are posts** — wrap the footer block:

```tsx
{!isLoading && posts.length > 0 && (
  <div className="sticky bottom-0 bg-white pt-3 pb-4 border-t border-gray-100 mt-4">
    {/* existing confirm button + helper text — unchanged */}
  </div>
)}
```

Ensure `Calendar` and `Sparkles` remain imported from `lucide-react` (they already are).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/ScheduleReviewScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success (verify no unused `ScheduleTimeline`/`computeSpreadDays` — `computeSpreadDays` is still used by `ScheduleStatsRow`; keep it).

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/ScheduleReviewScreen.tsx src/components/schedule/ScheduleReviewScreen.test.tsx
git commit -m "fix(schedule): review panel — drop overlapping timeline, honest header, actionable empty state"
```

---

### Task 8 (P2 — separable): Readable Month cells on desktop

**Files:**
- Modify: `src/components/outstand/calendar/MonthGrid.tsx`
- Test: `src/components/outstand/calendar/MonthGrid.test.tsx`

**Interfaces:**
- Consumes: existing `MonthGridProps`, `postsForDay`; `getCaption`, `getUniqueNetworks` from `@/components/outstand/postUtils`.
- Produces: month cells render up to 2 post chips (`time · short-title`, platform-tinted) + "+K more"; behavior/props unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/outstand/calendar/MonthGrid.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MonthGrid } from './MonthGrid';
import type { Post } from '@outstand-so/ui';

const post = (id: string, day: number, caption: string): Post =>
  ({
    id,
    scheduledAt: new Date(2026, 6, day, 9).toISOString(),
    publishedAt: null,
    socialAccounts: [{ id: `sa-${id}`, network: 'instagram', status: 'scheduled' }],
    containers: [{ content: caption }],
  }) as unknown as Post;

describe('MonthGrid chips', () => {
  it('renders the post caption as a chip in the day cell', () => {
    render(
      <MonthGrid
        posts={[post('p1', 10, 'Latte art')]}
        year={2026}
        month={6}
        onDayClick={() => {}}
      />,
    );
    expect(screen.getByText(/Latte art/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/outstand/calendar/MonthGrid.test.tsx`
Expected: FAIL — the current MonthGrid renders only dots, so "Latte art" is absent.

- [ ] **Step 3: Implement chips**

In `MonthGrid.tsx`: add imports

```tsx
import { getCaption, getUniqueNetworks } from '@/components/outstand/postUtils';
```

Add a small helper near the top of the file:

```tsx
const CHIP_TINT: Record<string, string> = {
  instagram: 'bg-dc-teal/15 text-dc-teal',
  tiktok: 'bg-dc-pink/15 text-dc-pink-accent',
};
function chipTint(network?: string): string {
  return (network && CHIP_TINT[network]) || 'bg-dc-teal/15 text-dc-teal';
}
function shortTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric' });
}
```

Raise the cell height and render chips. Change the cell `<button>` class `h-14` → `md:min-h-[92px] h-14`, and inside the cell (replacing the dots-only block) render up to two chips plus the existing markers:

```tsx
<span className={`text-xs font-bold ${isToday ? 'text-dc-teal' : 'text-gray-700'}`}>
  {day.getDate()}
</span>
<div className="w-full px-1 mt-0.5 space-y-0.5">
  {dayPostsList.slice(0, 2).map((p) => (
    <div
      key={p.id}
      className={`text-[8px] leading-tight font-semibold rounded px-1 py-0.5 truncate ${chipTint(getUniqueNetworks(p)[0])}`}
      title={getCaption(p)}
    >
      {[shortTime(p.scheduledAt ?? p.publishedAt), getCaption(p) || 'Post'].filter(Boolean).join(' · ')}
    </div>
  ))}
  {dayPostsList.length > 2 && (
    <div className="text-[8px] text-gray-400 font-semibold">+{dayPostsList.length - 2} more</div>
  )}
  {deadlinesOnDay.length > 0 && (
    <div className="text-[8px] font-semibold rounded px-1 py-0.5 truncate bg-dc-pink/10 text-dc-pink-accent">
      ⚑ {deadlinesOnDay[0].title}
    </div>
  )}
</div>
```

Keep the sponsorship dots row if present. Because chips now convey scheduled/published, the old scheduled/published/deadline **dot** cluster can be removed (the deadline is now a chip); leave sponsorship dots as-is. The cell stays a `<button>` calling `onDayClick(day)` — clicking a chip still bubbles to the day click, which is acceptable (opens that day).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/outstand/calendar/MonthGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + build + manual (desktop only)**

Run: `npm run typecheck && npm run build`. Then desktop: open the calendar, switch to Month → cells show readable chips instead of anonymous dots; mobile is unaffected (MonthGrid is `hidden md:block`).

- [ ] **Step 6: Commit**

```bash
git add src/components/outstand/calendar/MonthGrid.tsx src/components/outstand/calendar/MonthGrid.test.tsx
git commit -m "feat(schedule): readable Month cells with post chips (desktop)"
```

---

## Final verification

- [ ] Run the full touched suite: `npx vitest run src/components/schedule src/components/outstand/calendar/MonthGrid.test.tsx`
- [ ] `npm run typecheck && npm run lint && npm run build` all clean.
- [ ] Manual both-viewport pass per CLAUDE.md, then the `verify-prod` skill after deploy.
- [ ] Run the `codex-review` skill (mandatory independent second review) before opening the PR; fix findings and re-run until clean.

## Self-review notes (coverage map)

- Spec Unit 1 → Tasks 1–2. Unit 2 (AgendaView) → Task 3. Unit 3 (MonthJumpControl) → Task 4. Unit 4 (CalendarTab integration) → Task 5. Unit 5 (＋ wiring) → Task 6. Unit 6 (Review panel) → Task 7. Unit 7 (Month chips, P2) → Task 8.
- Behavior details: upcoming-from-`currentDate` (Task 5 `from: startOfDay(currentDate)`), empty days dropped (Task 1 `groupByDay`), relative labels (Task 1), deadlines inline (Tasks 2/3/5), platform filter retained (unchanged in CalendarTab), month-jump ≤2 taps (Task 4), Today always visible (Task 3 header).
- Preserved invariants: desktop grids + drag untouched (Task 5 keeps them behind the toggle; only Task 8 edits MonthGrid cell contents, not the week/day grids or drag); frontend-only; mobile base vs desktop `md:` discipline.
