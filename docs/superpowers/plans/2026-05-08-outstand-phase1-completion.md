# Outstand Phase 1 Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining Phase 1 (Restaurant Social Media) features — Content Calendar, Engagement Hub, Analytics Dashboard, and Settings Integration — by restructuring the OutstandManager from 4 tabs to 6 and adding 18 new files.

**Architecture:** Extend the existing OutstandManager page (`src/pages/OutstandManager.tsx`) with three new tab components (CalendarTab, EngagementTab, AnalyticsTab), each composed of focused sub-components. A shared `ConnectedAccountsList` component bridges the settings pages to the Outstand integration. All Outstand API calls continue through the existing Edge Function proxy. A new `social_analytics_cache` Supabase table stores account-level metrics.

**Tech Stack:** React + TypeScript, Tailwind CSS, Outstand SDK (`@outstand-so/ui`), React Query (TanStack Query), Recharts (already in package.json), shadcn/ui (Sheet, Accordion), Supabase (Postgres + RLS + Edge Functions).

**Source Spec:** `docs/superpowers/specs/2026-05-08-outstand-phase1-completion-design.md`

---

### Task 1: Restructure OutstandManager Tab Bar (4 → 6 tabs)

**Files:**
- Modify: `src/pages/OutstandManager.tsx`

This is the foundation — all subsequent tasks depend on the new tab structure being in place. The Scheduled tab is removed (Calendar replaces it). Three new tabs are added as placeholder stubs initially.

- [ ] **Step 1: Update the VALID_TABS type and add new imports**

In `src/pages/OutstandManager.tsx`, update the tab constants and add the new icon imports:

```typescript
import { Send, CalendarDays, BarChart3, MessageCircle, TrendingUp, Link as LinkIcon, RefreshCw } from 'lucide-react';

const VALID_TABS = ['compose', 'calendar', 'published', 'engagement', 'analytics', 'accounts'] as const;
type TabValue = (typeof VALID_TABS)[number];
```

Note: the old `CalendarClock` and `Share2` imports are removed. `BarChart3` stays for Published. `LinkIcon` replaces `Share2` for Accounts.

- [ ] **Step 2: Create stub components for the three new tabs**

Add temporary inline stubs at the bottom of `OutstandManager.tsx` (before the default export) so the file compiles. These will be replaced by real components in Tasks 2–4:

```typescript
const CalendarTabStub: React.FC<{ posts: Post[]; isLoading: boolean }> = ({ isLoading }) =>
  isLoading ? <DCSkeleton variant="card" count={3} /> : <div className="p-8 text-center text-gray-400">Calendar — coming soon</div>;

const EngagementTabStub: React.FC = () =>
  <div className="p-8 text-center text-gray-400">Engagement — coming soon</div>;

const AnalyticsTabStub: React.FC = () =>
  <div className="p-8 text-center text-gray-400">Analytics — coming soon</div>;
```

Also add the DCSkeleton import if not already present:
```typescript
import { DCSkeleton } from '@/components/ui/dc-skeleton';
```

- [ ] **Step 3: Replace the TabsList with the 6-tab layout**

Replace the existing 4-tab `TabsList` grid with the new 6-tab grid. Use `grid-cols-6` and the mobile label pattern (`hidden sm:inline` / `sm:hidden`):

```tsx
<TabsList className="grid w-full grid-cols-6">
  <TabsTrigger value="compose" className="flex items-center gap-1 text-xs">
    <Send className="h-3 w-3" />
    <span className="hidden sm:inline">Compose</span>
    <span className="sm:hidden">New</span>
  </TabsTrigger>
  <TabsTrigger value="calendar" className="flex items-center gap-1 text-xs">
    <CalendarDays className="h-3 w-3" />
    Calendar
  </TabsTrigger>
  <TabsTrigger value="published" className="flex items-center gap-1 text-xs">
    <BarChart3 className="h-3 w-3" />
    <span className="hidden sm:inline">Published</span>
    <span className="sm:hidden">Posts</span>
  </TabsTrigger>
  <TabsTrigger value="engagement" className="flex items-center gap-1 text-xs">
    <MessageCircle className="h-3 w-3" />
    <span className="hidden sm:inline">Engagement</span>
    <span className="sm:hidden">Engage</span>
  </TabsTrigger>
  <TabsTrigger value="analytics" className="flex items-center gap-1 text-xs">
    <TrendingUp className="h-3 w-3" />
    <span className="hidden sm:inline">Analytics</span>
    <span className="sm:hidden">Stats</span>
  </TabsTrigger>
  <TabsTrigger value="accounts" className="flex items-center gap-1 text-xs">
    <LinkIcon className="h-3 w-3" />
    Accounts
    {connectedCount > 0 && (
      <span className="ml-1 bg-dc-teal text-white text-xs px-1.5 py-0.5 rounded-full">
        {connectedCount}
      </span>
    )}
  </TabsTrigger>
</TabsList>
```

Remove the badge from the old Scheduled tab trigger (it no longer exists). The Calendar tab doesn't need a badge — the scheduledCount is shown in the header stat card.

- [ ] **Step 4: Replace TabsContent blocks**

Remove the `scheduled` TabsContent. Add the three new TabsContent blocks:

```tsx
<TabsContent value="calendar">
  <CalendarTabStub posts={posts ?? []} isLoading={postsLoading} />
</TabsContent>
<TabsContent value="engagement">
  <EngagementTabStub />
</TabsContent>
<TabsContent value="analytics">
  <AnalyticsTabStub />
</TabsContent>
```

Keep the existing `compose`, `published`, and `accounts` TabsContent blocks unchanged.

**Important:** Also update the `onPosted` callback in the ComposeTab usage (around line 165). The old code reads:
```tsx
setActiveTab(wasScheduled ? 'scheduled' : 'published')
```
Change it to:
```tsx
setActiveTab(wasScheduled ? 'calendar' : 'published')
```
This ensures newly scheduled posts navigate to the Calendar tab instead of the removed Scheduled tab.

- [ ] **Step 5: Remove the ScheduledTab import**

Remove `import { ScheduledTab } from '@/components/outstand/ScheduledTab';` since the Scheduled tab no longer exists. The `ScheduledTab.tsx` file itself is kept (not deleted) — it contains patterns useful as reference and may be restored for a future "list view" toggle inside the Calendar.

- [ ] **Step 6: Verify the build compiles and tabs render**

```bash
npm run build
```

Expected: build succeeds. Run `npm run dev` and navigate to `/dashboard/business/social`. Verify:
- 6 tabs render correctly on desktop (full labels)
- 6 tabs render correctly at 375px (short labels for Compose, Published, Engagement, Analytics)
- Clicking each new tab shows the stub placeholder text
- Compose, Published, and Accounts tabs still work as before
- The `?tab=` URL param works for all 6 values

- [ ] **Step 7: Commit**

```bash
git add src/pages/OutstandManager.tsx
git commit -m "feat: restructure OutstandManager to 6 tabs — Calendar, Engagement, Analytics stubs

Replace Scheduled tab with Calendar (stub). Add Engagement and Analytics
tab stubs. Update tab bar to 6-column grid with responsive mobile labels.
Foundation for Phase 1 completion features."
```

---

### Task 2: Build CalendarPostCard Component and Shared Utilities

**Files:**
- Create: `src/components/outstand/calendar/calendarUtils.ts`
- Create: `src/components/outstand/calendar/CalendarPostCard.tsx`

This compact post card is the building block used inside both the WeekGrid and the DayStrip mobile view. The shared `calendarUtils.ts` file extracts `isSameDay`, `getWeekDates`, and `postsForDay` so they aren't duplicated across WeekGrid, MonthGrid, and DayStrip.

- [ ] **Step 1: Create the calendar directory and shared utilities**

```bash
mkdir -p src/components/outstand/calendar
```

Create `src/components/outstand/calendar/calendarUtils.ts`:

```typescript
import type { Post } from '@outstand-so/ui';

export function getWeekDates(baseDate: Date): Date[] {
  const start = new Date(baseDate);
  const day = start.getDay();
  start.setDate(start.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function postsForDay(posts: Post[], day: Date): Post[] {
  return posts
    .filter((p) => {
      const stamp = p.scheduledAt ?? p.publishedAt;
      if (!stamp) return false;
      return isSameDay(new Date(stamp), day);
    })
    .sort((a, b) => {
      const aTime = new Date(a.scheduledAt ?? a.publishedAt ?? 0).getTime();
      const bTime = new Date(b.scheduledAt ?? b.publishedAt ?? 0).getTime();
      return aTime - bTime;
    });
}
```

