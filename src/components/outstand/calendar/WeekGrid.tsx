import React, { useMemo, useState, useCallback } from 'react';
import type { Post } from '@outstand-so/ui';
import { CalendarPostCard } from './CalendarPostCard';
import { getWeekDates, isSameDay, postsForDay } from './calendarUtils';
import { isScheduled } from '@/lib/outstandUtils';
import type { CampaignDeadline } from '@/components/outstand/CalendarTab';
import { SponsorshipMarkerLabel, type SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface WeekGridProps {
  posts: Post[];
  weekStart: Date;
  onReschedule: (post: Post, newDate: Date) => void;
  onPostClick: (post: Post) => void;
  campaignDeadlines?: CampaignDeadline[];
  sponsorshipEvents?: SponsorshipEvent[];
}

export const WeekGrid: React.FC<WeekGridProps> = ({ posts, weekStart, onReschedule, onPostClick, campaignDeadlines = [], sponsorshipEvents = [] }) => {
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
    <div className="hidden md:grid grid-cols-7 min-h-[320px] border-t border-dc-teal/10">
      {weekDates.map((day, i) => {
        const dayPosts = postsForDay(posts, day);
        const isToday = isSameDay(day, today);
        const isDragTarget = dragOverDay === i;

        return (
          <div
            key={day.toISOString()}
            className={`border-r border-dc-teal/10 last:border-r-0 p-1.5 transition-colors ${isDragTarget ? 'bg-dc-teal/5' : ''}`}
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
            {campaignDeadlines
              .filter((d) => isSameDay(d.deadline, day))
              .map((d) => (
                <div
                  key={d.id}
                  className="text-[9px] bg-pink-100 text-pink-700 border border-pink-200 rounded px-1.5 py-0.5 truncate"
                  title={`Campaign deadline: ${d.title}`}
                >
                  {d.title}
                </div>
              ))}
            {sponsorshipEvents
              .filter((s) => isSameDay(s.date, day))
              .map((s) => (
                <SponsorshipMarkerLabel key={s.id} event={s} />
              ))}
          </div>
        );
      })}
    </div>
  );
};
