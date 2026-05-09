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
