
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, DollarSign, Target, Palette, Volume2, Package } from 'lucide-react';
import { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignDetailsOverviewProps {
  campaign: Campaign;
}

const CampaignDetailsOverview: React.FC<CampaignDetailsOverviewProps> = ({ campaign }) => {
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Campaign Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-lg mb-2">{campaign.title}</h3>
            {campaign.description && (
              <p className="text-gray-600 text-sm mb-4">{campaign.description}</p>
            )}
            <Badge variant={campaign.status === 'published' ? 'default' : 'secondary'}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </Badge>
          </div>

          {campaign.goals && (
            <div>
              <h4 className="font-medium mb-2">Goals</h4>
              <p className="text-sm text-gray-600">{campaign.goals}</p>
            </div>
          )}

          {campaign.platforms && campaign.platforms.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Platforms</h4>
              <div className="flex flex-wrap gap-2">
                {campaign.platforms.map((platform, index) => (
                  <Badge key={index} variant="outline">{platform}</Badge>
                ))}
              </div>
            </div>
          )}

          {campaign.deliverables && campaign.deliverables.length > 0 && (
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Deliverables
              </h4>
              <div className="flex flex-wrap gap-2">
                {campaign.deliverables.map((deliverable, index) => (
                  <Badge key={index} variant="outline">{deliverable}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium">Budget Range</p>
              <p className="text-sm text-gray-600">
                {formatCurrency(campaign.budget_min)} - {formatCurrency(campaign.budget_max)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-medium">Deadline</p>
              <p className="text-sm text-gray-600">{formatDate(campaign.deadline)}</p>
            </div>
          </div>

          {campaign.style && (
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium">Style</p>
                <p className="text-sm text-gray-600 capitalize">{campaign.style}</p>
              </div>
            </div>
          )}

          {campaign.tone && (
            <div className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-medium">Tone</p>
                <p className="text-sm text-gray-600 capitalize">{campaign.tone}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignDetailsOverview;
