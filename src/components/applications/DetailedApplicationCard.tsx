
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, DollarSign } from 'lucide-react';
import ApplicationStatusBadge from '@/components/campaigns/ApplicationStatusBadge';
import { CampaignApplication } from '@/types/applications';

interface DetailedApplicationCardProps {
  application: CampaignApplication;
}

const DetailedApplicationCard: React.FC<DetailedApplicationCardProps> = ({ application }) => {
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
          <div>
            <CardTitle className="text-lg">
              {application.campaign?.title || 'Campaign Title'}
            </CardTitle>
            <p className="text-sm text-gray-600">
              Applied on {formatDate(application.created_at)}
            </p>
          </div>
          <ApplicationStatusBadge status={application.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-medium mb-1">Your Message</h4>
          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
            {application.intro_message || 'No message provided'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {application.proposed_timeline && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">Timeline</p>
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
      </CardContent>
    </Card>
  );
};

export default DetailedApplicationCard;
