
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

interface CampaignMarketplaceCardProps {
  campaign: PublicCampaign;
  onApply: (campaignId: string) => void;
  onViewDetails: (campaignId: string) => void;
}

const CampaignMarketplaceCard: React.FC<CampaignMarketplaceCardProps> = ({
  campaign,
  onApply,
  onViewDetails,
}) => {
  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString();
  };

  const getBudgetRange = () => {
    if (campaign.budget_min && campaign.budget_max) {
      return `${formatCurrency(campaign.budget_min)} - ${formatCurrency(campaign.budget_max)}`;
    } else if (campaign.budget_max) {
      return `Up to ${formatCurrency(campaign.budget_max)}`;
    } else if (campaign.budget_min) {
      return `From ${formatCurrency(campaign.budget_min)}`;
    }
    return 'Budget not specified';
  };

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <Avatar>
              <AvatarImage src={campaign.business_profile?.logo_url} />
              <AvatarFallback>
                <Building className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-lg line-clamp-1">{campaign.title}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>{campaign.business_profile?.business_name || 'Business'}</span>
                {campaign.business_profile?.location && (
                  <>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{campaign.business_profile.location}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
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
      </CardHeader>

      <CardContent className="space-y-4">
        {campaign.description && (
          <p className="text-sm text-gray-600 line-clamp-2">
            {campaign.description}
          </p>
        )}

        {campaign.platforms && campaign.platforms.length > 0 && (
          <div>
            <div className="flex flex-wrap gap-1">
              {campaign.platforms.slice(0, 3).map((platform, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {platform}
                </Badge>
              ))}
              {campaign.platforms.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{campaign.platforms.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-xs text-gray-500">Budget</p>
              <p className="font-medium">{getBudgetRange()}</p>
            </div>
          </div>

          {campaign.deadline && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">Deadline</p>
                <p className="font-medium">{formatDate(campaign.deadline)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{campaign.application_count || 0} applications</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>Posted {formatDate(campaign.created_at)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onViewDetails(campaign.id)}
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
            >
              {campaign.application_status === 'accepted' && 'View Project'}
              {campaign.application_status === 'pending' && 'Applied'}
              {campaign.application_status === 'rejected' && 'Apply Again'}
              {!campaign.application_status && 'Apply'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CampaignMarketplaceCard;
