import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { isInPublishedFeed } from '@/lib/outstandUtils';
import { usePostPerformance } from '@/hooks/outstand/usePostPerformance';
import { signalForVisible } from '@/lib/postPerformance';

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

/**
 * WHAT THIS USED TO DO, and why it changed.
 *
 * It was titled "Best Posting Times" with a legend reading "Low engagement" →
 * "High engagement", and it computed `counts[slot][day]++` — the number of posts
 * published in each slot. No engagement value was read anywhere.
 *
 * So it told a business their best times to post based on nothing but when they
 * already posted. Perfectly circular: post every Tuesday at 9am and it advises
 * Tuesday at 9am, with a confident colour ramp. Of the three components on this
 * tab it was the most actively harmful, because unlike a mislabelled chart it
 * drove a decision — and it is precisely the decision Donny is meant to inform.
 *
 * Now the grid shows what it measures. With enough measured posts it weights by
 * real interactions and is called "Best Posting Times"; below that it is
 * "When You Post", a volume map, labelled as one.
 */
export const PostingHeatmap: React.FC<PostingHeatmapProps> = ({ posts }) => {
  const { byId } = usePostPerformance();

  const published = useMemo(() => posts.filter(isInPublishedFeed), [posts]);

  // Scoped to what this grid actually draws. `posts` arrives platform-filtered
  // from AnalyticsTab, so an account-wide verdict could title an all-zero grid
  // "Best Posting Times" when the selected platform has no measurements.
  const signal = useMemo(
    () => signalForVisible(published.map((p) => p.id), new Set(byId.keys())),
    [published, byId],
  );
  const weighted = signal.hasSignal;

  const grid = useMemo(() => {
    const cells: number[][] = Array.from({ length: 4 }, () => Array(7).fill(0));
    let max = 0;

    published.forEach((post) => {
      const stamp = post.publishedAt ?? post.createdAt;
      if (!stamp) return;
      const d = new Date(stamp);
      const dayIndex = (d.getDay() + 6) % 7;
      const slotIndex = getTimeSlot(d.getHours());

      // Weighted mode adds the post's real interactions; volume mode adds 1.
      // In weighted mode an unmeasured post contributes nothing rather than a
      // phantom 1, so the map never mixes "did well" with "exists".
      const value = weighted ? (byId.get(post.id)?.interactions ?? 0) : 1;
      cells[slotIndex][dayIndex] += value;
      max = Math.max(max, cells[slotIndex][dayIndex]);
    });

    return { cells, max };
  }, [published, byId, weighted]);

  function intensityClass(value: number): string {
    if (grid.max === 0 || value === 0) return TEAL_SHADES[0];
    const pct = value / grid.max;
    if (pct < 0.25) return TEAL_SHADES[0];
    if (pct < 0.5) return TEAL_SHADES[1];
    if (pct < 0.75) return TEAL_SHADES[2];
    return TEAL_SHADES[3];
  }

  return (
    <div className="hidden md:block">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-bold text-gray-900">
          {weighted ? 'Best Posting Times' : 'When You Post'}
        </div>
        <div className="text-[10px] text-dc-text-muted">
          {weighted ? `by engagement · ${signal.n} measured` : 'post volume'}
        </div>
      </div>

      <div className="grid gap-0.5" style={{ gridTemplateColumns: 'auto repeat(7, 1fr)' }}>
        <div />
        {DAY_LABELS.map((label, i) => (
          <div key={i} className="text-[9px] font-semibold text-gray-400 text-center">{label}</div>
        ))}
        {TIME_SLOTS.map((slot, si) => (
          <React.Fragment key={slot}>
            <div className="text-[9px] text-gray-400 pr-1 flex items-center">{slot}</div>
            {DAY_LABELS.map((_, di) => (
              <div key={di} className={`h-4 rounded-sm ${intensityClass(grid.cells[si][di])}`} />
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* The legend says which quantity the ramp encodes. It previously claimed
          engagement while encoding volume. */}
      <div className="flex justify-between mt-2 text-[9px] text-gray-300">
        <span>{weighted ? 'Less engagement' : 'Fewer posts'}</span>
        <div className="flex gap-0.5">
          {TEAL_SHADES.map((shade) => (
            <span key={shade} className={`w-2.5 h-1.5 rounded-sm ${shade}`} />
          ))}
        </div>
        <span>{weighted ? 'More engagement' : 'More posts'}</span>
      </div>

      {!weighted && (
        <p className="text-[10px] text-dc-text-muted mt-2">
          This shows when you post, not what performed. Engagement weighting needs{' '}
          {signal.needed} more measured post{signal.needed !== 1 ? 's' : ''}.
        </p>
      )}
    </div>
  );
};
