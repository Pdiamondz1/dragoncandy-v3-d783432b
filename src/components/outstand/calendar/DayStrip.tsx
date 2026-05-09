import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { CalendarPostCard } from './CalendarPostCard';
import { getWeekDates, isSameDay, postsForDay } from './calendarUtils';
import { Plus } from 'lucide-react';

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
