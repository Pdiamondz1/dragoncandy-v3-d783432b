import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, DollarSign, Calendar, Users, TrendingUp, CheckCircle, Clock, XCircle } from 'lucide-react';
import { SponsorshipCampaign } from '@/hooks/useSponsorshipCampaigns';
import { useBrandSponsorshipStatus } from '@/hooks/useBrandSponsorshipStatus';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BrandCampaignCardProps {
  campaign: SponsorshipCampaign;
  onSponsor: (campaignId: string, existingProposal?: any) => void;
  onViewDetails: (campaignId: string) => void;
  submittingCampaignId?: string;
  submittedCampaignId?: string;
}

const BrandCampaignCard: React.FC<BrandCampaignCardProps> = ({
  campaign,
  onSponsor,
  onViewDetails,
  submittingCampaignId,
  submittedCampaignId: _submittedCampaignId,
}) => {
  const { data: existingProposal, isLoading: isLoadingProposal } = useBrandSponsorshipStatus(campaign.id);

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

  const getProposalStatusBadge = () => {
    if (!existingProposal) return null;

    const statusConfig = {
      pending: { label: 'Proposal Pending', icon: Clock, variant: 'secondary' as const },
      accepted: { label: 'Proposal Accepted', icon: CheckCircle, variant: 'default' as const },
      rejected: { label: 'Proposal Rejected', icon: XCircle, variant: 'destructive' as const },
    };

    const config = statusConfig[existingProposal.status as keyof typeof statusConfig];
    if (!config) return null;

    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getSponsorButtonContent = () => {
    if (isLoadingProposal) {
      return { text: 'Loading…', disabled: true, tooltip: null };
    }

    // Show submitting state if this card is being submitted right now
    if (submittingCampaignId === campaign.id && !existingProposal) {
      return { text: 'Submitting…', disabled: true, tooltip: null };
    }

    if (existingProposal) {
      const statusMessages = {
        pending: 'You have already submitted a proposal for this campaign',
        accepted: 'Your sponsorship proposal has been accepted',
        rejected: 'Your sponsorship proposal was rejected',
      };
      return {
        text: existingProposal.status === 'accepted' ? 'Sponsored' : 'Proposal Submitted',
        disabled: true,
        tooltip: statusMessages[existingProposal.status as keyof typeof statusMessages] || 'Proposal already exists',
      };
    }

    return { text: 'Sponsor Campaign', disabled: false, tooltip: null };
  };

  const buttonConfig = getSponsorButtonContent();

  return (
    <Card className="border-2 border-dc-teal rounded-2xl hover:shadow-lg transition-shadow duration-200 overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <CardTitle className="text-xl">{campaign.title}</CardTitle>
            {getProposalStatusBadge()}
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
          {(campaign.business_profile?.city || campaign.business_profile?.country) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>
                {[campaign.business_profile.city, campaign.business_profile.country].filter(Boolean).join(', ')}
              </span>
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
          className="flex-1 rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
          onClick={() => onViewDetails(campaign.id)}
        >
          View Details
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-1">
                <Button
                  className="w-full rounded-full bg-dc-teal text-white font-bold hover:bg-dc-teal/90"
                  onClick={() => onSponsor(campaign.id, existingProposal)}
                  disabled={buttonConfig.disabled}
                >
                  {buttonConfig.text}
                </Button>
              </div>
            </TooltipTrigger>
            {buttonConfig.tooltip && (
              <TooltipContent>
                <p>{buttonConfig.tooltip}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
};

export default BrandCampaignCard;
