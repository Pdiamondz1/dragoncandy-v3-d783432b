import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, DollarSign } from 'lucide-react';
import { useSponsorshipProposals } from '@/hooks/useSponsorshipProposals';
import SponsorshipProposalCard from '@/components/campaigns/SponsorshipProposalCard';
import { BusinessDashboardSideFeed } from '@/components/dragon-feed/BusinessDashboardSideFeed';
import { FeedLightbox } from '@/components/dragon-feed/FeedLightbox';
import { FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';
import { useAIChatModal } from '@/contexts/AIChatModalContext';
import { DonnyCard } from '@/components/donny/DonnyCard';

const BusinessDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { proposals, isLoading: proposalsLoading, updateProposalStatus } = useSponsorshipProposals();
  const { openModal } = useAIChatModal();
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

  const quickActions = [
    {
      title: "View Campaigns",
      description: "Manage your content campaigns and track their progress",
      action: () => navigate('/dashboard/business/campaigns')
    },
    {
      title: "Browse Creators",
      description: "Discover talented content creators for your campaigns",
      action: () => navigate('/dashboard/business/creators')
    },
    {
      title: "View Analytics",
      description: "Track your campaign performance",
      action: () => navigate('/dashboard/analytics')
    }
  ];

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex h-full overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">

          {/* Donny AI Card */}
          <DonnyCard
            onOpenChat={(message) => {
              window.dispatchEvent(
                new CustomEvent('donny-open-chat', { detail: { message } })
              );
            }}
          />


          {/* Review Prompts */}
          <RatingPromptManager />

          {/* DragonDash Card */}
          <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white text-center space-y-4">
            {/* Teal "+" circle */}
            <div className="w-12 h-12 bg-dc-teal rounded-full flex items-center justify-center mx-auto">
              <Plus className="w-6 h-6 text-white" />
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-gray-900">
              Start A DragonDash
            </h2>

            {/* Description */}
            <p className="text-sm text-gray-500">
              Need content in hours, not days? Choose your delivery speed and let our creators deliver quality content fast.
            </p>

            {/* CTA Button */}
            <Button
              className="bg-dc-teal hover:bg-dc-teal/90 text-white font-bold rounded-full px-8 py-2 w-full"
              onClick={() => navigate('/dashboard/business/campaigns/create')}
            >
              DragonDash
            </Button>
          </div>

          {/* Sponsorship Proposals Section */}
          {pendingProposals.length > 0 && (
            <div className="space-y-4">
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
            </div>
          )}

          {/* Quick Actions */}
          <div className="space-y-3">
            {/* Section heading in Pacifico script */}
            <h2 className="font-script text-2xl text-dc-teal text-center">Quick Actions</h2>
            <p className="text-sm text-gray-500 text-center">
              Instant social media department: campaigns generated, creators connected, authentic content posted in 3 hours flat.
            </p>
            <p className="text-sm text-gray-500 text-center">
              Launch faster. Spend less. Crush engagement. Start now.
            </p>

            {/* 3-column grid */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  className="border-2 border-dc-teal rounded-2xl p-3 text-center bg-white hover:bg-dc-teal/5 transition-colors cursor-pointer"
                >
                  <h3 className="text-sm font-bold text-gray-900">
                    {action.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {action.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          </div>
        </div>

        {/* Side Feed - Always Visible */}
        <div className="hidden lg:block w-80 shrink-0 border-l bg-muted/10 sticky top-14 h-[calc(100vh-56px)] overflow-hidden">
          <BusinessDashboardSideFeed 
            onItemClick={handleFeedItemClick}
            onFeedItemsLoaded={setAllFeedItems}
          />
        </div>
      </div>

      {/* Lightbox Modal */}
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
