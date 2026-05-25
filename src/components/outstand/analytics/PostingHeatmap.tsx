import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { isInPublishedFeed } from '@/lib/outstandUtils';

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
      const dayIndex = (d.getDay() + 6) % 7;
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
