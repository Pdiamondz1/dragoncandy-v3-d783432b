
import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CampaignsList from '@/components/campaigns/CampaignsList';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'active' | 'completed' | 'cancelled'>('all');
  const { campaigns } = useCampaigns(true); // Only show user's own campaigns
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isVerifying, setIsVerifying] = useState(false);

  // Handle payment verification from Stripe redirect
  useEffect(() => {
    const payment = searchParams.get('payment');
    const campaignId = searchParams.get('campaign_id');
    const sessionId = searchParams.get('session_id');

    if (payment === 'success' && campaignId && !isVerifying) {
      setIsVerifying(true);
      
      const verifyPayment = async () => {
        try {
          console.log('Verifying payment for campaign:', campaignId, 'session:', sessionId);
          
          const { data, error } = await supabase.functions.invoke('verify-campaign-escrow', {
            body: { campaignId, sessionId },
          });

          if (error) {
            console.error('Verification error:', error);
            toast({
              variant: 'destructive',
              title: 'Verification Failed',
              description: 'Could not verify payment. Please try again or contact support.',
            });
          } else if (data?.success) {
            toast({
              title: 'Payment Verified!',
              description: 'Your campaign is now published and visible to creators.',
            });
            // Refresh campaigns data
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
          } else if (data?.status === 'pending') {
            toast({
              title: 'Payment Processing',
              description: 'Your payment is still being processed. Please wait a moment and refresh.',
            });
          }
        } catch (err) {
          console.error('Payment verification failed:', err);
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Something went wrong. Please refresh the page.',
          });
        } finally {
          // Clean up URL params
          setSearchParams({});
          setIsVerifying(false);
        }
      };

      verifyPayment();
    } else if (payment === 'cancelled' && campaignId) {
      toast({
        title: 'Payment Cancelled',
        description: 'You can complete the payment anytime from your campaign card.',
      });
      // Clean up URL params
      setSearchParams({});
    }
  }, [searchParams, queryClient, toast, setSearchParams, isVerifying]);

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
      <div className="flex-1 p-4 sm:p-6 overflow-x-hidden w-full max-w-full">
        <div className="max-w-7xl mx-auto w-full">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Campaigns</h1>
              <p className="text-muted-foreground mt-1 w-full">
                Manage your content campaigns and track their progress
              </p>
            </div>
            <Button
              onClick={() => navigate('/dashboard/business/campaigns/create')}
              className="flex items-center justify-center w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              {isMobile ? "Create" : "Create Campaign"}
            </Button>
          </div>

          {/* Filter Tabs */}
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)} className="mb-6">
            {isMobile ? (
              // Mobile: Horizontal scrolling tabs
              <div className="overflow-x-auto pb-1 scrollbar-hide">
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
