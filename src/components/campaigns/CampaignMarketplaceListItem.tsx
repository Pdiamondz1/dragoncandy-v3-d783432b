import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Building } from 'lucide-react';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';

interface CampaignMarketplaceListItemProps {
  campaign: PublicCampaign;
  onApply: (campaignId: string) => void;
  onViewDetails: (campaignId: string) => void;
}

const CampaignMarketplaceListItem: React.FC<CampaignMarketplaceListItemProps> = ({
  campaign,
  onApply,
  onViewDetails,
}) => {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md bg-gray-900 flex flex-col">
      {/* Full-bleed campaign image with dark overlay */}
      <div className="relative h-52 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
        }}
      >
        {/* Yellow accent strip on left */}
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-yellow-400 z-10" />

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/40 z-10" />

        {/* Application Status Badge */}
        {campaign.user_applied && campaign.application_status && (
          <div className="absolute top-3 right-3 z-20">
            {campaign.application_status === 'pending' && (
              <Badge className="bg-yellow-400 text-gray-900 text-xs">Applied</Badge>
            )}
            {campaign.application_status === 'accepted' && (
              <Badge className="bg-teal-400 text-white text-xs">Accepted</Badge>
            )}
            {campaign.application_status === 'rejected' && (
              <Badge className="bg-red-400 text-white text-xs">Rejected</Badge>
            )}
          </div>
        )}

        {/* Campaign info overlaid on image */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
          <h3 className="text-lg font-bold text-white mb-1 line-clamp-2">
            {campaign.title}
          </h3>
          <p className="text-sm text-white/80 line-clamp-2">
            {campaign.description || 'No description provided'}
          </p>
        </div>

        {/* Business location top-left */}
        {(campaign.business_profile?.city || campaign.business_profile?.country) && (
          <div className="absolute top-3 left-4 z-20 flex items-center gap-1 text-white/90">
            <MapPin className="h-3 w-3 text-pink-400" />
            <span className="text-xs">
              {[campaign.business_profile.city, campaign.business_profile.country].filter(Boolean).join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Bottom section: company info + apply button */}
      <div className="bg-gray-800 px-4 pt-3 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8 ring-2 ring-teal-400">
            <AvatarImage src={campaign.business_profile?.logo_url} />
            <AvatarFallback className="bg-gray-600 text-white text-xs">
              <Building className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-white font-medium truncate max-w-[140px]">
            {campaign.business_profile?.business_name || 'Company Name'}
          </span>
        </div>

        <Button
          size="sm"
          onClick={() => campaign.application_status === 'accepted'
            ? onViewDetails(campaign.id)
            : onApply(campaign.id)
          }
          disabled={campaign.application_status === 'pending'}
          className="rounded-full bg-pink-300 hover:bg-pink-400 text-white font-semibold px-5 text-sm"
        >
          {campaign.application_status === 'accepted' && 'View Project'}
          {campaign.application_status === 'pending' && 'Applied'}
          {campaign.application_status === 'rejected' && 'Apply Again'}
          {!campaign.application_status && 'Apply Now'}
        </Button>
      </div>
    </div>
  );
};

export default CampaignMarketplaceListItem;
