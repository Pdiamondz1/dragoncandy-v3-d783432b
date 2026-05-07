import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DonnyPicksBadge } from './DonnyPicksBadge';
import { formatBudget } from '@/lib/campaignUtils';
import type { DonnyPick } from '@/hooks/useDonnyMatches';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';
import logo from '@/assets/Transparent_DragonCandy_logo.webp';

interface DonnyPicksRowProps {
  picks: DonnyPick[];
  onViewDetail: (campaign: PublicCampaign) => void;
}

export const DonnyPicksRow: React.FC<DonnyPicksRowProps> = ({ picks, onViewDetail }) => {
  if (picks.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <img src={logo} alt="Business logo" className="w-6 h-6" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">Donny's Picks for You</h2>
          <p className="text-[11px] text-gray-500">Matched based on your skills, location, and ratings</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 md:overflow-x-visible md:grid md:grid-cols-2 lg:grid-cols-3 md:pb-0">
        {picks.map((pick) => (
          <Card
            key={pick.campaign.id}
            className="min-w-[280px] max-w-[320px] flex-shrink-0 hover:shadow-lg transition-shadow cursor-pointer border-2 border-dc-teal/30 hover:border-dc-teal"
            onClick={() => onViewDetail(pick.campaign)}
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 flex-1 mr-2">
                  {pick.campaign.title}
                </h3>
                <DonnyPicksBadge score={pick.score} />
              </div>
              {pick.campaign.description && (
                <p className="text-xs text-gray-500 line-clamp-2">{pick.campaign.description}</p>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <span className="text-sm text-dc-teal font-semibold">{formatBudget(pick.campaign)}</span>
                {pick.campaign.business_profile?.business_name && (
                  <span className="text-xs text-gray-400">by {pick.campaign.business_profile.business_name}</span>
                )}
              </div>
              {pick.matchReasons.length > 0 && (
                <p className="text-[10px] text-gray-400">
                  Matches your: {pick.matchReasons.join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
