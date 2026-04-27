import { Video } from 'lucide-react';
import type { CampaignMediaItem } from '@/types/campaignMedia';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignFootageSectionProps {
  footageItems: CampaignMediaItem[];
  hasApplied: boolean;
}

export function CampaignFootageSection({ footageItems, hasApplied }: CampaignFootageSectionProps) {
  if (footageItems.length === 0) return null;

  return (
    <CampaignDetailSection title="Business Footage">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Video className="w-4 h-4 text-dc-teal" />
          📹 Raw footage provided
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        The business has uploaded footage you can use
      </p>
      <div className="grid grid-cols-3 gap-2">
        {footageItems.map((item) => (
          <div
            key={item.id}
            className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200"
          >
            <img
              src={item.thumbnail_url || item.file_url}
              alt={item.file_name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {!hasApplied && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-[10px] font-semibold text-center px-2">
                  Apply to access
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </CampaignDetailSection>
  );
}
