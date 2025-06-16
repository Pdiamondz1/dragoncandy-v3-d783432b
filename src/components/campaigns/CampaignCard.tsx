
import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, Eye, Users } from 'lucide-react';
import { Campaign } from '@/hooks/useCampaigns';
import { format } from 'date-fns';

interface CampaignCardProps {
  campaign: Campaign;
  onViewDetails?: (campaign: Campaign) => void;
  onEdit?: (campaign: Campaign) => void;
}

const CampaignCard: React.FC<CampaignCardProps> = ({ 
  campaign, 
  onViewDetails, 
  onEdit 
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'published': return 'bg-blue-100 text-blue-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-purple-100 text-purple-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatBudget = () => {
    if (campaign.budget_min && campaign.budget_max) {
      return `$${campaign.budget_min} - $${campaign.budget_max}`;
    }
    if (campaign.budget_min) {
      return `From $${campaign.budget_min}`;
    }
    if (campaign.budget_max) {
      return `Up to $${campaign.budget_max}`;
    }
    return 'Budget TBD';
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-semibold line-clamp-2">
            {campaign.title}
          </CardTitle>
          <Badge className={getStatusColor(campaign.status)}>
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600 line-clamp-3">
          {campaign.description || 'No description provided'}
        </p>

        <div className="space-y-2">
          {campaign.platforms && campaign.platforms.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-gray-500" />
              <div className="flex flex-wrap gap-1">
                {campaign.platforms.map((platform) => (
                  <Badge key={platform} variant="outline" className="text-xs">
                    {platform}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <DollarSign className="h-4 w-4 text-gray-500" />
            <span>{formatBudget()}</span>
          </div>

          {campaign.deadline && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span>Due {format(new Date(campaign.deadline), 'MMM dd, yyyy')}</span>
            </div>
          )}
        </div>

        {campaign.deliverables && campaign.deliverables.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-1">Deliverables:</h4>
            <div className="flex flex-wrap gap-1">
              {campaign.deliverables.slice(0, 3).map((deliverable, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {deliverable}
                </Badge>
              ))}
              {campaign.deliverables.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{campaign.deliverables.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={() => onViewDetails?.(campaign)}
        >
          <Eye className="h-4 w-4 mr-2" />
          View Details
        </Button>
        {onEdit && (
          <Button 
            variant="default" 
            size="sm" 
            className="flex-1"
            onClick={() => onEdit(campaign)}
          >
            Edit
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default CampaignCard;
