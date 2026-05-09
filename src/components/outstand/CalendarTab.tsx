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
import { type SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';
import { DonnyWeeklyPlanner } from './DonnyWeeklyPlanner';

type CalendarView = 'week' | 'month';

export interface CampaignDeadline {
  id: string;
  title: string;
  deadline: Date;
  campaignId: string;
}

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
  campaignDeadlines?: CampaignDeadline[];
  sponsorshipEvents?: SponsorshipEvent[];
}

export const CalendarTab: React.FC<CalendarTabProps> = ({ posts, isLoading, onChanged, onSwitchTab, campaignDeadlines = [], sponsorshipEvents = [] }) => {
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
            aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
            onClick={() => (view === 'week' ? navigateWeek(-1) : navigateMonth(-1))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-sm font-bold text-gray-900 min-w-[160px] text-center">{headerLabel}</span>
          <button
            type="button"
            aria-label={view === 'week' ? 'Next week' : 'Next month'}
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
          campaignDeadlines={campaignDeadlines}
          sponsorshipEvents={sponsorshipEvents}
        />
      ) : (
        <MonthGrid
          posts={filteredPosts}
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          onDayClick={handleDayClick}
          campaignDeadlines={campaignDeadlines}
          sponsorshipEvents={sponsorshipEvents}
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
        campaignDeadlines={campaignDeadlines}
        sponsorshipEvents={sponsorshipEvents}
      />

      {/* Legend (desktop only) */}
      <div className="hidden md:flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-dc-teal" /> Scheduled</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Published</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Failed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-pink-400" /> Deadline</span>
      </div>

      <DonnyWeeklyPlanner />
    </div>
  );
};
