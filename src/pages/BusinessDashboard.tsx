// src/pages/BusinessDashboard.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Rocket, Clock, Target, Loader2 } from 'lucide-react';
import { useSponsorshipProposals } from '@/hooks/useSponsorshipProposals';
import SponsorshipProposalCard from '@/components/campaigns/SponsorshipProposalCard';
import { BusinessDashboardSideFeed } from '@/components/dragon-feed/BusinessDashboardSideFeed';
import { FeedLightbox } from '@/components/dragon-feed/FeedLightbox';
import { FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DonnyAIBar } from '@/components/dashboard/DonnyAIBar';
import { DashboardStatsGrid, type StatItem } from '@/components/dashboard/DashboardStatsGrid';
import { QuickActionButtons, type QuickAction } from '@/components/dashboard/QuickActionButtons';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { useBusinessActiveCampaigns } from '@/hooks/useBusinessActiveCampaigns';
import { useBusinessDashboardMetrics } from '@/hooks/useBusinessDashboardMetrics';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BusinessDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { proposals, isLoading: proposalsLoading, updateProposalStatus } = useSponsorshipProposals();
  const [selectedFeedItem, setSelectedFeedItem] = useState<FeedMediaItem | null>(null);
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
  const [allFeedItems, setAllFeedItems] = useState<FeedMediaItem[]>([]);

  const { data: metrics, isLoading: metricsLoading } = useBusinessDashboardMetrics();
  const { data: campaigns, isLoading: campaignsLoading } = useBusinessActiveCampaigns();

  const pendingProposals = proposals.filter(p => p.status === 'pending');

  const handleFeedItemClick = (item: FeedMediaItem, index: number) => {
    setSelectedFeedItem(item);
    setCurrentFeedIndex(index);
  };

  const handleFeedNavigate = (index: number) => {
    if (allFeedItems[index]) {
      setSelectedFeedItem(allFeedItems[index]);
      setCurrentFeedIndex(index);
    }
  };

  const businessStats: StatItem[] = metrics ? [
    { label: metrics.activeCampaigns.label, value: metrics.activeCampaigns.value, icon: Rocket },
    { label: metrics.pendingContent.label, value: metrics.pendingContent.value, icon: Clock },
    { label: metrics.totalSpend.label, value: metrics.totalSpend.value, icon: DollarSign },
    { label: metrics.avgEngagement.label, value: metrics.avgEngagement.value, icon: Target },
  ] : [];

  const businessActions: [QuickAction, QuickAction] = [
    { label: 'Create Campaign', to: '/dashboard/business/campaigns/create', variant: 'primary' },
    { label: 'Browse Creators', to: '/dashboard/business/creators', variant: 'secondary' },
  ];

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex h-full overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">

          {/* Unified gradient header */}
          <DashboardHero
            roleLabel="Business Dashboard"
            userName={profile.full_name || 'there'}
          >
            <DonnyAIBar placeholder='Ask Donny... "Find creators near me"' />
            <RatingPromptManager />
            <DashboardStatsGrid stats={businessStats} isLoading={metricsLoading} />
            <QuickActionButtons actions={businessActions} />
          </DashboardHero>

          {/* White body content */}
          <div className="p-4 sm:p-6 space-y-4">
            <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4">

              {/* Active Campaigns Feed */}
              <div>
                <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal mb-2">
                  Active Campaigns
                </p>
                {campaignsLoading ? (
                  <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-dc-teal animate-spin" />
                  </div>
                ) : !campaigns || campaigns.length === 0 ? (
                  <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white text-center">
                    <p className="text-sm text-gray-500">No active campaigns yet.</p>
                    <button
                      onClick={() => navigate('/dashboard/business/campaigns/create')}
                      className="text-sm font-semibold text-dc-teal hover:underline mt-1"
                    >
                      Let Donny help you create one
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {campaigns.map((campaign) => (
                      <ActivityFeedCard
                        key={campaign.id}
                        title={campaign.title}
                        subtitle={`${campaign.creatorName ? `@${campaign.creatorName}` : 'Unassigned'} · Due ${formatDate(campaign.deadline)}`}
                        status={campaign.status}
                        onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Sponsorship Proposals — PRESERVED, same conditional logic */}
              {pendingProposals.length > 0 && (
                <Card className="border-2 border-dc-teal rounded-2xl bg-white">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-gray-900">
                      <DollarSign className="h-5 w-5 text-dc-teal" />
                      Sponsorship Proposals ({pendingProposals.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-500 mb-4">
                      You have {pendingProposals.length} pending sponsorship {pendingProposals.length === 1 ? 'proposal' : 'proposals'} from brands interested in funding your campaigns.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingProposals.slice(0, 4).map((proposal) => (
                        <SponsorshipProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          onAccept={(id) => updateProposalStatus.mutate({ proposalId: id, status: 'accepted' })}
                          onReject={(id) => updateProposalStatus.mutate({ proposalId: id, status: 'rejected' })}
                        />
                      ))}
                    </div>
                    {pendingProposals.length > 4 && (
                      <Button
                        variant="outline"
                        className="w-full mt-4 rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                        onClick={() => navigate('/dashboard/business/sponsorships')}
                      >
                        View All Proposals
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>
          </div>

        </div>

        {/* Side Feed — Desktop only (PRESERVED, no changes to this block) */}
        <div className="hidden lg:block w-80 shrink-0 border-l bg-muted/10 sticky top-14 h-[calc(100vh-56px)] overflow-hidden">
          <BusinessDashboardSideFeed
            onItemClick={handleFeedItemClick}
            onFeedItemsLoaded={setAllFeedItems}
          />
        </div>
      </div>

      {/* Lightbox Modal (PRESERVED, no changes) */}
      <FeedLightbox
        item={selectedFeedItem}
        allItems={allFeedItems}
        currentIndex={currentFeedIndex}
        onClose={() => setSelectedFeedItem(null)}
        onNavigate={handleFeedNavigate}
      />
    </DashboardLayout>
  );
};

export default BusinessDashboard;
