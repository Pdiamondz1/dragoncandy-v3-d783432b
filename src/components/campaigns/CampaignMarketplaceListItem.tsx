import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    if (campaign.budget_max) {
      if (campaign.budget_min) {
        return `${formatCurrency(campaign.budget_min)} - ${formatCurrency(campaign.budget_max)}`;
      }
      return `Up to ${formatCurrency(campaign.budget_max)}`;
    }
    return 'Budget not specified';
  };

  return (
    <Card className="hover:shadow-md transition-all hover:border-primary/50">
      <CardContent className="p-6">
        <div className="flex items-center gap-6">
          {/* Left: Avatar + Main Info */}
          <Avatar className="h-16 w-16 flex-shrink-0">
            <AvatarImage src={campaign.business_profile?.logo_url} />
            <AvatarFallback className="bg-gradient-to-br from-pink-100 to-purple-100">
              <Building className="h-8 w-8 text-primary" />
            </AvatarFallback>
          </Avatar>

          {/* Middle: Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-foreground">{campaign.title}</h3>
                {campaign.user_applied && campaign.application_status && (
                  <>
                    {campaign.application_status === 'pending' && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                        <Clock className="h-3 w-3 mr-1" />
                        Applied
                      </Badge>
                    )}
                    {campaign.application_status === 'accepted' && (
                      <Badge className="bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Accepted
                      </Badge>
                    )}
                    {campaign.application_status === 'rejected' && (
                      <Badge variant="secondary" className="bg-red-100 text-red-700">
                        <XCircle className="h-3 w-3 mr-1" />
                        Rejected
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
              <div className="flex items-center gap-1">
                <Building className="h-4 w-4" />
                <span className="font-medium">{campaign.business_profile?.business_name || 'Business'}</span>
              </div>
              {(campaign.business_profile?.city || campaign.business_profile?.country) && (
                <>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {[campaign.business_profile.city, campaign.business_profile.country].filter(Boolean).join(', ')}
                    </span>
                  </div>
                </>
              )}
            </div>

            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {campaign.description || 'No description provided'}
            </p>

            {campaign.platforms && campaign.platforms.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {campaign.platforms.map((platform) => (
                  <Badge key={platform} variant="outline" className="text-xs">
                    {platform}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Right: Stats + Actions */}
          <div className="flex items-center gap-6 flex-shrink-0">
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="font-medium">{getBudgetRange()}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 text-primary" />
                <span>{formatDate(campaign.deadline)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 text-primary" />
                <span>{campaign.application_count || 0} applications</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onViewDetails(campaign.id)}
                className="whitespace-nowrap"
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
                className="whitespace-nowrap"
              >
                {campaign.application_status === 'accepted' && 'View Project'}
                {campaign.application_status === 'pending' && 'Applied'}
                {campaign.application_status === 'rejected' && 'Apply Again'}
                {!campaign.application_status && 'Apply'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CampaignMarketplaceListItem;
