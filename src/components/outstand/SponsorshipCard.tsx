import React from 'react';
import { type BrandSponsorshipAnalytics } from '@/hooks/outstand/useBrandSponsorshipAnalytics';
import { Users, Store, Briefcase } from 'lucide-react';

interface SponsorshipCardProps {
  sponsorship: BrandSponsorshipAnalytics;
  isSelected: boolean;
  onSelect: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export const SponsorshipCard: React.FC<SponsorshipCardProps> = ({ sponsorship, isSelected, onSelect }) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
        isSelected ? 'border-dc-teal bg-dc-teal/5' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-sm text-gray-900 truncate flex-1">{sponsorship.campaignTitle}</h3>
        <StatusBadge status={sponsorship.status} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Store className="h-3 w-3" />
          <span>{sponsorship.restaurantName}</span>
        </div>
        {sponsorship.creatorName && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Users className="h-3 w-3" />
            <span>{sponsorship.creatorName}</span>
          </div>
        )}
        {sponsorship.sponsorshipAmount != null && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Briefcase className="h-3 w-3" />
            <span>${sponsorship.sponsorshipAmount.toLocaleString()}</span>
          </div>
        )}
      </div>
    </button>
  );
};
