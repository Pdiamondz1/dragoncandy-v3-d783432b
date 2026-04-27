import React from 'react';
import { ChevronDown, Target } from 'lucide-react';
import type { BrandCampaignItem } from '@/hooks/useBrandActiveCampaigns';

interface CampaignContextSelectorProps {
  campaigns: BrandCampaignItem[];
  selectedId: string | null;
  onSelect: (campaignId: string | null) => void;
  isLoading?: boolean;
}

export const CampaignContextSelector: React.FC<CampaignContextSelectorProps> = ({
  campaigns,
  selectedId,
  onSelect,
  isLoading,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = campaigns.find((c) => c.id === selectedId);

  if (isLoading) {
    return (
      <div className="h-9 w-48 bg-gray-100 rounded-full animate-pulse" />
    );
  }

  if (campaigns.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-full text-sm text-dc-teal hover:bg-teal-100 transition-colors max-w-[200px]"
      >
        <Target className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">
          {selected ? selected.title : 'Select campaign'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 md:left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 min-w-[240px] max-h-[280px] overflow-y-auto">
          {/* Clear selection */}
          <button
            onClick={() => { onSelect(null); setIsOpen(false); }}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
              !selectedId ? 'text-dc-teal font-medium' : 'text-gray-500'
            }`}
          >
            No campaign (browse all)
          </button>

          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => { onSelect(campaign.id); setIsOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                selectedId === campaign.id ? 'text-dc-teal font-medium' : 'text-gray-700'
              }`}
            >
              <div className="truncate font-medium">{campaign.title}</div>
              <div className="text-xs text-gray-400 truncate">{campaign.subtitle}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
