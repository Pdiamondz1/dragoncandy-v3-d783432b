/** Single dark story card rendering one ScorecardStory — mirrors the /internal ops-deck StatCard look. */
import type { ScorecardStory } from '@/lib/internal/scorecardModel';

const DOT_CLASS: Record<ScorecardStory['signal'], string> = {
  green: 'bg-dc-teal',
  amber: 'bg-dc-pink-accent',
  info: 'bg-white/40',
};

interface ScorecardStoryCardProps {
  story: ScorecardStory;
}

export function ScorecardStoryCard({ story }: ScorecardStoryCardProps) {
  const detailClass = story.signal === 'amber' ? 'text-dc-pink' : 'text-dc-teal';

  return (
    <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[story.signal]}`} />
        <p className="font-mono text-[11px] uppercase tracking-wider text-dc-teal">{story.title}</p>
      </div>
      <p className="mt-2 text-2xl font-extrabold text-white">{story.headline}</p>
      <p className="mt-2 text-sm text-white/60">{story.meaning}</p>
      {story.detail && <p className={`mt-2 text-sm font-semibold ${detailClass}`}>{story.detail}</p>}
    </div>
  );
}
