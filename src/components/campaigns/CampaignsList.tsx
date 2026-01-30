
import React from 'react';
import { useCampaigns } from '@/hooks/useCampaigns';
import CampaignCard from '@/components/campaigns/CampaignCard';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CampaignsListProps {
  statusFilter?: 'all' | 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  filterByOwnership?: boolean;
}

const CampaignsList: React.FC<CampaignsListProps> = ({ 
  statusFilter = 'all',
  filterByOwnership = true 
}) => {
  const { campaigns, isLoading, error } = useCampaigns(filterByOwnership);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-64 bg-gray-100 rounded-lg animate-pulse" />
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
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {statusFilter === 'all' ? 'No campaigns yet' : `No ${statusFilter} campaigns`}
          </h3>
          <p className="text-gray-600 mb-6">
            {statusFilter === 'all' 
              ? 'Create your first campaign to get started with finding amazing creators.'
              : `You don't have any ${statusFilter} campaigns at the moment.`
            }
          </p>
          <Button 
            onClick={() => navigate('/dashboard/business/campaigns/create')}
            className="inline-flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Campaign
          </Button>
        </div>
      </div>
    );
  }

  const handleViewDetails = (campaign: any) => {
    navigate(`/dashboard/business/campaigns/${campaign.id}`);
  };

  const handleEdit = (campaign: any) => {
    navigate(`/dashboard/business/campaigns/${campaign.id}/edit`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

export default CampaignsList;
