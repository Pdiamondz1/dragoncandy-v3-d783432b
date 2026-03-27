
import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ArrowLeft } from 'lucide-react';
<<<<<<< HEAD

=======
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
>>>>>>> a1eeecf (docs: add Donny Chrome Extension OAuth PKCE design spec)
import CampaignsList from '@/components/campaigns/CampaignsList';
import { useCampaigns } from '@/hooks/useCampaigns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'active' | 'completed' | 'cancelled'>('all');
  const { campaigns } = useCampaigns(true);
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
        } catch (err) {
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
<<<<<<< HEAD
      <div className="min-h-screen bg-white overflow-x-hidden w-full max-w-full">
=======
      <div className="min-h-screen bg-white overflow-x-hidden">
>>>>>>> a1eeecf (docs: add Donny Chrome Extension OAuth PKCE design spec)
        {/* Template B Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => navigate('/dashboard/business')}
            className="text-dc-pink-accent mr-2"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            Campaigns
          </h1>
          <button
            onClick={() => navigate('/dashboard/business/campaigns/create')}
            className="text-dc-teal"
            aria-label="Create campaign"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {/* Status filter tabs — horizontal scroll */}
<<<<<<< HEAD
        <div className="bg-white border-b border-gray-100 overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex px-4 py-2 gap-2 w-max">
=======
        <div className="bg-white border-b border-gray-100">
          <ScrollArea className="w-full">
            <div className="flex px-4 py-2 gap-2 whitespace-nowrap">
>>>>>>> a1eeecf (docs: add Donny Chrome Extension OAuth PKCE design spec)
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                    statusFilter === tab.key
                      ? 'bg-dc-teal text-white'
                      : 'bg-gray-100 text-gray-600'
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
<<<<<<< HEAD
          </div>
        </div>

        {/* Campaign list */}
        <div className="px-4 pt-4 pb-24 space-y-3 overflow-hidden">
=======
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Campaign list */}
        <div className="px-4 pt-4 pb-24 space-y-3">
>>>>>>> a1eeecf (docs: add Donny Chrome Extension OAuth PKCE design spec)
          <CampaignsList statusFilter={statusFilter} filterByOwnership={true} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignsPage;
