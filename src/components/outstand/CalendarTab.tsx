import React, { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Post } from '@outstand-so/ui';
import { useOutstandApi } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { DayGrid } from './calendar/DayGrid';
import { WeekGrid } from './calendar/WeekGrid';
import { MonthGrid } from './calendar/MonthGrid';
import { isScheduled } from '@/lib/outstandUtils';
import { postsForDay, isSameDay } from './calendar/calendarUtils';
import { toast } from 'sonner';
import { type SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';
import { DonnyWeeklyPlanner } from './DonnyWeeklyPlanner';
import { RescheduleConfirmDialog } from './RescheduleConfirmDialog';
import { AgendaView } from '@/components/schedule/agenda/AgendaView';
import { groupByDay, startOfDay, type AgendaItem } from '@/components/schedule/agenda/agendaModel';
import { outstandPostToAgendaItem, deadlineToAgendaItem, sponsorshipToAgendaItem } from '@/components/schedule/agenda/agendaAdapters';
import { AppChip } from '@/components/app/AppChip';

type CalendarView = 'agenda' | 'day' | 'week' | 'month';

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
  initialDate?: Date;
  onPostClick?: (post: Post) => void;
  onSchedule?: () => void;
}

export const CalendarTab: React.FC<CalendarTabProps> = ({ posts, isLoading, onChanged, onSwitchTab, campaignDeadlines = [], sponsorshipEvents = [], initialDate, onPostClick, onSchedule }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const [view, setView] = useState<CalendarView>('agenda');
  const [currentDate, setCurrentDate] = useState(() => initialDate ?? new Date());
  const [selectedDay, setSelectedDay] = useState(() => initialDate ?? new Date());
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [pendingReschedule, setPendingReschedule] = useState<{
    post: Post;
    newDate: Date;
    isPast: boolean;
  } | null>(null);

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

  const navigateDay = useCallback((delta: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
    setSelectedDay((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  }, []);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDay(today);
    setView('agenda');
  }, []);

  const handleDayClick = useCallback((day: Date) => {
    setSelectedDay(day);
    setCurrentDate(day);
    setView('day');
  }, []);

  const executeReschedule = useCallback(async (post: Post, newDate: Date) => {
    if (!isScheduled(post)) return;
    const accountIds = (post.socialAccounts ?? []).map((sa: { id?: string }) => sa.id).filter(Boolean);
    try {
      const patchRes = await api.patch(`/posts/${post.id}`, {
        scheduledAt: newDate.toISOString(),
        social_account_ids: accountIds,
      });
      if (!patchRes.success) {
        const delRes = await api.delete(`/posts/${post.id}`);
        if (!delRes.success) throw new Error(delRes.error || 'Failed to delete post for reschedule');
        const createRes = await api.post('/posts', {
          ...post,
          id: undefined,
          scheduledAt: newDate.toISOString(),
          social_account_ids: accountIds,
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

  const handleReschedule = useCallback((post: Post, newDate: Date) => {
    if (!isScheduled(post)) return;
    const originalTime = post.scheduledAt ? new Date(post.scheduledAt) : new Date();
    const isPast = originalTime.getTime() < Date.now();
    setPendingReschedule({ post, newDate, isPast });
  }, []);

  const confirmReschedule = useCallback(async () => {
    if (!pendingReschedule) return;
    await executeReschedule(pendingReschedule.post, pendingReschedule.newDate);
    setPendingReschedule(null);
  }, [pendingReschedule, executeReschedule]);

  const handlePostClick = useCallback((post: Post) => {
    if (onPostClick) {
      onPostClick(post);
      return;
    }
    if (isScheduled(post)) {
      toast.info(`Scheduled for ${new Date(post.scheduledAt!).toLocaleString()}. Drag to reschedule (desktop) or click to edit.`);
    }
  }, [onPostClick]);

  const agendaItems = useMemo<AgendaItem[]>(() => {
    const postItems = filteredPosts
      .map((p) => {
        const item = outstandPostToAgendaItem(p);
        if (item) item.onClick = () => handlePostClick(p);
        return item;
      })
      .filter((x): x is AgendaItem => x !== null);
    const deadlineItems = campaignDeadlines.map(deadlineToAgendaItem);
    const sponsorshipItems = sponsorshipEvents.map(sponsorshipToAgendaItem);
    return [...postItems, ...deadlineItems, ...sponsorshipItems];
  }, [filteredPosts, campaignDeadlines, sponsorshipEvents, handlePostClick]);

  const agendaDays = useMemo(
    () => groupByDay(agendaItems, { from: startOfDay(currentDate) }),
    [agendaItems, currentDate],
  );

  const hasContentOn = useCallback(
    (day: Date) =>
      postsForDay(filteredPosts, day).length > 0 ||
      campaignDeadlines.some((d) => isSameDay(d.deadline, day)) ||
      sponsorshipEvents.some((s) => isSameDay(s.date, day)),
    [filteredPosts, campaignDeadlines, sponsorshipEvents],
  );

  const headerLabel = view === 'day'
    ? currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : view === 'week'
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
        {view !== 'agenda' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={view === 'day' ? 'Previous day' : view === 'week' ? 'Previous week' : 'Previous month'}
              onClick={() => (view === 'day' ? navigateDay(-1) : view === 'week' ? navigateWeek(-1) : navigateMonth(-1))}
              className="p-1.5 rounded-lg border border-dc-teal/15 hover:bg-dc-teal/[0.04]"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <span className="text-sm font-bold text-gray-900 min-w-[160px] text-center">{headerLabel}</span>
            <button
              type="button"
              aria-label={view === 'day' ? 'Next day' : view === 'week' ? 'Next week' : 'Next month'}
              onClick={() => (view === 'day' ? navigateDay(1) : view === 'week' ? navigateWeek(1) : navigateMonth(1))}
              className="p-1.5 rounded-lg border border-dc-teal/15 hover:bg-dc-teal/[0.04]"
            >
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        ) : <div />}
        <div className="hidden md:flex gap-1">
          <AppChip active={view === 'agenda'} onClick={() => setView('agenda')} className="px-3 text-xs">
            Agenda
          </AppChip>
          <AppChip active={view === 'day'} onClick={() => setView('day')} className="px-3 text-xs">
            Day
          </AppChip>
          <AppChip active={view === 'week'} onClick={() => setView('week')} className="px-3 text-xs">
            Week
          </AppChip>
          <AppChip active={view === 'month'} onClick={() => setView('month')} className="px-3 text-xs">
            Month
          </AppChip>
          <AppChip onClick={goToToday} className="px-3 text-xs">
            Today
          </AppChip>
        </div>
      </div>

      {/* Platform filter pills */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {PLATFORM_FILTERS.map((f) => (
          <AppChip
            key={f.key}
            active={platformFilter === f.key}
            onClick={() => setPlatformFilter(f.key)}
            className="px-2.5 py-1 text-[10px] whitespace-nowrap"
          >
            {f.label}
          </AppChip>
        ))}
      </div>

      {/* Agenda (default) / Desktop grid views */}
      {view === 'agenda' ? (
        <AgendaView
          days={agendaDays}
          today={new Date()}
          anchorDate={currentDate}
          onJumpToDate={(d) => { setCurrentDate(d); setSelectedDay(d); }}
          onTodayClick={goToToday}
          onScheduleClick={onSchedule ?? (() => onSwitchTab?.('compose'))}
          hasContentOn={hasContentOn}
          variant={isMobile ? 'mobile' : 'desktop'}
          emptyState={
            <div className="text-center py-14">
              <p className="text-sm text-dc-text-muted mb-3">Nothing scheduled yet.</p>
            </div>
          }
        />
      ) : view === 'day' ? (
        <DayGrid
          posts={filteredPosts}
          day={selectedDay}
          onReschedule={handleReschedule}
          onPostClick={handlePostClick}
          campaignDeadlines={campaignDeadlines}
          sponsorshipEvents={sponsorshipEvents}
        />
      ) : view === 'week' ? (
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

      {/* Legend (desktop only, Week/Day grids only) */}
      {(view === 'week' || view === 'day') && (
        <div className="hidden md:flex items-center gap-4 mt-3 pt-3 border-t border-dc-teal/10 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-dc-teal" /> Scheduled</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Published</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Failed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-pink-400" /> Deadline</span>
        </div>
      )}

      <DonnyWeeklyPlanner />

      <RescheduleConfirmDialog
        open={!!pendingReschedule}
        onOpenChange={(open) => { if (!open) setPendingReschedule(null); }}
        post={pendingReschedule?.post ?? null}
        newDate={pendingReschedule?.newDate ?? null}
        isPast={pendingReschedule?.isPast ?? false}
        onConfirm={confirmReschedule}
      />
    </div>
  );
};
