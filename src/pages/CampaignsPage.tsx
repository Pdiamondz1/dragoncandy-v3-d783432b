
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ArrowLeft } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { CampaignsList } from '@/components/campaigns/CampaignsList';
import { useCampaigns } from '@/hooks/useCampaigns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { LocationBadge } from '@/components/org/LocationBadge';
import { deriveCampaignPhase, phaseToDisplayLabel } from '@/lib/campaignPhase';
import { PageBody } from '@/components/app/PageBody';

const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'active' | 'completed' | 'cancelled'>('all');
  const { activeOrgUnit } = useAuth();
  const { campaigns } = useCampaigns(true, activeOrgUnit?.id);
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
          const { data, error } = await supabase.functions.invoke('verify-campaign-escrow', {
            body: { campaignId, sessionId },
          });

          if (error) {
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
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
          } else if (data?.status === 'pending') {
            toast({
              title: 'Payment Processing',
              description: 'Your payment is still being processed. Please wait a moment and refresh.',
            });
          }
        } catch {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Something went wrong. Please refresh the page.',
          });
        } finally {
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
      setSearchParams({});
    }
  }, [searchParams, queryClient, toast, setSearchParams, isVerifying]);

  const getCounts = () => {
    if (!campaigns) return { all: 0, draft: 0, published: 0, active: 0, completed: 0, cancelled: 0 };
    const counts = { all: campaigns.length, draft: 0, published: 0, active: 0, completed: 0, cancelled: 0 };
    campaigns.forEach(c => {
      if (c.status === 'draft') { counts.draft++; return; }
      const collabShape = c.collaboration_status ? { status: c.collaboration_status } : null;
      const label = phaseToDisplayLabel(deriveCampaignPhase(c.status, collabShape));
      if (label in counts) counts[label as keyof typeof counts]++;
    });
    return counts;
  };

  const counts = getCounts();

  const tabs: Array<{ key: typeof statusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Drafts' },
    { key: 'published', label: 'Published' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
      <PageBody className="space-y-0">
        {/* Template B Header */}
        <PageHeader>
          <div className="flex items-center">
            <button
              onClick={() => navigate('/dashboard/business')}
              className="text-dc-pink-accent mr-2"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 flex items-center justify-center gap-2">
              <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
                Campaigns
              </h1>
              <LocationBadge />
            </div>
            <span className="w-5" />
          </div>
        </PageHeader>

        {/* Create Campaign CTA */}
        <div className="px-4 pt-3 pb-1 lg:flex lg:justify-between lg:items-center">
          <h2 className="text-lg font-bold uppercase tracking-wide text-teal-500 hidden lg:block">
            Campaigns
          </h2>
          <button
            onClick={() => navigate('/dashboard/business/campaigns/create')}
            className="w-full lg:w-auto bg-teal-400 text-white font-bold py-3 px-6 rounded-full text-[15px] hover:bg-teal-500 transition-colors"
          >
            + Create Campaign
          </button>
        </div>

        {/* Status filter tabs — horizontal scroll */}
        <div className="bg-white border-b border-teal-100">
          <ScrollArea className="w-full">
            <div className="flex px-4 py-2 gap-2 whitespace-nowrap">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                    statusFilter === tab.key
                      ? 'bg-dc-teal-btn text-white'
                      : 'bg-teal-50 text-teal-700'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-xs ${
                      statusFilter === tab.key ? 'bg-white/30 text-white' : 'bg-white text-gray-600'
                    }`}
                  >
                    {counts[tab.key]}
                  </span>
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Campaign list */}
        <div className="px-4 pt-4 pb-24 md:pb-0 space-y-3">
          <CampaignsList statusFilter={statusFilter} filterByOwnership={true} />
        </div>
      </PageBody>
      </div>
    </DashboardLayout>
  );
};

export default CampaignsPage;
