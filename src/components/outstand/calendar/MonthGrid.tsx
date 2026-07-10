import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { isSameDay, postsForDay } from './calendarUtils';
import type { CampaignDeadline } from '@/components/outstand/CalendarTab';
import { SponsorshipMarkerDot, type SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';
import { getCaption, getUniqueNetworks } from '@/components/outstand/postUtils';

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
            const deadlinesOnDay = campaignDeadlines.filter((d) => isSameDay(d.deadline, day));
            const sponsorshipsOnDay = sponsorshipEvents.filter((s) => isSameDay(s.date, day));

            return (
              <button
                key={di}
                type="button"
                onClick={() => onDayClick(day)}
                className={`md:min-h-[92px] h-14 border-b border-r border-gray-50 last:border-r-0 flex flex-col items-center justify-start pt-1 hover:bg-gray-50 transition-colors ${isToday ? 'bg-teal-50/50' : ''}`}
              >
                <span className={`text-xs font-bold ${isToday ? 'text-dc-teal' : 'text-gray-700'}`}>
                  {day.getDate()}
                </span>
                {(dayPostsList.length > 0 || deadlinesOnDay.length > 0) && (
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
                )}
                {sponsorshipsOnDay.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
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