- [ ] **Step 2: Create the calendar directory (if not done above)**

Already done in Step 1. Proceed to CalendarPostCard.
```

- [ ] **Step 2: Create CalendarPostCard component**

Create `src/components/outstand/calendar/CalendarPostCard.tsx`:

```tsx
import React from 'react';
import type { Post } from '@outstand-so/ui';
import { getCaption, getUniqueNetworks } from '../postUtils';
import { isScheduled } from '@/pages/OutstandManager';

const NETWORK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  instagram: { bg: 'bg-[#E1306C]', text: 'text-white', label: 'IG' },
  tiktok: { bg: 'bg-black', text: 'text-white', label: 'TT' },
  facebook: { bg: 'bg-[#1877F2]', text: 'text-white', label: 'FB' },
  x: { bg: 'bg-gray-800', text: 'text-white', label: 'X' },
  youtube: { bg: 'bg-red-600', text: 'text-white', label: 'YT' },
};

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getStatusBorder(post: Post): string {
  if (isScheduled(post)) return 'border-l-dc-teal';
  const sas = post.socialAccounts ?? [];
  if (sas.some((sa) => sa.status === 'failed')) return 'border-l-red-400';
  return 'border-l-amber-400';
}

interface CalendarPostCardProps {
  post: Post;
  onReschedule?: (post: Post) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, post: Post) => void;
}

