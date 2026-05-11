
import React from 'react';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { useAuth } from '@/hooks/useAuth';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CampaignsListProps {
  statusFilter?: 'all' | 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  filterByOwnership?: boolean;
}

export const CampaignsList: React.FC<CampaignsListProps> = ({ 
  statusFilter = 'all',
  filterByOwnership = true 
}) => {
  const { activeOrgUnit } = useAuth();
  const { campaigns, isLoading, error } = useCampaigns(filterByOwnership, activeOrgUnit?.id);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-64 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Failed to load campaigns</p>
        <Button onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  const filteredCampaigns = statusFilter === 'all' 
    ? campaigns 
    : campaigns.filter(campaign => campaign.status === statusFilter);

  if (filteredCampaigns.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="max-w-md mx-auto">
          <h3 className="text-xl font-semibold text-foreground mb-2">
            {statusFilter === 'all' ? 'No campaigns yet' : `No ${statusFilter} campaigns`}
          </h3>
          <p className="text-muted-foreground mb-6">
            {statusFilter === 'all'
              ? 'Create your first campaign to get started with finding amazing creators.'
              : `You don't have any ${statusFilter} campaigns at the moment.`
            }
          </p>
          <Button 
            onClick={() => navigate('/dashboard/business/campaigns/create')}
            className="inline-flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
            Create Campaign
          </Button>
        </div>
      </div>
    );
  }

  const handleViewDetails = (campaign: Campaign) => {
    navigate(`/dashboard/business/campaigns/${campaign.id}`);
  };

  const handleEdit = (campaign: Campaign) => {
    navigate(`/dashboard/business/campaigns/${campaign.id}/edit`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
      {filteredCampaigns.map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          onViewDetails={handleViewDetails}
          onEdit={handleEdit}
        />
      ))}
    </div>
  );
};

