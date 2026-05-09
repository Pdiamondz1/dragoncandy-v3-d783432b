import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { isSameDay, postsForDay } from './calendarUtils';
import { isScheduled } from '@/pages/OutstandManager';
import type { CampaignDeadline } from '@/components/outstand/CalendarTab';
import { SponsorshipMarkerDot, type SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';

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
  campaignDeadlines?: CampaignDeadline[];
  sponsorshipEvents?: SponsorshipEvent[];
}

export const MonthGrid: React.FC<MonthGridProps> = ({ posts, year, month, onDayClick, campaignDeadlines = [], sponsorshipEvents = [] }) => {
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
            const deadlinesOnDay = campaignDeadlines.filter((d) => isSameDay(d.deadline, day));
            const sponsorshipsOnDay = sponsorshipEvents.filter((s) => isSameDay(s.date, day));

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
                {(dayPostsList.length > 0 || deadlinesOnDay.length > 0 || sponsorshipsOnDay.length > 0) && (
                  <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                    {scheduled > 0 && <span className="w-1.5 h-1.5 rounded-full bg-dc-teal" />}
                    {published > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    {deadlinesOnDay.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />}
                    {sponsorshipsOnDay.map((s) => (
                      <SponsorshipMarkerDot key={s.id} type={s.type} />
                    ))}
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