export const CalendarPostCard: React.FC<CalendarPostCardProps> = ({
  post,
  onReschedule,
  draggable = false,
  onDragStart,
}) => {
  const caption = getCaption(post);
  const networks = getUniqueNetworks(post);
  const time = formatTime(post.scheduledAt ?? post.publishedAt);
  const borderColor = getStatusBorder(post);

  return (
    <div
      className={`border-l-3 ${borderColor} rounded bg-white/80 p-1.5 mb-1.5 cursor-pointer hover:bg-white transition-colors ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      draggable={draggable}
      onDragStart={draggable && onDragStart ? (e) => onDragStart(e, post) : undefined}
      onClick={() => onReschedule?.(post)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onReschedule?.(post)}
    >
      {time && (
        <div className="text-[9px] font-semibold text-dc-teal">{time}</div>
      )}
      <div className="text-[10px] text-gray-900 font-medium mt-0.5 line-clamp-2">
        {caption || <span className="italic text-gray-400">No caption</span>}
      </div>
      {networks.length > 0 && (
        <div className="flex gap-0.5 mt-1 flex-wrap">
          {networks.map((n) => {
            const color = NETWORK_COLORS[n] ?? { bg: 'bg-gray-400', text: 'text-white', label: n };
            return (
              <span
                key={n}
                className={`text-[8px] ${color.bg} ${color.text} px-1 py-px rounded font-semibold`}
              >
                {color.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: compiles without errors. No UI to verify yet — the card will be used by WeekGrid and DayStrip.

- [ ] **Step 4: Commit**

```bash
git add src/components/outstand/calendar/calendarUtils.ts src/components/outstand/calendar/CalendarPostCard.tsx
git commit -m "feat: add CalendarPostCard and shared calendar utilities

calendarUtils.ts provides isSameDay, getWeekDates, and postsForDay
shared across WeekGrid, MonthGrid, and DayStrip components."
```

---

### Task 3: Build WeekGrid Component (Desktop Calendar)

**Files:**
- Create: `src/components/outstand/calendar/WeekGrid.tsx`

Seven-column desktop grid with drag-and-drop rescheduling for scheduled posts.

- [ ] **Step 1: Create WeekGrid component**

Create `src/components/outstand/calendar/WeekGrid.tsx`:

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import type { Post } from '@outstand-so/ui';
import { CalendarPostCard } from './CalendarPostCard';
import { getWeekDates, isSameDay, postsForDay } from './calendarUtils';
import { isScheduled } from '@/pages/OutstandManager';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface WeekGridProps {
  posts: Post[];
  weekStart: Date;
  onReschedule: (post: Post, newDate: Date) => void;
  onPostClick: (post: Post) => void;
}

export const WeekGrid: React.FC<WeekGridProps> = ({ posts, weekStart, onReschedule, onPostClick }) => {
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const today = useMemo(() => new Date(), []);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, post: Post) => {
    e.dataTransfer.setData('text/plain', post.id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dayIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dayIndex);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dayIndex: number) => {
    e.preventDefault();
    setDragOverDay(null);
    const postId = e.dataTransfer.getData('text/plain');
    const post = posts.find((p) => p.id === postId);
    if (!post || !isScheduled(post)) return;
    const targetDay = weekDates[dayIndex];
    const originalTime = post.scheduledAt ? new Date(post.scheduledAt) : new Date();
    const newDate = new Date(targetDay);
    newDate.setHours(originalTime.getHours(), originalTime.getMinutes(), 0, 0);
    onReschedule(post, newDate);
  }, [posts, weekDates, onReschedule]);

  return (
    <div className="hidden md:grid grid-cols-7 min-h-[320px] border-t border-gray-100">
      {weekDates.map((day, i) => {
        const dayPosts = postsForDay(posts, day);
        const isToday = isSameDay(day, today);
        const isDragTarget = dragOverDay === i;

        return (
          <div
            key={day.toISOString()}
            className={`border-r border-gray-100 last:border-r-0 p-1.5 transition-colors ${isDragTarget ? 'bg-dc-teal/5' : ''}`}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, i)}
          >
            <div className={`text-[10px] font-semibold uppercase text-center ${isToday ? 'text-dc-teal' : 'text-gray-400'}`}>
              {DAY_LABELS[i]}
            </div>
            <div className={`text-lg font-bold text-center mb-1.5 ${isToday ? 'text-dc-teal' : 'text-gray-900'}`}>
              {day.getDate()}
            </div>
            {dayPosts.map((post) => (
              <CalendarPostCard
                key={post.id}
                post={post}
                draggable={isScheduled(post)}
                onDragStart={handleDragStart}
                onReschedule={onPostClick}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/calendar/WeekGrid.tsx
git commit -m "feat: add WeekGrid — 7-column desktop calendar with drag-and-drop"
```

---

### Task 4: Build MonthGrid Component

**Files:**
- Create: `src/components/outstand/calendar/MonthGrid.tsx`

5-row × 7-column mini-grid with dot indicators per day. Click a day to switch to week view.

- [ ] **Step 1: Create MonthGrid component**

Create `src/components/outstand/calendar/MonthGrid.tsx`:

```tsx
import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { isSameDay, postsForDay } from './calendarUtils';
import { isScheduled } from '@/pages/OutstandManager';

function getMonthGridDates(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const totalDays = lastDay.getDate();
  const weeks: (Date | null)[][] = [];
  let current = 1 - startDow;
  for (let w = 0; w < 6; w++) {
    const week: (Date | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (current >= 1 && current <= totalDays) {
        week.push(new Date(year, month, current));
      } else {
        week.push(null);
      }
      current++;
    }
    if (week.every((d) => d === null)) break;
    weeks.push(week);
  }
  return weeks;
}

interface MonthGridProps {
  posts: Post[];
  year: number;
  month: number; // 0-indexed
  onDayClick: (day: Date) => void;
}

export const MonthGrid: React.FC<MonthGridProps> = ({ posts, year, month, onDayClick }) => {
  const weeks = useMemo(() => getMonthGridDates(year, month), [year, month]);
  const today = useMemo(() => new Date(), []);
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="hidden md:block">
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map((label, i) => (
          <div key={i} className="text-[10px] font-semibold text-gray-400 uppercase text-center py-1">
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            if (!day) {
              return <div key={di} className="h-14 border-b border-r border-gray-50 last:border-r-0" />;
            }
            const dayPostsList = postsForDay(posts, day);
            const isToday = isSameDay(day, today);
            const scheduled = dayPostsList.filter(isScheduled).length;
            const published = dayPostsList.length - scheduled;

            return (
              <button
                key={di}
                type="button"
                onClick={() => onDayClick(day)}
                className={`h-14 border-b border-r border-gray-50 last:border-r-0 flex flex-col items-center justify-start pt-1 hover:bg-gray-50 transition-colors ${isToday ? 'bg-teal-50/50' : ''}`}
              >
                <span className={`text-xs font-bold ${isToday ? 'text-dc-teal' : 'text-gray-700'}`}>
                  {day.getDate()}
                </span>
                {dayPostsList.length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {scheduled > 0 && <span className="w-1.5 h-1.5 rounded-full bg-dc-teal" />}
                    {published > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/calendar/MonthGrid.tsx
git commit -m "feat: add MonthGrid — monthly calendar view with dot indicators"
```

---

### Task 5: Build DayStrip Component (Mobile Calendar)

**Files:**
- Create: `src/components/outstand/calendar/DayStrip.tsx`

Horizontal scrolling day strip for mobile, showing Mon–Sun with dot indicators. Selected day highlighted.

- [ ] **Step 1: Create DayStrip component**

Create `src/components/outstand/calendar/DayStrip.tsx`:

```tsx
import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { CalendarPostCard } from './CalendarPostCard';
import { getWeekDates, isSameDay, postsForDay } from './calendarUtils';
import { Plus } from 'lucide-react';
import { isScheduled } from '@/pages/OutstandManager';

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

interface DayStripProps {
  posts: Post[];
  weekStart: Date;
  selectedDay: Date;
  onDaySelect: (day: Date) => void;
  onPostClick: (post: Post) => void;
  onScheduleClick: () => void;
}

export const DayStrip: React.FC<DayStripProps> = ({
  posts,
  weekStart,
  selectedDay,
  onDaySelect,
  onPostClick,
  onScheduleClick,
}) => {
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const today = useMemo(() => new Date(), []);

  const selectedPosts = useMemo(() => postsForDay(posts, selectedDay), [posts, selectedDay]);

  return (
    <div className="md:hidden">
      {/* Horizontal day strip */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {weekDates.map((day, i) => {
          const isSelected = isSameDay(day, selectedDay);
          const isToday = isSameDay(day, today);
          const hasPosts = posts.some((p) => {
            const stamp = p.scheduledAt ?? p.publishedAt;
            return stamp ? isSameDay(new Date(stamp), day) : false;
          });

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDaySelect(day)}
              className={`flex-none px-3.5 py-2.5 text-center ${isSelected ? 'border-b-2 border-dc-teal bg-teal-50/50' : ''}`}
            >
              <div className={`text-[9px] font-semibold ${isToday ? 'text-dc-teal' : 'text-gray-400'}`}>
                {DAY_LABELS[i]}
              </div>
              <div className={`text-base font-bold ${isToday ? 'text-dc-teal' : 'text-gray-900'}`}>
                {day.getDate()}
              </div>
              {hasPosts && <div className="w-1.5 h-1.5 rounded-full bg-dc-teal mx-auto mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Selected day's posts */}
      <div className="p-4">
        <div className="text-xs font-semibold text-gray-900 mb-3">
          {selectedDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {selectedPosts.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <CalendarDaysIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-xs mb-3">No posts for this day</p>
            <button
              type="button"
              onClick={onScheduleClick}
              className="bg-dc-teal text-white rounded-full px-5 py-2 text-xs font-semibold inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Schedule a Post
            </button>
          </div>
        ) : (
          selectedPosts.map((post) => (
            <CalendarPostCard key={post.id} post={post} onReschedule={onPostClick} />
          ))
        )}
      </div>
    </div>
  );
};

// Inline icon to avoid importing from lucide at module level for a single usage
const CalendarDaysIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 2v4M16 2v4" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18" />
  </svg>
);
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/calendar/DayStrip.tsx
git commit -m "feat: add DayStrip — mobile horizontal day selector for calendar"
```

---

### Task 6: Build CalendarTab and Wire Into OutstandManager

**Files:**
- Create: `src/components/outstand/CalendarTab.tsx`
- Modify: `src/pages/OutstandManager.tsx`

The CalendarTab composes WeekGrid, MonthGrid, and DayStrip into a unified view with date navigation, view toggle, and platform filtering.

- [ ] **Step 1: Create CalendarTab component**

Create `src/components/outstand/CalendarTab.tsx`:

```tsx
import React, { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Post } from '@outstand-so/ui';
import { useOutstandApi } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useQueryClient } from '@tanstack/react-query';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { WeekGrid } from './calendar/WeekGrid';
import { MonthGrid } from './calendar/MonthGrid';
import { DayStrip } from './calendar/DayStrip';
import { isScheduled } from '@/pages/OutstandManager';
import { toast } from 'sonner';

type CalendarView = 'week' | 'month';

const PLATFORM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X' },
  { key: 'youtube', label: 'YouTube' },
] as const;

interface CalendarTabProps {
  posts: Post[];
  isLoading: boolean;
  onChanged?: () => void;
  onSwitchTab?: (tab: string) => void;
}

export const CalendarTab: React.FC<CalendarTabProps> = ({ posts, isLoading, onChanged, onSwitchTab }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();

  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  const filteredPosts = useMemo(() => {
    if (platformFilter === 'all') return posts;
    return posts.filter((p) =>
      (p.socialAccounts ?? []).some((sa) => sa.network === platformFilter),
    );
  }, [posts, platformFilter]);

  const navigateWeek = useCallback((delta: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7 * delta);
      return d;
    });
  }, []);

  const navigateMonth = useCallback((delta: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  }, []);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDay(today);
  }, []);

  const handleDayClick = useCallback((day: Date) => {
    setSelectedDay(day);
    setCurrentDate(day);
    setView('week');
  }, []);

  const handleReschedule = useCallback(async (post: Post, newDate: Date) => {
    if (!isScheduled(post)) return;
    try {
      // Try PATCH first; fall back to delete-and-recreate
      const patchRes = await api.patch(`/posts/${post.id}`, { scheduledAt: newDate.toISOString() });
      if (!patchRes.success) {
        // Fallback: delete + recreate
        const delRes = await api.delete(`/posts/${post.id}`);
        if (!delRes.success) throw new Error(delRes.error || 'Failed to delete post for reschedule');
        const createRes = await api.post('/posts', {
          ...post,
          id: undefined,
          scheduledAt: newDate.toISOString(),
        });
        if (!createRes.success) throw new Error(createRes.error || 'Failed to recreate post');
      }
      toast.success('Post rescheduled.');
      qc.invalidateQueries({ queryKey: ['outstand'] });
      onChanged?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`Reschedule failed: ${message}`);
    }
  }, [api, qc, onChanged]);

  const handlePostClick = useCallback((post: Post) => {
    // For now, show a toast with the post details. Future: open detail modal.
    if (isScheduled(post)) {
      toast.info(`Scheduled for ${new Date(post.scheduledAt!).toLocaleString()}. Drag to reschedule (desktop) or click to edit.`);
    }
  }, []);

  const headerLabel = view === 'week'
    ? (() => {
        const d = new Date(currentDate);
        const day = d.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(d);
        monday.setDate(d.getDate() + mondayOffset);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return `${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      })()
    : currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  if (isLoading) {
    return <DCSkeleton variant="card" count={3} className="mb-3" />;
  }

  return (
    <div>
      {/* Navigation header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (view === 'week' ? navigateWeek(-1) : navigateMonth(-1))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-sm font-bold text-gray-900 min-w-[160px] text-center">{headerLabel}</span>
          <button
            type="button"
            onClick={() => (view === 'week' ? navigateWeek(1) : navigateMonth(1))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        <div className="hidden md:flex gap-1">
          <button
            type="button"
            onClick={() => setView('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === 'week' ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setView('month')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === 'month' ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Month
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            Today
          </button>
        </div>
      </div>

      {/* Platform filter pills */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {PLATFORM_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setPlatformFilter(f.key)}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
              platformFilter === f.key ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Desktop views */}
      {view === 'week' ? (
        <WeekGrid
          posts={filteredPosts}
          weekStart={currentDate}
          onReschedule={handleReschedule}
          onPostClick={handlePostClick}
        />
      ) : (
        <MonthGrid
          posts={filteredPosts}
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          onDayClick={handleDayClick}
        />
      )}

      {/* Mobile view */}
      <DayStrip
        posts={filteredPosts}
        weekStart={currentDate}
        selectedDay={selectedDay}
        onDaySelect={setSelectedDay}
        onPostClick={handlePostClick}
        onScheduleClick={() => onSwitchTab?.('compose')}
      />

      {/* Legend (desktop only) */}
      <div className="hidden md:flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-dc-teal" /> Scheduled</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Published</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Failed</span>
        <span>⇕ Drag to reschedule</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire CalendarTab into OutstandManager**

In `src/pages/OutstandManager.tsx`:
1. Add import: `import { CalendarTab } from '@/components/outstand/CalendarTab';`
2. Replace the `CalendarTabStub` usage in the `calendar` TabsContent with:

```tsx
<TabsContent value="calendar">
  <CalendarTab
    posts={posts ?? []}
    isLoading={postsLoading}
    onChanged={refetchPosts}
    onSwitchTab={setActiveTab}
  />
</TabsContent>
```

3. Remove the `CalendarTabStub` inline component.

- [ ] **Step 3: Verify build and test**

```bash
npm run build
```

Run `npm run dev`, navigate to `/dashboard/business/social?tab=calendar`:
- Desktop: 7-column weekly grid with post cards
- Month view toggle works
- Platform filter pills filter posts
- Prev/Next arrows navigate weeks/months
- Today button returns to current date
- Mobile (375px): Day strip with stacked post cards for selected day
- Drag a scheduled post to a different day (desktop) — verify toast confirmation

- [ ] **Step 4: Commit**

```bash
git add src/components/outstand/CalendarTab.tsx src/pages/OutstandManager.tsx
git commit -m "feat: add CalendarTab with week/month views, drag-and-drop, platform filter

Replaces the Scheduled tab stub with a full Content Calendar. Desktop
shows WeekGrid (drag-and-drop) or MonthGrid (dot indicators). Mobile
shows DayStrip with stacked cards. Platform filter pills and date
navigation included."
```

---

### Task 7: Build Engagement Hub — Data Hook and List Component

**Files:**
- Create: `src/hooks/outstand/usePostComments.ts`
- Create: `src/components/outstand/engagement/EngagementList.tsx`

Build the data fetching layer and the list/card component first. The tab container and detail panel come in the next task.

- [ ] **Step 1: Create the engagement directory**

```bash
mkdir -p src/components/outstand/engagement
```

- [ ] **Step 2: Create usePostComments hook**

Create `src/hooks/outstand/usePostComments.ts`:

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutstandApi, type Post } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { isInPublishedFeed } from '@/pages/OutstandManager';

export interface Comment {
  id: string;
  postId: string;
  postCaption: string;
  postPublishedAt: string | null;
  authorName: string;
  authorId: string;
  text: string;
  createdAt: string;
  platform: string;
  isReply: boolean;
  parentId?: string;
}

const POSTS_LIMIT = 50;

export function usePostComments(posts: Post[], enabled: boolean) {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();

  const publishedPosts = posts
    .filter(isInPublishedFeed)
    .sort((a, b) => {
      const aT = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();
      const bT = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime();
      return bT - aT;
    })
    .slice(0, POSTS_LIMIT);

  return useQuery({
    queryKey: ['outstand', 'comments', publishedPosts.map((p) => p.id).join(',')],
    queryFn: async (): Promise<Comment[]> => {
      const allComments: Comment[] = [];
      const postCaption = (post: Post): string => {
        const container = post.containers?.[0] as Record<string, unknown> | undefined;
        return ((container?.content ?? container?.text ?? container?.caption ?? '') as string).slice(0, 60);
      };

      await Promise.all(
        publishedPosts.map(async (post) => {
          try {
            const res = await api.get(`/posts/${post.id}/comments`);
            if (!res.success || !Array.isArray(res.data)) return;
            const platform = (post.socialAccounts ?? [])[0]?.network ?? 'unknown';
            for (const c of res.data) {
              allComments.push({
                id: c.id,
                postId: post.id,
                postCaption: postCaption(post),
                postPublishedAt: post.publishedAt ?? null,
                authorName: c.authorName ?? c.author?.name ?? 'Unknown',
                authorId: c.authorId ?? c.author?.id ?? '',
                text: c.text ?? c.content ?? '',
                createdAt: c.createdAt ?? new Date().toISOString(),
                platform,
                isReply: !!c.parentId,
                parentId: c.parentId,
              });
            }
          } catch {
            // Skip posts whose comments can't be fetched
          }
        }),
      );

      return allComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    enabled: enabled && publishedPosts.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
```

- [ ] **Step 3: Create EngagementList component**

Create `src/components/outstand/engagement/EngagementList.tsx`:

```tsx
import React from 'react';
import type { Comment } from '@/hooks/outstand/usePostComments';

const PLATFORM_COLORS: Record<string, { bg: string; label: string }> = {
  instagram: { bg: 'bg-[#E1306C]', label: 'IG' },
  tiktok: { bg: 'bg-black', label: 'TT' },
  facebook: { bg: 'bg-[#1877F2]', label: 'FB' },
  x: { bg: 'bg-gray-800', label: 'X' },
  youtube: { bg: 'bg-red-600', label: 'YT' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface EngagementListProps {
  comments: Comment[];
  selectedId: string | null;
  ownAccountIds: string[];
  onSelect: (comment: Comment) => void;
}

export const EngagementList: React.FC<EngagementListProps> = ({
  comments,
  selectedId,
  ownAccountIds,
  onSelect,
}) => {
  return (
    <div className="divide-y divide-gray-50">
      {comments.map((comment) => {
        const isSelected = selectedId === comment.id;
        const isReplied = ownAccountIds.includes(comment.authorId) || comment.isReply;
        const platform = PLATFORM_COLORS[comment.platform] ?? { bg: 'bg-gray-400', label: '?' };

        return (
          <button
            key={comment.id}
            type="button"
            onClick={() => onSelect(comment)}
            className={`w-full text-left px-4 py-3 transition-colors ${
              isSelected ? 'bg-teal-50/50 border-l-[3px] border-l-dc-teal' : 'hover:bg-gray-50'
            } ${isReplied ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className={`w-8 h-8 ${platform.bg} rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                  {platform.label}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-gray-900 truncate">{comment.authorName}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{comment.text}</div>
                </div>
              </div>
              <span className="text-[9px] text-gray-300 whitespace-nowrap shrink-0">{timeAgo(comment.createdAt)}</span>
            </div>
            <div className="flex gap-1 mt-1.5 ml-[42px]">
              <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                {comment.isReply ? 'Reply' : 'Comment'}
              </span>
              {isReplied ? (
                <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">✓ Replied</span>
              ) : (
                <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">Unreplied</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/outstand/usePostComments.ts src/components/outstand/engagement/EngagementList.tsx
git commit -m "feat: add usePostComments hook and EngagementList component

Fetches comments across the 50 most recent published posts, merges
into a chronological feed with 60s polling. EngagementList renders
comment cards with platform avatars, status badges, and time-ago."
```

---

### Task 8: Build EngagementDetail, ReplySheet, and EngagementTab

**Files:**
- Create: `src/components/outstand/engagement/EngagementDetail.tsx`
- Create: `src/components/outstand/engagement/ReplySheet.tsx`
- Create: `src/components/outstand/EngagementTab.tsx`
- Modify: `src/pages/OutstandManager.tsx`

- [ ] **Step 1: Create EngagementDetail (desktop right panel)**

Create `src/components/outstand/engagement/EngagementDetail.tsx`:

```tsx
import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useOutstandApi } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Comment } from '@/hooks/outstand/usePostComments';

interface EngagementDetailProps {
  comment: Comment;
}

export const EngagementDetail: React.FC<EngagementDetailProps> = ({ comment }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const res = await api.post(`/posts/${comment.postId}/comments`, { text: replyText.trim() });
      if (!res.success) throw new Error(res.error || 'Reply failed');
      toast.success('Reply sent!');
      setReplyText('');
      qc.invalidateQueries({ queryKey: ['outstand', 'comments'] });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`Could not reply: ${message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Post context */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="text-[10px] font-semibold uppercase text-gray-400 mb-2">On your post</div>
        <div className="text-xs font-semibold text-gray-900">{comment.postCaption || 'Untitled post'}</div>
        <div className="text-[11px] text-gray-400 mt-1">
          {comment.postPublishedAt
            ? new Date(comment.postPublishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : ''}
          {' · '}
          {comment.platform}
        </div>
      </div>

      {/* Comment */}
      <div className="flex-1 px-5 py-4 overflow-y-auto">
        <div className="flex gap-2.5">
          <div className="w-8 h-8 bg-pink-200 rounded-full flex items-center justify-center text-xs font-bold text-pink-700 shrink-0">
            {comment.authorName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-xs">
              <span className="font-bold text-gray-900">{comment.authorName}</span>
              <span className="text-gray-300 text-[10px] ml-2">
                {new Date(comment.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <div className="text-xs text-gray-700 mt-1 leading-relaxed">{comment.text}</div>
          </div>
        </div>
      </div>

      {/* Reply input */}
      <div className="px-5 py-3 border-t border-gray-100 flex gap-2 items-center">
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
          placeholder={`Reply to ${comment.authorName}...`}
          className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-xs outline-none focus:border-dc-teal"
          disabled={sending}
        />
        <button
          type="button"
          onClick={handleReply}
          disabled={sending || !replyText.trim()}
          className="w-9 h-9 bg-dc-teal text-white rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create ReplySheet (mobile bottom sheet)**

Create `src/components/outstand/engagement/ReplySheet.tsx`:

```tsx
import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useOutstandApi } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Comment } from '@/hooks/outstand/usePostComments';

interface ReplySheetProps {
  comment: Comment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReplySheet: React.FC<ReplySheetProps> = ({ comment, open, onOpenChange }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const handleReply = async () => {
    if (!comment || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await api.post(`/posts/${comment.postId}/comments`, { text: replyText.trim() });
      if (!res.success) throw new Error(res.error || 'Reply failed');
      toast.success('Reply sent!');
      setReplyText('');
      qc.invalidateQueries({ queryKey: ['outstand', 'comments'] });
      onOpenChange(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`Could not reply: ${message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
        <SheetHeader>
          <SheetTitle className="text-sm">Reply to {comment?.authorName}</SheetTitle>
        </SheetHeader>
        {comment && (
          <div className="mt-4 space-y-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-[10px] text-gray-400 mb-1">on: {comment.postCaption}</div>
              <div className="text-xs text-gray-700">{comment.text}</div>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
                placeholder="Write a reply..."
                className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-xs outline-none focus:border-dc-teal"
                disabled={sending}
                autoFocus
              />
              <button
                type="button"
                onClick={handleReply}
                disabled={sending || !replyText.trim()}
                className="w-9 h-9 bg-dc-teal text-white rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
```

- [ ] **Step 3: Create EngagementTab container**

Create `src/components/outstand/EngagementTab.tsx`:

```tsx
import React, { useState, useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Post } from '@outstand-so/ui';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { usePostComments, type Comment } from '@/hooks/outstand/usePostComments';
import { EngagementList } from './engagement/EngagementList';
import { EngagementDetail } from './engagement/EngagementDetail';
import { ReplySheet } from './engagement/ReplySheet';

type FilterType = 'all' | 'comment' | 'mention';

interface EngagementTabProps {
  posts: Post[];
  ownAccountIds: string[];
}

export const EngagementTab: React.FC<EngagementTabProps> = ({ posts, ownAccountIds }) => {
  const { data: comments, isLoading } = usePostComments(posts, true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [replySheetComment, setReplySheetComment] = useState<Comment | null>(null);

  const filteredComments = useMemo(() => {
    if (!comments) return [];
    if (filter === 'all') return comments;
    if (filter === 'comment') return comments.filter((c) => !c.isReply);
    return comments.filter((c) => c.isReply);
  }, [comments, filter]);

  const selectedComment = useMemo(
    () => filteredComments.find((c) => c.id === selectedId) ?? null,
    [filteredComments, selectedId],
  );

  const commentCount = comments?.filter((c) => !c.isReply).length ?? 0;
  const mentionCount = comments?.filter((c) => c.isReply).length ?? 0;

  const handleSelect = (comment: Comment) => {
    setSelectedId(comment.id);
    // On mobile, open the reply sheet
    if (window.innerWidth < 768) {
      setReplySheetComment(comment);
    }
  };

  if (isLoading) {
    return <DCSkeleton variant="card" count={4} className="mb-3" />;
  }

  if (!comments || comments.length === 0) {
    return (
      <DCEmptyState
        icon={MessageCircle}
        title="No comments or mentions yet"
        subtitle="When people comment on or mention your posts, they'll appear here."
      />
    );
  }

  const filterButtons: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'comment', label: 'Comments', count: commentCount },
    { key: 'mention', label: 'Mentions', count: mentionCount },
  ];

  return (
    <div>
      {/* Filter bar */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {filterButtons.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap inline-flex items-center gap-1 ${
              filter === f.key ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {f.label}
            {f.count !== undefined && f.count > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                filter === f.key ? 'bg-white/30' : 'bg-red-500 text-white'
              }`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Two-panel layout (desktop) / single column (mobile) */}
      <div className="md:grid md:grid-cols-[320px_1fr] md:min-h-[400px] md:border md:border-gray-100 md:rounded-xl md:overflow-hidden">
        <div className="md:border-r md:border-gray-100 md:overflow-y-auto md:max-h-[500px]">
          <EngagementList
            comments={filteredComments}
            selectedId={selectedId}
            ownAccountIds={ownAccountIds}
            onSelect={handleSelect}
          />
        </div>
        <div className="hidden md:flex md:flex-col">
          {selectedComment ? (
            <EngagementDetail comment={selectedComment} />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-gray-300">
              Select a comment to view details and reply
            </div>
          )}
        </div>
      </div>

      {/* Mobile reply sheet */}
      <ReplySheet
        comment={replySheetComment}
        open={!!replySheetComment}
        onOpenChange={(open) => !open && setReplySheetComment(null)}
      />
    </div>
  );
};
```

- [ ] **Step 4: Wire EngagementTab into OutstandManager**

In `src/pages/OutstandManager.tsx`:
1. Add import: `import { EngagementTab } from '@/components/outstand/EngagementTab';`
2. Compute `ownAccountIds` from the accounts data:

```typescript
const ownAccountIds = useMemo(
  () => (accounts ?? []).map((a) => a.id),
  [accounts],
);
```

3. Replace the `EngagementTabStub` usage:

```tsx
<TabsContent value="engagement">
  <EngagementTab posts={posts ?? []} ownAccountIds={ownAccountIds} />
</TabsContent>
```

4. Remove the `EngagementTabStub` inline component.

- [ ] **Step 5: Verify build and test**

```bash
npm run build
```

Run `npm run dev`, navigate to `/dashboard/business/social?tab=engagement`:
- Desktop: two-panel layout — comment list on left, detail + reply on right
- Mobile: stacked cards with Reply buttons, bottom sheet opens on tap
- Filter pills toggle between All / Comments / Mentions
- Reply sends and refreshes the list
- Empty state shows when no comments

- [ ] **Step 6: Commit**

```bash
git add src/hooks/outstand/usePostComments.ts src/components/outstand/engagement/ src/components/outstand/EngagementTab.tsx src/pages/OutstandManager.tsx
git commit -m "feat: add Engagement Hub — unified inbox for comments and mentions

Two-panel desktop layout (list + detail + reply) and mobile card layout
with bottom sheet replies. Fetches comments across 50 most recent posts
with 60s polling. Filter by type (Comments/Mentions) with badge counts."
```

---

### Task 9: Build Analytics — Database Migration and useAccountMetrics Hook

**Files:**
- Create: `supabase/migrations/20260508000000_social_analytics_cache.sql`
- Create: `src/hooks/outstand/useAccountMetrics.ts`

- [ ] **Step 1: Create the Supabase migration**

Create `supabase/migrations/20260508000000_social_analytics_cache.sql`:

```sql
create table social_analytics_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outstand_account_id text not null,
  platform text not null,
  metric_type text not null,
  metric_value numeric not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique(user_id, outstand_account_id, metric_type, period_start, period_end)
);

create index idx_social_analytics_cache_freshness
  on social_analytics_cache (user_id, fetched_at);

alter table social_analytics_cache enable row level security;

create policy "Users can read own analytics cache"
  on social_analytics_cache for select
  using (auth.uid() = user_id);

create policy "Users can upsert own analytics cache"
  on social_analytics_cache for insert
  with check (auth.uid() = user_id);

create policy "Users can update own analytics cache"
  on social_analytics_cache for update
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Create useAccountMetrics hook**

Create `src/hooks/outstand/useAccountMetrics.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { useOutstandApi, type SocialAccount } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';

export interface AccountMetrics {
  totalFollowers: number;
  engagementRate: number;
  totalReach: number;
  postsPublished: number;
  followersDelta: number | null;
  engagementDelta: number | null;
  reachDelta: number | null;
  postsDelta: number | null;
  platformBreakdown: PlatformMetrics[];
}

export interface PlatformMetrics {
  platform: string;
  accountId: string;
  followers: number;
  followersDelta: number | null;
  engagementRate: number;
}

type TimeRange = '7d' | '30d' | '90d';

export function useAccountMetrics(accounts: SocialAccount[], timeRange: TimeRange) {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });

  return useQuery({
    queryKey: ['outstand', 'metrics', accounts.map((a) => a.id).join(','), timeRange],
    queryFn: async (): Promise<AccountMetrics> => {
      // 1. Check Supabase cache first
      const { data: cached } = await supabase
        .from('social_analytics_cache')
        .select('*')
        .gte('fetched_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

      const cachedByKey = new Map(
        (cached ?? []).map((row: Record<string, unknown>) => [
          `${row.outstand_account_id}:${row.metric_type}:${row.period_start}`,
          row,
        ]),
      );

      const platformMetrics: PlatformMetrics[] = [];
      let totalFollowers = 0;
      let totalReach = 0;
      let totalEngagement = 0;
      let postsPublished = 0;

      await Promise.all(
        accounts.map(async (account) => {
          const cacheKey = `${account.id}:followers:current`;
          const cachedRow = cachedByKey.get(cacheKey);

          if (cachedRow) {
            const followers = Number(cachedRow.metric_value) || 0;
            totalFollowers += followers;
            platformMetrics.push({
              platform: account.network ?? 'unknown',
              accountId: account.id,
              followers,
              followersDelta: null,
              engagementRate: 0,
            });
            return;
          }

          try {
            const res = await api.get(`/social-accounts/${account.id}/metrics`);
            if (!res.success || !res.data) return;
            const m = res.data as Record<string, number>;
            const followers = m.followers ?? m.followerCount ?? 0;
            const engagement = m.engagementRate ?? 0;
            const reach = m.reach ?? m.impressions ?? 0;

            totalFollowers += followers;
            totalReach += reach;
            totalEngagement += engagement;
            postsPublished += m.postsCount ?? 0;

            platformMetrics.push({
              platform: account.network ?? 'unknown',
              accountId: account.id,
              followers,
              followersDelta: null,
              engagementRate: engagement,
            });

            // 2. Upsert fresh data into cache
            await supabase.from('social_analytics_cache').upsert({
              outstand_account_id: account.id,
              platform: account.network ?? 'unknown',
              metric_type: 'followers',
              metric_value: followers,
              period_start: 'current',
              period_end: 'current',
              fetched_at: new Date().toISOString(),
            }, { onConflict: 'user_id,outstand_account_id,metric_type,period_start,period_end' });
          } catch {
            // Skip accounts whose metrics can't be fetched
          }
        }),
      );

      const avgEngagement = accounts.length > 0 ? totalEngagement / accounts.length : 0;

      return {
        totalFollowers,
        engagementRate: Math.round(avgEngagement * 100) / 100,
        totalReach,
        postsPublished,
        followersDelta: null,
        engagementDelta: null,
        reachDelta: null,
        postsDelta: null,
        platformBreakdown: platformMetrics,
      };
    },
    enabled: accounts.length > 0,
    staleTime: 60 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000000_social_analytics_cache.sql src/hooks/outstand/useAccountMetrics.ts
git commit -m "feat: add social_analytics_cache migration and useAccountMetrics hook

Creates Supabase table with RLS for caching Outstand account metrics.
Hook fetches metrics per connected account and aggregates into KPIs."
```

---

### Task 10: Build Analytics Tab Components and Wire Into OutstandManager

**Files:**
- Create: `src/components/outstand/analytics/KpiCards.tsx`
- Create: `src/components/outstand/analytics/PlatformBreakdown.tsx`
- Create: `src/components/outstand/analytics/TopPosts.tsx`
- Create: `src/components/outstand/analytics/PostingHeatmap.tsx`
- Create: `src/components/outstand/analytics/FollowerChart.tsx`
- Create: `src/components/outstand/AnalyticsTab.tsx`
- Modify: `src/pages/OutstandManager.tsx`

- [ ] **Step 1: Create analytics directory and KpiCards**

```bash
mkdir -p src/components/outstand/analytics
```

Create `src/components/outstand/analytics/KpiCards.tsx`:

```tsx
import React from 'react';
import type { AccountMetrics } from '@/hooks/outstand/useAccountMetrics';

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[11px] text-gray-300">—</span>;
  const isUp = delta >= 0;
  return (
    <span className={`text-[11px] font-semibold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
      {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
      <span className="text-gray-300 font-normal ml-1">vs prior</span>
    </span>
  );
}

interface KpiCardsProps {
  metrics: AccountMetrics;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics }) => {
  const cards = [
    { label: 'Total Followers', mobileLabel: 'Followers', value: formatNumber(metrics.totalFollowers), delta: metrics.followersDelta },
    { label: 'Engagement Rate', mobileLabel: 'Eng. Rate', value: `${metrics.engagementRate}%`, delta: metrics.engagementDelta },
    { label: 'Total Reach', mobileLabel: 'Reach', value: formatNumber(metrics.totalReach), delta: metrics.reachDelta },
    { label: 'Posts Published', mobileLabel: 'Published', value: metrics.postsPublished.toString(), delta: metrics.postsDelta },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="bg-teal-50/50 rounded-xl p-3 border border-teal-100">
          <div className="text-[9px] font-semibold uppercase text-gray-400 tracking-wide">
            <span className="hidden md:inline">{card.label}</span>
            <span className="md:hidden">{card.mobileLabel}</span>
          </div>
          <div className="text-2xl md:text-[26px] font-extrabold text-gray-900 mt-1">{card.value}</div>
          <div className="mt-1"><DeltaBadge delta={card.delta} /></div>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Create PlatformBreakdown**

Create `src/components/outstand/analytics/PlatformBreakdown.tsx`:

```tsx
import React from 'react';
import type { PlatformMetrics } from '@/hooks/outstand/useAccountMetrics';

const PLATFORM_STYLES: Record<string, { bg: string; icon: string; iconBg: string }> = {
  instagram: { bg: 'bg-pink-50', icon: 'IG', iconBg: 'bg-[#E1306C]' },
  tiktok: { bg: 'bg-gray-50', icon: 'TT', iconBg: 'bg-black' },
  facebook: { bg: 'bg-blue-50', icon: 'FB', iconBg: 'bg-[#1877F2]' },
  x: { bg: 'bg-gray-50', icon: 'X', iconBg: 'bg-gray-800' },
  youtube: { bg: 'bg-red-50', icon: 'YT', iconBg: 'bg-red-600' },
};

interface PlatformBreakdownProps {
  platforms: PlatformMetrics[];
}

export const PlatformBreakdown: React.FC<PlatformBreakdownProps> = ({ platforms }) => {
  if (platforms.length === 0) return null;

  return (
    <div>
      <div className="text-sm font-bold text-gray-900 mb-3">Platform Breakdown</div>
      <div className="flex md:grid md:grid-cols-3 gap-2.5 overflow-x-auto pb-1">
        {platforms.map((p) => {
          const style = PLATFORM_STYLES[p.platform] ?? { bg: 'bg-gray-50', icon: '?', iconBg: 'bg-gray-400' };
          return (
            <div key={p.accountId} className={`${style.bg} rounded-xl p-3 text-center flex-none w-[100px] md:w-auto`}>
              <div className={`w-7 h-7 ${style.iconBg} rounded-lg mx-auto flex items-center justify-center text-white text-[11px] font-bold mb-2`}>
                {style.icon}
              </div>
              <div className="text-base font-extrabold text-gray-900">{p.followers.toLocaleString()}</div>
              <div className="text-[9px] text-gray-400">followers</div>
              {p.followersDelta !== null && (
                <div className={`text-[10px] font-semibold mt-1 ${p.followersDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {p.followersDelta >= 0 ? '▲' : '▼'} {Math.abs(p.followersDelta).toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Create TopPosts**

Create `src/components/outstand/analytics/TopPosts.tsx`:

```tsx
import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { getCaption, getUniqueNetworks } from '../postUtils';
import { isInPublishedFeed } from '@/pages/OutstandManager';

const NETWORK_COLORS: Record<string, { bg: string; label: string }> = {
  instagram: { bg: 'bg-[#E1306C]', label: 'IG' },
  tiktok: { bg: 'bg-black', label: 'TT' },
  facebook: { bg: 'bg-[#1877F2]', label: 'FB' },
  x: { bg: 'bg-gray-800', label: 'X' },
  youtube: { bg: 'bg-red-600', label: 'YT' },
};

interface TopPostsProps {
  posts: Post[];
}

export const TopPosts: React.FC<TopPostsProps> = ({ posts }) => {
  const topPosts = useMemo(
    () =>
      posts
        .filter(isInPublishedFeed)
        .slice(0, 5)
        .map((post) => ({
          post,
          caption: getCaption(post),
          networks: getUniqueNetworks(post),
        })),
    [posts],
  );

  if (topPosts.length === 0) return null;

  return (
    <div>
      <div className="text-sm font-bold text-gray-900 mb-3">Top Posts</div>
      <div className="space-y-2">
        {topPosts.map(({ post, caption, networks }, i) => (
          <div key={post.id} className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
            <div className="text-sm font-extrabold text-dc-teal w-4">{i + 1}</div>
            <div className="w-9 h-9 bg-gray-100 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-gray-900 truncate">{caption || 'Untitled'}</div>
              <div className="text-[10px] text-gray-400">Published</div>
            </div>
            {networks[0] && (
              <span className={`text-[8px] ${NETWORK_COLORS[networks[0]]?.bg ?? 'bg-gray-400'} text-white px-1.5 py-0.5 rounded font-semibold`}>
                {NETWORK_COLORS[networks[0]]?.label ?? networks[0]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Create PostingHeatmap (desktop only)**

Create `src/components/outstand/analytics/PostingHeatmap.tsx`:

```tsx
import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { isInPublishedFeed } from '@/pages/OutstandManager';

const TIME_SLOTS = ['9a', '12p', '3p', '6p'];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const TEAL_SHADES = ['bg-teal-50', 'bg-teal-100', 'bg-teal-300', 'bg-teal-500'];

function getTimeSlot(hour: number): number {
  if (hour < 11) return 0;
  if (hour < 14) return 1;
  if (hour < 17) return 2;
  return 3;
}

interface PostingHeatmapProps {
  posts: Post[];
}

export const PostingHeatmap: React.FC<PostingHeatmapProps> = ({ posts }) => {
  const grid = useMemo(() => {
    const counts: number[][] = Array.from({ length: 4 }, () => Array(7).fill(0));
    let maxCount = 0;

    posts.filter(isInPublishedFeed).forEach((post) => {
      const stamp = post.publishedAt ?? post.createdAt;
      if (!stamp) return;
      const d = new Date(stamp);
      const dayIndex = (d.getDay() + 6) % 7; // Mon=0
      const slotIndex = getTimeSlot(d.getHours());
      counts[slotIndex][dayIndex]++;
      maxCount = Math.max(maxCount, counts[slotIndex][dayIndex]);
    });

    return { counts, maxCount };
  }, [posts]);

  function intensityClass(count: number): string {
    if (grid.maxCount === 0 || count === 0) return TEAL_SHADES[0];
    const pct = count / grid.maxCount;
    if (pct < 0.25) return TEAL_SHADES[0];
    if (pct < 0.5) return TEAL_SHADES[1];
    if (pct < 0.75) return TEAL_SHADES[2];
    return TEAL_SHADES[3];
  }

  return (
    <div className="hidden md:block">
      <div className="text-sm font-bold text-gray-900 mb-3">Best Posting Times</div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: 'auto repeat(7, 1fr)' }}>
        <div />
        {DAY_LABELS.map((label, i) => (
          <div key={i} className="text-[9px] font-semibold text-gray-400 text-center">{label}</div>
        ))}
        {TIME_SLOTS.map((slot, si) => (
          <React.Fragment key={slot}>
            <div className="text-[9px] text-gray-400 pr-1 flex items-center">{slot}</div>
            {DAY_LABELS.map((_, di) => (
              <div key={di} className={`h-4 rounded-sm ${intensityClass(grid.counts[si][di])}`} />
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[9px] text-gray-300">
        <span>Low engagement</span>
        <div className="flex gap-0.5">
          {TEAL_SHADES.map((shade) => (
            <span key={shade} className={`w-2.5 h-1.5 rounded-sm ${shade}`} />
          ))}
        </div>
        <span>High engagement</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Create FollowerChart (desktop only)**

Create `src/components/outstand/analytics/FollowerChart.tsx`:

```tsx
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { PlatformMetrics } from '@/hooks/outstand/useAccountMetrics';

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  tiktok: '#000000',
  facebook: '#1877F2',
  x: '#6B7280',
  youtube: '#DC2626',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'IG',
  tiktok: 'TT',
  facebook: 'FB',
  x: 'X',
  youtube: 'YT',
};

interface FollowerChartProps {
  platforms: PlatformMetrics[];
}

export const FollowerChart: React.FC<FollowerChartProps> = ({ platforms }) => {
  if (platforms.length === 0) return null;

  // Bar chart comparing current follower counts per platform.
  // Time-series growth lines will be available once the social_analytics_cache
  // accumulates historical snapshots over multiple fetch cycles.
  const data = platforms.map((p) => ({
    name: PLATFORM_LABELS[p.platform] ?? p.platform,
    followers: p.followers,
    platform: p.platform,
  }));

  return (
    <div className="hidden md:block">
      <div className="text-sm font-bold text-gray-900 mb-3">Followers by Platform</div>
      <div className="border border-gray-100 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="followers" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] ?? '#4DD9C0'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
```

- [ ] **Step 6: Create AnalyticsTab container**

Create `src/components/outstand/AnalyticsTab.tsx`:

```tsx
import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Post, SocialAccount } from '@outstand-so/ui';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { useAccountMetrics, type AccountMetrics } from '@/hooks/outstand/useAccountMetrics';
import { KpiCards } from './analytics/KpiCards';
import { PlatformBreakdown } from './analytics/PlatformBreakdown';
import { TopPosts } from './analytics/TopPosts';
import { PostingHeatmap } from './analytics/PostingHeatmap';
import { FollowerChart } from './analytics/FollowerChart';

type TimeRange = '7d' | '30d' | '90d';

interface AnalyticsTabProps {
  accounts: SocialAccount[];
  posts: Post[];
  accountsLoading: boolean;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ accounts, posts, accountsLoading }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const { data: metrics, isLoading: metricsLoading } = useAccountMetrics(accounts, timeRange);

  const isLoading = accountsLoading || metricsLoading;

  if (isLoading) {
    return <DCSkeleton variant="card" count={4} className="mb-3" />;
  }

  if (!accounts.length) {
    return (
      <DCEmptyState
        icon={TrendingUp}
        title="No accounts connected"
        subtitle="Connect your social accounts to see analytics."
      />
    );
  }

  const safeMetrics: AccountMetrics = metrics ?? {
    totalFollowers: 0,
    engagementRate: 0,
    totalReach: 0,
    postsPublished: 0,
    followersDelta: null,
    engagementDelta: null,
    reachDelta: null,
    postsDelta: null,
    platformBreakdown: [],
  };

  const ranges: TimeRange[] = ['7d', '30d', '90d'];

  return (
    <div className="space-y-5">
      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                timeRange === r ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <KpiCards metrics={safeMetrics} />

      {/* Desktop: chart + heatmap side by side */}
      <div className="hidden md:grid md:grid-cols-2 gap-4">
        <PostingHeatmap posts={posts} />
        <TopPosts posts={posts} />
      </div>

      {/* Mobile: top posts only */}
      <div className="md:hidden">
        <TopPosts posts={posts} />
      </div>

      {/* Follower chart (desktop only) */}
      <FollowerChart platforms={safeMetrics.platformBreakdown} />

      {/* Platform breakdown */}
      <PlatformBreakdown platforms={safeMetrics.platformBreakdown} />
    </div>
  );
};
```

- [ ] **Step 7: Wire AnalyticsTab into OutstandManager**

In `src/pages/OutstandManager.tsx`:
1. Add import: `import { AnalyticsTab } from '@/components/outstand/AnalyticsTab';`
2. Replace the `AnalyticsTabStub` usage:

```tsx
<TabsContent value="analytics">
  <AnalyticsTab accounts={accounts ?? []} posts={posts ?? []} accountsLoading={accountsLoading} />
</TabsContent>
```

3. Remove the `AnalyticsTabStub` inline component.

- [ ] **Step 8: Verify build and test**

```bash
npm run build
```

Run `npm run dev`, navigate to `/dashboard/business/social?tab=analytics`:
- Desktop: KPI cards (4-column), heatmap + top posts side by side, follower chart, platform breakdown
- Mobile: KPI cards (2×2), top posts, platform breakdown (horizontal scroll)
- Time range toggle (7d / 30d / 90d) changes the query
- Empty state when no accounts connected

- [ ] **Step 9: Commit**

```bash
git add src/components/outstand/analytics/ src/components/outstand/AnalyticsTab.tsx src/pages/OutstandManager.tsx
git commit -m "feat: add Analytics tab — KPIs, heatmap, top posts, platform breakdown

Dashboard with follower count, engagement rate, reach, and posts
published. Desktop includes posting heatmap and follower chart.
Mobile shows condensed KPI grid and top posts list."
```

---

### Task 11: Build ConnectedAccountsList and Update Settings Pages

**Files:**
- Create: `src/components/outstand/ConnectedAccountsList.tsx`
- Modify: `src/components/settings/BusinessSettingsSections.tsx`
- Modify: `src/components/settings/CreatorSettingsSections.tsx`

- [ ] **Step 1: Create ConnectedAccountsList component**

Create `src/components/outstand/ConnectedAccountsList.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAccounts, ConnectAccountButtonGroup, type SocialNetwork } from '@outstand-so/ui';
import { DragonCandyOutstandProvider, useOutstandConfig } from '@/integrations/outstand/Provider';
import { useOutstandPaths } from '@/hooks/outstand/useOutstandPaths';
import { toast } from 'sonner';

const PLATFORMS: { network: SocialNetwork; label: string; color: string }[] = [
  { network: 'instagram', label: 'Instagram', color: 'bg-[#E1306C]' },
  { network: 'tiktok', label: 'TikTok', color: 'bg-black' },
  { network: 'facebook', label: 'Facebook', color: 'bg-[#1877F2]' },
  { network: 'x', label: 'X (Twitter)', color: 'bg-gray-800' },
  { network: 'youtube', label: 'YouTube', color: 'bg-red-600' },
];

interface ConnectedAccountsListProps {
  role: 'business' | 'creator';
}

const ConnectedAccountsListInner: React.FC<ConnectedAccountsListProps> = ({ role }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { base, oauthCallback } = useOutstandPaths();
  const { accounts, isLoading } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const redirectUri = `${window.location.origin}${oauthCallback}`;

  const connectedNetworks = new Set((accounts ?? []).map((a) => a.network));

  const getAccountHandle = (network: string): string | undefined => {
    const account = (accounts ?? []).find((a) => a.network === network);
    if (!account) return undefined;
    return account.username ?? account.nickname ?? account.name ?? undefined;
  };

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide">Connected Accounts</div>
      <div className="space-y-2">
        {PLATFORMS.map(({ network, label, color }) => {
          const isConnected = connectedNetworks.has(network);
          const handle = getAccountHandle(network);

          return (
            <div
              key={network}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
                isConnected ? 'border-teal-200 bg-teal-50/50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 ${isConnected ? color : 'bg-gray-200'} rounded-lg flex items-center justify-center text-white text-[10px] font-bold`}>
                  {label.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className={`text-[11px] font-semibold ${isConnected ? 'text-gray-900' : 'text-gray-400'}`}>
                    {isConnected && handle ? handle : label}
                  </div>
                  <div className={`text-[9px] ${isConnected ? 'text-emerald-600' : 'text-gray-300'}`}>
                    {isConnected ? 'Connected' : 'Not connected'}
                  </div>
                </div>
              </div>
              {isConnected ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <ConnectAccountButtonGroup
                  networks={[network]}
                  redirectUri={redirectUri}
                  apiKey={apiKey}
                  baseUrl={baseUrl}
                  variant="outline"
                  layout="list"
                  onSuccess={(_network, authUrl) => {
                    sessionStorage.setItem('outstand_pending_network', network);
                    window.location.href = authUrl;
                  }}
                  onError={(_network, error) => {
                    toast.error(`Could not connect ${label}: ${error.message}`);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Link
        to={base}
        className="flex items-center justify-center gap-1.5 bg-dc-teal text-white text-xs font-bold py-3 rounded-full w-full hover:bg-teal-500 transition-colors"
      >
        ◆ Open Social Media Manager →
      </Link>
    </div>
  );
};

export const ConnectedAccountsList: React.FC<ConnectedAccountsListProps> = (props) => (
  <DragonCandyOutstandProvider>
    <ConnectedAccountsListInner {...props} />
  </DragonCandyOutstandProvider>
);
```

- [ ] **Step 2: Update BusinessSettingsSections**

In `src/components/settings/BusinessSettingsSections.tsx`:

1. Add import: `import { ConnectedAccountsList } from '@/components/outstand/ConnectedAccountsList';`
2. Replace the Social Links section (around lines 256–267):

```tsx
{/* 4. Social Media */}
<SettingsSection
  value="social"
  icon="📡"
  title="Social Media"
  subtitle="Manage connected accounts & posting"
>
  <ConnectedAccountsList role="business" />

  <div className="border-t border-gray-100 pt-4 mt-4">
    <details className="group">
      <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-gray-600">
        Profile Links (for public profile display)
      </summary>
      <div className="mt-3">
        <SocialMediaLinks
          formData={socialFormData}
          onInputChange={onInputChange}
        />
      </div>
    </details>
  </div>
</SettingsSection>
```

- [ ] **Step 3: Update CreatorSettingsSections**

In `src/components/settings/CreatorSettingsSections.tsx`:

1. Add import: `import { ConnectedAccountsList } from '@/components/outstand/ConnectedAccountsList';`
2. Replace the Social Links section (around lines 227–238):

```tsx
{/* 4. Social Media */}
<SettingsSection
  value="social"
  icon="📡"
  title="Social Media"
  subtitle="Manage connected accounts & posting"
>
  <ConnectedAccountsList role="creator" />

  <div className="border-t border-gray-100 pt-4 mt-4">
    <details className="group">
      <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-gray-600">
        Profile Links (for public profile display)
      </summary>
      <div className="mt-3">
        <CreatorSocialMediaLinks
          formData={socialFormData}
          onInputChange={handleSocialChange}
        />
      </div>
    </details>
  </div>
</SettingsSection>
```

- [ ] **Step 4: Verify build and test**

```bash
npm run build
```

Run `npm run dev`:
- Navigate to Business Settings → Social Media section: should show connected accounts list + Manager CTA + collapsed Profile Links
- Navigate to Creator Settings → Social Media section: same pattern
- "Connect" buttons trigger OAuth flow
- "Open Social Media Manager →" links to the correct dashboard route
- Profile Links are collapsed by default; clicking expands the old URL fields
- Verify no regressions to other settings sections

- [ ] **Step 5: Commit**

```bash
git add src/components/outstand/ConnectedAccountsList.tsx src/components/settings/BusinessSettingsSections.tsx src/components/settings/CreatorSettingsSections.tsx
git commit -m "feat: integrate connected accounts into Settings pages

Replace manual URL inputs with ConnectedAccountsList showing real
Outstand connection status. Adds CTA to Social Media Manager. Old
URL fields preserved under collapsed 'Profile Links' sub-section."
```

---

### Task 12: Final Integration Test and Cleanup

**Files:**
- Modify: `src/pages/OutstandManager.tsx` (cleanup only — remove any remaining stubs)

- [ ] **Step 1: Clean up OutstandManager**

In `src/pages/OutstandManager.tsx`:
- Remove any remaining stub components
- Remove the unused `ScheduledTab` import if it's still there
- Verify all imports are used
- Verify the `DCSkeleton` import is present (needed by CalendarTab)

- [ ] **Step 2: Full build verification**

```bash
npm run build
```

Expected: clean build, zero TypeScript errors, zero warnings.

- [ ] **Step 3: Test all 6 tabs on desktop (768px+)**

Navigate to `/dashboard/business/social` and verify each tab:
1. **Compose** — existing functionality still works (compose, upload media, schedule, publish)
2. **Calendar** — weekly grid renders, month view toggles, platform filter works, drag-and-drop reschedules
3. **Published** — existing functionality still works (post list, per-post metrics, delete)
4. **Engagement** — comment list loads, selecting a comment shows detail panel, reply sends
5. **Analytics** — KPI cards render, heatmap shows, top posts listed, platform breakdown renders
6. **Accounts** — existing connect/disconnect functionality still works

- [ ] **Step 4: Test all 6 tabs on mobile (375px)**

Resize to 375px or use mobile emulation and verify:
1. Tab bar shows 6 tabs with short labels (New / Calendar / Posts / Engage / Stats / Accounts)
2. Calendar shows day strip with stacked cards
3. Engagement shows card layout with Reply buttons + bottom sheet
4. Analytics shows 2×2 KPI grid and top posts (no chart/heatmap)
5. No horizontal overflow on any tab

- [ ] **Step 5: Test Settings integration**

1. Navigate to Business Settings → "Social Media" section
2. Verify connected accounts display with real connection status
3. Click "Open Social Media Manager →" — verify it navigates correctly
4. Expand "Profile Links" — verify old URL fields still work
5. Repeat for Creator Settings

- [ ] **Step 6: Commit final cleanup**

```bash
git add -u
git commit -m "chore: clean up OutstandManager — remove stubs, verify all tab imports"
```
