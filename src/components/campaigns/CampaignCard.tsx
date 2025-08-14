
import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, Eye, Users, FileText, MessageSquare, Edit, Bell } from 'lucide-react';
import { Campaign } from '@/hooks/useCampaigns';
import { format } from 'date-fns';
import { useCampaignApplicationsCount } from '@/hooks/useCampaignApplicationsCount';

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
  const { data: applicationCounts, isLoading: countsLoading } = useCampaignApplicationsCount(campaign.id);
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'published': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'completed': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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

  const getContentItemsCount = () => {
    return campaign.deliverables ? campaign.deliverables.length : 0;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <MessageSquare className="h-3 w-3" />;
      case 'completed':
        return <FileText className="h-3 w-3" />;
      default:
        return null;
    }
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-transparent hover:border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold line-clamp-2 mb-2">
              {campaign.title}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge className={`${getStatusColor(campaign.status)} text-xs font-medium flex items-center gap-1`}>
                {getStatusIcon(campaign.status)}
                {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </Badge>
              <span className="text-xs text-gray-500">
                {format(new Date(campaign.created_at), 'MMM dd, yyyy')}
              </span>
            </div>
          </div>
          
          {/* Application Notification Badge */}
          {!countsLoading && applicationCounts && applicationCounts.pending > 0 && (
            <div className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-medium">
              <Bell className="h-3 w-3" />
              {applicationCounts.pending} new
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <p className="text-sm text-gray-600 line-clamp-2 min-h-[2.5rem]">
          {campaign.description || 'No description provided'}
        </p>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 text-green-600" />
            <span className="text-gray-600 truncate">{formatBudget()}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="text-gray-600">
              {getContentItemsCount()} item{getContentItemsCount() !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Applications Count */}
          {!countsLoading && applicationCounts && applicationCounts.total > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="text-gray-600">
                {applicationCounts.total} application{applicationCounts.total !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {campaign.deadline && (
            <div className="flex items-center gap-2 text-sm col-span-2">
              <Calendar className="h-4 w-4 text-orange-600" />
              <span className="text-gray-600">
                Due {format(new Date(campaign.deadline), 'MMM dd, yyyy')}
              </span>
            </div>
          )}
        </div>

        {/* Platforms */}
        {campaign.platforms && campaign.platforms.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <div className="flex flex-wrap gap-1">
              {campaign.platforms.slice(0, 3).map((platform) => (
                <Badge key={platform} variant="outline" className="text-xs">
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

        {/* Deliverables Preview */}
        {campaign.deliverables && campaign.deliverables.length > 0 && (
          <div>
            <div className="flex flex-wrap gap-1">
              {campaign.deliverables.slice(0, 2).map((deliverable, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {deliverable}
                </Badge>
              ))}
              {campaign.deliverables.length > 2 && (
                <Badge variant="secondary" className="text-xs">
                  +{campaign.deliverables.length - 2} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-4 border-t border-gray-100">
        {/* Quick Review Button for Pending Applications */}
        {!countsLoading && applicationCounts && applicationCounts.pending > 0 ? (
          <Button 
            variant="default" 
            size="sm" 
            className="flex-1 text-xs bg-red-600 hover:bg-red-700"
            onClick={() => onViewDetails?.(campaign)}
          >
            <Bell className="h-3 w-3 mr-1" />
            Review {applicationCounts.pending} Application{applicationCounts.pending !== 1 ? 's' : ''}
          </Button>
        ) : (
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-xs"
            onClick={() => onViewDetails?.(campaign)}
          >
            <Eye className="h-3 w-3 mr-1" />
            View Details
          </Button>
        )}
        
        {onEdit && (
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-xs"
            onClick={() => onEdit(campaign)}
          >
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default CampaignCard;
