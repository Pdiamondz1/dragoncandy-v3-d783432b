import React, { useMemo, useState, useCallback } from 'react';
import type { Post } from '@outstand-so/ui';
import { CalendarPostCard } from './CalendarPostCard';
import { isSameDay, postsForDay } from './calendarUtils';
import { isScheduled } from '@/lib/outstandUtils';
import type { CampaignDeadline } from '@/components/outstand/CalendarTab';
import { SponsorshipMarkerLabel, type SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function getPostHour(post: Post): number {
  const stamp = post.scheduledAt ?? post.publishedAt;
  if (!stamp) return 12;
  return new Date(stamp).getHours();
}

interface DayGridProps {
  posts: Post[];
  day: Date;
  onReschedule: (post: Post, newDate: Date) => void;
  onPostClick: (post: Post) => void;
  campaignDeadlines?: CampaignDeadline[];
  sponsorshipEvents?: SponsorshipEvent[];
}

export const DayGrid: React.FC<DayGridProps> = ({
  posts,
  day,
  onReschedule,
  onPostClick,
  campaignDeadlines = [],
  sponsorshipEvents = [],
}) => {
  const dayPosts = useMemo(() => postsForDay(posts, day), [posts, day]);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);

  const deadlinesOnDay = useMemo(
    () => campaignDeadlines.filter((d) => isSameDay(d.deadline, day)),
    [campaignDeadlines, day],
  );

  const sponsorshipsOnDay = useMemo(
    () => sponsorshipEvents.filter((s) => isSameDay(s.date, day)),
    [sponsorshipEvents, day],
  );

  const handleDragStart = useCallback((e: React.DragEvent, post: Post) => {
    e.dataTransfer.setData('text/plain', post.id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, hour: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverHour(hour);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverHour(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, hour: number) => {
      e.preventDefault();
      setDragOverHour(null);
      const postId = e.dataTransfer.getData('text/plain');
      const post = posts.find((p) => p.id === postId);
      if (!post || !isScheduled(post)) return;
      const originalTime = post.scheduledAt ? new Date(post.scheduledAt) : new Date();
      const newDate = new Date(day);
      newDate.setHours(hour, originalTime.getMinutes(), 0, 0);
      onReschedule(post, newDate);
    },
    [posts, day, onReschedule],
  );

  return (
    <div className="hidden md:block">
      {(deadlinesOnDay.length > 0 || sponsorshipsOnDay.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {deadlinesOnDay.map((d) => (
            <div
              key={d.id}
              className="text-[10px] bg-pink-100 text-pink-700 border border-pink-200 rounded-full px-2.5 py-1 font-semibold"
              title={`Campaign deadline: ${d.title}`}
            >
              {d.title}
            </div>
          ))}
          {sponsorshipsOnDay.map((s) => (
            <SponsorshipMarkerLabel key={s.id} event={s} />
          ))}
        </div>
      )}

      <div className="border border-gray-100 rounded-xl overflow-hidden">
        {HOURS.map((hour) => {
          const hourPosts = dayPosts.filter((p) => getPostHour(p) === hour);
          const isDragTarget = dragOverHour === hour;

          return (
            <div
              key={hour}
              className={`flex border-b border-gray-50 last:border-b-0 min-h-[48px] transition-colors ${isDragTarget ? 'bg-dc-teal/5' : ''}`}
              onDragOver={(e) => handleDragOver(e, hour)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, hour)}
            >
              <div className="w-16 flex-shrink-0 text-[10px] font-semibold text-gray-400 py-2 px-2 border-r border-gray-100 text-right">
                {formatHourLabel(hour)}
              </div>
              <div className="flex-1 py-1 px-2 flex flex-wrap gap-1.5">
                {hourPosts.map((post) => (
                  <CalendarPostCard
                    key={post.id}
                    post={post}
                    draggable={isScheduled(post)}
                    onDragStart={handleDragStart}
                    onReschedule={onPostClick}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {dayPosts.length === 0 && (
        <div className="text-center py-8">
          <p className="text-xs text-gray-400">No posts scheduled for this day</p>
        </div>
      )}
    </div>
  );
};
