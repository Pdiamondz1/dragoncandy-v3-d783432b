import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, DollarSign, Calendar, Users, TrendingUp } from 'lucide-react';
import { SponsorshipCampaign } from '@/hooks/useSponsorshipCampaigns';

interface BrandCampaignCardProps {
  campaign: SponsorshipCampaign;
  onSponsor: (campaignId: string) => void;
  onViewDetails: (campaignId: string) => void;
}

const BrandCampaignCard: React.FC<BrandCampaignCardProps> = ({
  campaign,
  onSponsor,
  onViewDetails,
}) => {
  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No deadline';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getBudgetRange = () => {
    if (campaign.budget_min && campaign.budget_max) {
      return `${formatCurrency(campaign.budget_min)} - ${formatCurrency(campaign.budget_max)}`;
    } else if (campaign.budget_min) {
      return `From ${formatCurrency(campaign.budget_min)}`;
    } else if (campaign.budget_max) {
      return `Up to ${formatCurrency(campaign.budget_max)}`;
    }
    return 'Budget not specified';
  };

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2">{campaign.title}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Avatar className="h-6 w-6">
                <AvatarImage src={campaign.business_profile?.logo_url} />
                <AvatarFallback>
                  {campaign.business_profile?.business_name?.[0] || 'R'}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">
                {campaign.business_profile?.business_name || 'Restaurant'}
              </span>
            </div>
          </div>
          {campaign.sponsorship_count > 0 && (
            <Badge variant="secondary" className="gap-1">
              <TrendingUp className="h-3 w-3" />
              {campaign.sponsorship_count} Sponsor{campaign.sponsorship_count !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <CardDescription className="line-clamp-3">
          {campaign.description || 'No description provided'}
        </CardDescription>

        {/* Platforms */}
        {campaign.platforms && campaign.platforms.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {campaign.platforms.map((platform) => (
              <Badge key={platform} variant="outline">
                {platform}
              </Badge>
            ))}
          </div>
        )}

        {/* Campaign Details */}
        <div className="space-y-2 text-sm">
          {campaign.business_profile?.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{campaign.business_profile.location}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span>{getBudgetRange()}</span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Deadline: {formatDate(campaign.deadline)}</span>
          </div>

          {campaign.application_count > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{campaign.application_count} Creator{campaign.application_count !== 1 ? 's' : ''} Applied</span>
            </div>
          )}
        </div>

        {/* Industry Badge */}
        {campaign.business_profile?.industry && (
          <div>
            <Badge variant="secondary">{campaign.business_profile.industry}</Badge>
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onViewDetails(campaign.id)}
        >
          View Details
        </Button>
        <Button
          className="flex-1"
          onClick={() => onSponsor(campaign.id)}
        >
          Sponsor Campaign
        </Button>
      </CardFooter>
    </Card>
  );
};

export default BrandCampaignCard;
