
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, X, Clock, DollarSign, User } from 'lucide-react';
import { CampaignApplication, useManageApplication } from '@/hooks/useCampaignApplications';
import ApplicationStatusBadge from './ApplicationStatusBadge';

interface ApplicationCardProps {
  application: CampaignApplication;
  showActions?: boolean;
}

const ApplicationCard: React.FC<ApplicationCardProps> = ({ 
  application, 
  showActions = false 
}) => {
  const manageApplication = useManageApplication();

  const handleAccept = async () => {
    await manageApplication.mutateAsync({
      applicationId: application.id,
      status: 'accepted',
    });
  };

  const handleReject = async () => {
    await manageApplication.mutateAsync({
      applicationId: application.id,
      status: 'rejected',
    });
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={application.creator_profile?.avatar_url} />
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">
                {application.creator_profile?.creator_name || 'Anonymous Creator'}
              </CardTitle>
              <p className="text-sm text-gray-600">
                Applied on {formatDate(application.created_at)}
              </p>
            </div>
          </div>
          <ApplicationStatusBadge status={application.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {application.creator_profile?.bio && (
          <div>
            <h4 className="font-medium mb-1">About</h4>
            <p className="text-sm text-gray-600">{application.creator_profile.bio}</p>
          </div>
        )}

        {application.creator_profile?.skills && application.creator_profile.skills.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Skills</h4>
            <div className="flex flex-wrap gap-1">
              {application.creator_profile.skills.map((skill, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="font-medium mb-1">Introduction Message</h4>
          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
            {application.intro_message || 'No message provided'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {application.proposed_timeline && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">Proposed Timeline</p>
                <p className="text-sm font-medium">{application.proposed_timeline}</p>
              </div>
            </div>
          )}

          {application.proposed_rate && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xs text-gray-500">Proposed Rate</p>
                <p className="text-sm font-medium">{formatCurrency(application.proposed_rate)}</p>
              </div>
            </div>
          )}
        </div>

        {showActions && application.status === 'pending' && (
          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={handleAccept}
              disabled={manageApplication.isPending}
              className="flex-1"
            >
              <Check className="h-4 w-4 mr-2" />
              Accept
            </Button>
            <Button
              onClick={handleReject}
              variant="outline"
              disabled={manageApplication.isPending}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ApplicationCard;
