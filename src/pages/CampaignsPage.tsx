
import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CampaignsList from '@/components/campaigns/CampaignsList';

const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'active' | 'completed' | 'cancelled'>('all');

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
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
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
