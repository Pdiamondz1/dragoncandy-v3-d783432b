import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBrandSponsorshipAnalytics } from '@/hooks/outstand/useBrandSponsorshipAnalytics';
import { SponsorshipCard } from './SponsorshipCard';
import { SponsorshipROISummary } from './SponsorshipROISummary';
import { DonnyIntelligenceStub } from './DonnyIntelligenceStub';
import { Loader2 } from 'lucide-react';

export const CrossPartyAnalytics: React.FC = () => {
  const { data: sponsorships, isLoading } = useBrandSponsorshipAnalytics();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-dc-teal" />
      </div>
    );
  }

  if (!sponsorships || sponsorships.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-6 border border-gray-200 text-center">
          <p className="text-gray-500 text-sm">No active sponsorships yet.</p>
          <p className="text-gray-400 text-xs mt-1">
            <Link to="/dashboard/brand/discover-campaigns" className="text-dc-teal hover:underline">Browse campaigns</Link>
            {' '}to find your first sponsorship opportunity.
          </p>
        </div>
        <DonnyIntelligenceStub />
      </div>
    );
  }

  const selected = sponsorships.find((s) => s.id === selectedId) ?? sponsorships[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-1/3 space-y-2">
          {sponsorships.map((s) => (
            <SponsorshipCard
              key={s.id}
              sponsorship={s}
              isSelected={selected.id === s.id}
              onSelect={() => setSelectedId(s.id)}
            />
          ))}
        </div>
        <div className="lg:w-2/3">
          <SponsorshipROISummary sponsorship={selected} />
        </div>
      </div>
      <DonnyIntelligenceStub />
    </div>
  );
};
