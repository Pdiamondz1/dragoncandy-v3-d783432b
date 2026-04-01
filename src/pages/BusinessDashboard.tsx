// src/pages/BusinessDashboard.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Bell, Rocket, Users, DollarSign } from 'lucide-react';
import { useSponsorshipProposals } from '@/hooks/useSponsorshipProposals';
import SponsorshipProposalCard from '@/components/campaigns/SponsorshipProposalCard';
import { BusinessDashboardSideFeed } from '@/components/dragon-feed/BusinessDashboardSideFeed';
import { FeedLightbox } from '@/components/dragon-feed/FeedLightbox';
import { FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';
import { DonnyAskBar } from '@/components/donny/DonnyAskBar';
import { BusinessStatsRow } from '@/components/dashboard/BusinessStatsRow';
import { ActiveCampaignsFeed } from '@/components/dashboard/ActiveCampaignsFeed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import dragonEmblem from '@/assets/dragon-emblem.png';

const BusinessDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { proposals, isLoading: proposalsLoading, updateProposalStatus } = useSponsorshipProposals();
  const [selectedFeedItem, setSelectedFeedItem] = useState<FeedMediaItem | null>(null);
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
  const [allFeedItems, setAllFeedItems] = useState<FeedMediaItem[]>([]);

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

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex h-full overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-2xl lg:max-w-4xl mx-auto">

            {/* 1. Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
              <img
                src={dragonEmblem}
                alt="DragonCandy"
                className="w-10 h-10 rounded-full object-contain flex-shrink-0"
              />
              <div className="text-center flex-1 px-3 min-w-0">
                <h1 className="text-sm font-bold text-gray-900 truncate">
                  Welcome back, {profile.business_name || 'Business'}
                </h1>
                <p className="text-xs text-gray-500">Create content and drive revenue</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <Bell className="w-4 h-4 text-gray-600" />
                </button>
                <div className="w-8 h-8 rounded-full bg-dc-teal flex items-center justify-center ring-2 ring-teal-400">
                  <span className="text-xs font-bold text-white">
                    {(profile.business_name || 'B').charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Content sections with padding */}
            <div className="p-4 sm:p-6 space-y-4">

              {/* 2. Donny AI Bar */}
              <DonnyAskBar userRole="business_client" />

              {/* 3. Stats Row */}
              <BusinessStatsRow />

              {/* 4. Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => navigate('/dashboard/business/campaigns/create')}
                  className="bg-dc-teal rounded-xl p-4 text-center hover:bg-dc-teal/90 transition-colors"
                >
                  <Rocket className="w-6 h-6 text-white mx-auto mb-2" />
                  <div className="text-sm font-bold text-white">Create Campaign</div>
                  <div className="text-xs text-white/80 mt-1">Launch a new content campaign</div>
                </button>
                <button
                  onClick={() => navigate('/dashboard/business/creators')}
                  className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center hover:border-dc-teal/50 transition-colors"
                >
                  <Users className="w-6 h-6 text-gray-700 mx-auto mb-2" />
                  <div className="text-sm font-bold text-gray-900">Browse Creators</div>
                  <div className="text-xs text-gray-500 mt-1">Find talent for your brand</div>
                </button>
              </div>

              {/* 5. Active Campaigns Feed */}
              <ActiveCampaignsFeed />

              {/* Review Prompts */}
              <RatingPromptManager />

              {/* Sponsorship Proposals (preserved, moved below feed) */}
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

        {/* Side Feed — Desktop only (preserved) */}
        <div className="hidden lg:block w-80 shrink-0 border-l bg-muted/10 sticky top-14 h-[calc(100vh-56px)] overflow-hidden">
          <BusinessDashboardSideFeed
            onItemClick={handleFeedItemClick}
            onFeedItemsLoaded={setAllFeedItems}
          />
        </div>
      </div>

      {/* Lightbox Modal (preserved) */}
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
