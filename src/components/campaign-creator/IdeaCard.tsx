import type { CampaignIdea } from '@/types/campaignCreator';
import { cn } from '@/lib/utils';

interface IdeaCardProps {
  idea: CampaignIdea;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'IG', tiktok: 'TT', facebook: 'FB', youtube: 'YT', google_business: 'Google', multi_platform: 'Multi',
};

export function IdeaCard({ idea, isSelected, onSelect }: IdeaCardProps) {
  return (
    <button type="button" onClick={() => onSelect(idea.id)}
      className={cn(
        'w-full text-left bg-white rounded-2xl p-4 shadow-sm transition-all',
        isSelected
          ? 'border-2 border-teal-400 ring-2 ring-teal-400/20'
          : 'border border-teal-300 hover:border-teal-400'
      )}>
      <div className="flex items-start gap-2">
        <span className="text-2xl">{idea.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 truncate">{idea.title}</h3>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{idea.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="bg-gray-100 rounded-full px-2 py-1 text-xs font-medium text-gray-700">
          ${idea.budget_range.min}–${idea.budget_range.max}
        </span>
        <span className="bg-gray-100 rounded-full px-2 py-1 text-xs font-medium text-gray-700">
          {idea.timeline_days} days
        </span>
        {idea.recommended_platforms.map((p) => (
          <span key={p} className="bg-gray-100 rounded-full px-2 py-1 text-xs font-medium text-gray-700">
            {PLATFORM_LABELS[p] || p}
          </span>
        ))}
      </div>
    </button>
  );
}
