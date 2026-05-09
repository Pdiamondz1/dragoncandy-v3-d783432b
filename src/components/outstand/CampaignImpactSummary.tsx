import React from 'react';
import { type BrandSponsorshipAnalytics } from '@/hooks/outstand/useBrandSponsorshipAnalytics';
import { TrendingUp, Users, BarChart3 } from 'lucide-react';

interface CampaignImpactSummaryProps {
  sponsorship: BrandSponsorshipAnalytics;
}

export const CampaignImpactSummary: React.FC<CampaignImpactSummaryProps> = ({ sponsorship }) => {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 mb-4">
      <h3 className="text-xs font-bold text-dc-teal uppercase tracking-wider mb-3">Campaign Impact</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="text-center">
          <TrendingUp className="h-4 w-4 text-dc-teal mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900">--</p>
          <p className="text-[10px] text-gray-400">Combined Reach</p>
        </div>
        <div className="text-center">
          <Users className="h-4 w-4 text-pink-400 mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900">--</p>
          <p className="text-[10px] text-gray-400">Engagement Rate</p>
        </div>
        <div className="text-center">
          <BarChart3 className="h-4 w-4 text-amber-400 mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900">--</p>
          <p className="text-[10px] text-gray-400">Cost / Impression</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-extrabold text-gray-900">--</p>
          <p className="text-[10px] text-gray-400">Total Posts</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {[
          { label: 'Restaurant', color: 'bg-dc-teal', name: sponsorship.restaurantName },
          { label: 'Creator', color: 'bg-pink-400', name: sponsorship.creatorName ?? 'Pending' },
          { label: 'Brand', color: 'bg-amber-400', name: 'You' },
        ].map(({ label, color, name }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-16 text-right">{name}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div className={`${color} rounded-full h-2 w-0`} />
            </div>
            <span className="text-[10px] text-gray-400 w-8">--</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-300 text-center mt-3 italic">
        Analytics will populate as posts are tracked across all parties
      </p>
    </div>
  );
};
