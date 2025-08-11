
import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CampaignsList from '@/components/campaigns/CampaignsList';
import { useCampaigns } from '@/hooks/useCampaigns';

const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'active' | 'completed' | 'cancelled'>('all');
  const { campaigns } = useCampaigns();

  // Calculate counts for each status
  const getCounts = () => {
    if (!campaigns) return { all: 0, draft: 0, published: 0, active: 0, completed: 0, cancelled: 0 };
    
    return {
      all: campaigns.length,
      draft: campaigns.filter(c => c.status === 'draft').length,
      published: campaigns.filter(c => c.status === 'published').length,
      active: campaigns.filter(c => c.status === 'active').length,
      completed: campaigns.filter(c => c.status === 'completed').length,
      cancelled: campaigns.filter(c => c.status === 'cancelled').length,
    };
  };

  const counts = getCounts();

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
              <p className="text-gray-600 mt-1">
                Manage your content campaigns and track their progress
              </p>
            </div>
            <Button 
              onClick={() => navigate('/dashboard/business/campaigns/create')}
              className="inline-flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Campaign
            </Button>
          </div>

          {/* Filter Tabs */}
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)} className="mb-6">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="all" className="flex items-center gap-2">
                All
                <span className="px-2 py-1 text-xs bg-muted rounded-full min-w-[20px] text-center">
                  {counts.all}
                </span>
              </TabsTrigger>
              <TabsTrigger value="draft" className="flex items-center gap-2">
                Drafts
                <span className="px-2 py-1 text-xs bg-muted rounded-full min-w-[20px] text-center">
                  {counts.draft}
                </span>
              </TabsTrigger>
              <TabsTrigger value="published" className="flex items-center gap-2">
                Published
                <span className="px-2 py-1 text-xs bg-muted rounded-full min-w-[20px] text-center">
                  {counts.published}
                </span>
              </TabsTrigger>
              <TabsTrigger value="active" className="flex items-center gap-2">
                Active
                <span className="px-2 py-1 text-xs bg-muted rounded-full min-w-[20px] text-center">
                  {counts.active}
                </span>
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center gap-2">
                Completed
                <span className="px-2 py-1 text-xs bg-muted rounded-full min-w-[20px] text-center">
                  {counts.completed}
                </span>
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="flex items-center gap-2">
                Cancelled
                <span className="px-2 py-1 text-xs bg-muted rounded-full min-w-[20px] text-center">
                  {counts.cancelled}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={statusFilter} className="mt-6">
              <CampaignsList statusFilter={statusFilter} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignsPage;
