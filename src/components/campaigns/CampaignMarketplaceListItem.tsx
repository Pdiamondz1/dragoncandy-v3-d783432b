import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Calendar,
  DollarSign,
  Users,
  Clock,
  CheckCircle,
  Building,
  XCircle
} from 'lucide-react';
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
  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getBudgetRange = () => {
    // Check for fixed-price campaigns first (DragonDash)
    if (campaign.pricing_type === 'fixed' && campaign.fixed_price) {
      return `${formatCurrency(campaign.fixed_price)} Fixed`;
    }
    
    // Bid-range campaigns
    if (campaign.budget_max) {
      if (campaign.budget_min) {
        return `${formatCurrency(campaign.budget_min)} - ${formatCurrency(campaign.budget_max)}`;
      }
      return `Up to ${formatCurrency(campaign.budget_max)}`;
    }
    if (campaign.budget_min) {
      return `From ${formatCurrency(campaign.budget_min)}`;
    }
    return 'Budget not specified';
  };

  return (
    <Card className="group overflow-hidden border-l-4 border-dc-yellow rounded-2xl h-full flex flex-col">
      {/* Hero Section */}
      <div className="relative h-48 bg-dc-gray overflow-hidden">
        {campaign.business_profile?.logo_url && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${campaign.business_profile.logo_url})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/75" />

        {/* Business Avatar */}
        <div className="absolute bottom-14 left-4">
          <Avatar className="h-10 w-10 border-2 border-white">
            <AvatarImage src={campaign.business_profile?.logo_url} />
            <AvatarFallback className="bg-gray-200">
              <Building className="h-5 w-5 text-gray-500" />
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Title + Description overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          <h3 className="text-base font-bold text-white">{campaign.title}</h3>
          <p className="text-xs text-white/80 line-clamp-2 mt-0.5">{campaign.description}</p>
        </div>

        {/* Application Status Badge */}
        {campaign.user_applied && campaign.application_status && (
          <div className="absolute top-3 right-3">
            {campaign.application_status === 'pending' && (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 shadow-sm">
                <Clock className="h-3 w-3 mr-1" />
                Applied
              </Badge>
            )}
            {campaign.application_status === 'accepted' && (
              <Badge className="bg-dc-teal text-white border-0 shadow-sm">
                <CheckCircle className="h-3 w-3 mr-1" />
                Accepted
              </Badge>
            )}
            {campaign.application_status === 'rejected' && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 shadow-sm">
                <XCircle className="h-3 w-3 mr-1" />
                Rejected
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="flex-1 flex flex-col p-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 mt-auto">
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 text-dc-teal flex-shrink-0" />
            <span className="font-medium text-foreground truncate text-xs">
              {getBudgetRange()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-dc-teal flex-shrink-0" />
            <span className="text-muted-foreground truncate text-xs">
              {formatDate(campaign.deadline)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm col-span-2">
            <Users className="h-4 w-4 text-dc-teal flex-shrink-0" />
            <span className="text-muted-foreground text-xs">
              {campaign.application_count || 0} applications
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(campaign.id)}
            className="w-full rounded-full border border-dc-teal text-dc-teal"
          >
            View Details
          </Button>
          <Button
            size="sm"
            onClick={() => campaign.application_status === 'accepted'
              ? onViewDetails(campaign.id)
              : onApply(campaign.id)
            }
            disabled={campaign.application_status === 'pending'}
            className="w-full rounded-full bg-dc-pink text-[#111111] font-bold hover:bg-pink-300 border-0"
          >
            {campaign.application_status === 'accepted' && 'View Project'}
            {campaign.application_status === 'pending' && 'Applied'}
            {campaign.application_status === 'rejected' && 'Apply Again'}
            {!campaign.application_status && 'Apply Now'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default CampaignMarketplaceListItem;
