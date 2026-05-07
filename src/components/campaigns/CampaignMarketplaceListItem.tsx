import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Calendar, 
  DollarSign, 
  MapPin, 
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

const CampaignMarketplaceListItemComponent: React.FC<CampaignMarketplaceListItemProps> = ({
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

  const visiblePlatforms = campaign.platforms?.slice(0, 3) || [];
  const remainingPlatforms = (campaign.platforms?.length || 0) - 3;

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-[transform,box-shadow] duration-300 hover:border-primary/50 h-full flex flex-col w-full max-w-full">
      {/* Hero Section with Business Branding */}
      <div className="relative h-32 bg-gradient-to-br from-primary/10 via-primary/5 to-background overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/90" />
        
        {/* Business Info in Hero */}
        <div className="relative p-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-foreground/80 mb-1">
              <Building className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-medium truncate">
                {campaign.business_profile?.business_name || 'Business'}
              </span>
            </div>
            {(campaign.business_profile?.city || campaign.business_profile?.country) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                <span className="truncate">
                  {[campaign.business_profile.city, campaign.business_profile.country].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Application Status Badge */}
          {campaign.user_applied && campaign.application_status && (
            <div className="ml-2">
              {campaign.application_status === 'pending' && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 shadow-sm">
                  <Clock className="h-3 w-3 mr-1" aria-hidden="true" />
                  Applied
                </Badge>
              )}
              {campaign.application_status === 'accepted' && (
                <Badge className="bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0 shadow-sm">
                  <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                  Accepted
                </Badge>
              )}
              {campaign.application_status === 'rejected' && (
                <Badge variant="secondary" className="bg-red-100 text-red-700 shadow-sm">
                  <XCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                  Rejected
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Business Avatar - Centered at Bottom */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
          <Avatar className="h-16 w-16 border-4 border-background shadow-lg">
            <AvatarImage src={campaign.business_profile?.logo_url} alt={campaign.business_profile?.business_name || 'Business logo'} />
            <AvatarFallback className="bg-gradient-to-br from-pink-100 to-purple-100">
              <Building className="h-8 w-8 text-primary" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex-1 flex flex-col p-6 pt-10">
        {/* Campaign Title */}
        <h3 className="text-lg font-semibold text-foreground text-center mb-2 truncate">
          {campaign.title}
        </h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground text-center mb-4 line-clamp-2 min-h-[2.5rem]">
          {campaign.description || 'No description provided'}
        </p>

        {/* Platforms */}
        {campaign.platforms && campaign.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center mb-4">
            {visiblePlatforms.map((platform) => (
              <Badge key={platform} variant="outline" className="text-xs">
                {platform}
              </Badge>
            ))}
            {remainingPlatforms > 0 && (
              <Badge variant="outline" className="text-xs">
                +{remainingPlatforms} more
              </Badge>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 mt-auto">
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
            <span className="font-medium text-foreground truncate text-xs">
              {getBudgetRange()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
            <span className="text-muted-foreground truncate text-xs">
              {formatDate(campaign.deadline)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm col-span-2">
            <Users className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
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
            className="w-full rounded-full"
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
            className="w-full rounded-full"
          >
            {campaign.application_status === 'accepted' && 'View Project'}
            {campaign.application_status === 'pending' && 'Applied'}
            {campaign.application_status === 'rejected' && 'Apply Again'}
            {!campaign.application_status && 'Apply'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export const CampaignMarketplaceListItem = React.memo(CampaignMarketplaceListItemComponent);