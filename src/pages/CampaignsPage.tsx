
import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CampaignsList from '@/components/campaigns/CampaignsList';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useIsMobile } from '@/hooks/use-mobile';

const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'active' | 'completed' | 'cancelled'>('all');
  const { campaigns } = useCampaigns(true); // Only show user's own campaigns
  const isMobile = useIsMobile();

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
      <div className="flex-1 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Campaigns</h1>
              <p className="text-muted-foreground mt-1">
                Manage your content campaigns and track their progress
              </p>
            </div>
            <Button 
              onClick={() => navigate('/dashboard/business/campaigns/create')}
              className="inline-flex items-center w-full sm:w-auto"
              size={isMobile ? "default" : "default"}
            >
              <Plus className="h-4 w-4 mr-2" />
              {isMobile ? "Create" : "Create Campaign"}
            </Button>
          </div>

          {/* Filter Tabs */}
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)} className="mb-6">
            {isMobile ? (
              // Mobile: Horizontal scrolling tabs
              <div className="relative">
                <ScrollArea className="w-full whitespace-nowrap">
                  <TabsList className="inline-flex h-9 items-center justify-start rounded-lg bg-muted p-1 text-muted-foreground w-max">
                    <TabsTrigger value="all" className="flex items-center gap-1 px-3 py-1 text-sm">
                      All
                      <span className="px-1.5 py-0.5 text-xs bg-background rounded-full min-w-[18px] text-center">
                        {counts.all}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="draft" className="flex items-center gap-1 px-3 py-1 text-sm">
                      Drafts
                      <span className="px-1.5 py-0.5 text-xs bg-background rounded-full min-w-[18px] text-center">
                        {counts.draft}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="published" className="flex items-center gap-1 px-3 py-1 text-sm">
                      Published
                      <span className="px-1.5 py-0.5 text-xs bg-background rounded-full min-w-[18px] text-center">
                        {counts.published}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="active" className="flex items-center gap-1 px-3 py-1 text-sm">
                      Active
                      <span className="px-1.5 py-0.5 text-xs bg-background rounded-full min-w-[18px] text-center">
                        {counts.active}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="flex items-center gap-1 px-3 py-1 text-sm">
                      Completed
                      <span className="px-1.5 py-0.5 text-xs bg-background rounded-full min-w-[18px] text-center">
                        {counts.completed}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="cancelled" className="flex items-center gap-1 px-3 py-1 text-sm">
                      Cancelled
                      <span className="px-1.5 py-0.5 text-xs bg-background rounded-full min-w-[18px] text-center">
                        {counts.cancelled}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </ScrollArea>
              </div>
            ) : (
              // Desktop: Grid layout
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
            )}

            <TabsContent value={statusFilter} className="mt-6">
              <CampaignsList statusFilter={statusFilter} filterByOwnership={true} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignsPage;
