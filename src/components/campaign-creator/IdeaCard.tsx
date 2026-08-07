import type { CampaignIdea } from '@/types/campaignCreator';
import { cn } from '@/lib/utils';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { getSuggestedRange, formatSuggestedRange } from '@/lib/campaignPricing';

interface IdeaCardProps {
  idea: CampaignIdea;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'IG', tiktok: 'TT', facebook: 'FB', youtube: 'YT', google_business: 'Google', multi_platform: 'Multi',
};

export function IdeaCard({ idea, isSelected, onSelect }: IdeaCardProps) {
  // A range, not a single figure — a lone number here re-anchors the business one screen
  // before they reach the price field.
  const suggestedRange = getSuggestedRange({
    tier: idea.tier,
    deliverableCount: idea.deliverables.length,
    suggestedMin: idea.suggested_price_min,
    suggestedMax: idea.suggested_price_max,
  });

  return (
    <button type="button" onClick={() => onSelect(idea.id)}
      className={cn(
        'w-full text-left bg-white rounded-2xl p-4 shadow-sm transition-all',
        isSelected
          ? 'border-2 border-teal-400 ring-2 ring-teal-400/20'
          : 'border border-teal-300 hover:border-teal-400'
      )}>
      <div className="min-w-0">
        <h3 className="font-bold text-gray-900 truncate">{idea.title}</h3>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{idea.description}</p>
      </div>
      {/* Truthy-guarded, not typed-guarded: a draft-restored idea bypasses Zod. */}
      {idea.target_audience && (
        <p className="mt-2 text-xs font-medium text-dc-teal line-clamp-2">
          <span className="font-normal text-dc-text-muted">Brings in </span>
          {idea.target_audience}
        </p>
      )}
      {idea.is_wildcard && (
        <span className="inline-block mt-2 rounded-full bg-dc-pink/50 px-2 py-1 text-xs font-bold text-dc-pink-accent">
          ✦ Wildcard
        </span>
      )}
      {idea.creative_concept && (
        <p className="mt-2 text-sm italic text-dc-text-muted line-clamp-3">
          {idea.creative_concept}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        <AppStatusBadge tone="neutral">
          {formatSuggestedRange(suggestedRange)}
        </AppStatusBadge>
        <AppStatusBadge tone="neutral">
          {idea.timeline_days} days
        </AppStatusBadge>
        {idea.recommended_platforms.map((p) => (
          <AppStatusBadge key={p} tone="neutral">
            {PLATFORM_LABELS[p] || p}
          </AppStatusBadge>
        ))}
      </div>
      {idea.content_strategy && (
        <p className="text-xs text-dc-teal font-medium mt-2">
          {idea.content_strategy.posts.length} posts over {idea.content_strategy.duration_days} days
          {' · '}
          {idea.content_strategy.cadence} cadence
        </p>
      )}
    </button>
  );
}
