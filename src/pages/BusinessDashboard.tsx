import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Users, Target, Plus, DollarSign } from 'lucide-react';
import { useSponsorshipProposals } from '@/hooks/useSponsorshipProposals';
import SponsorshipProposalCard from '@/components/campaigns/SponsorshipProposalCard';
import { BusinessDashboardSideFeed } from '@/components/dragon-feed/BusinessDashboardSideFeed';
import { FeedLightbox } from '@/components/dragon-feed/FeedLightbox';
import { FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';
import { AskBar } from '@/components/ai-assistant';
import { useAIChatModal } from '@/contexts/AIChatModalContext';

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
      description: "Manage your active and past campaigns",
      icon: <Target className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/business/campaigns')
    },
    {
      title: "Browse Creators",
      description: "Discover talented content creators",
      icon: <Users className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/business/creators')
    },
    {
      title: "View Analytics",
      description: "Track your campaign performance",
      icon: <BarChart3 className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/analytics')
    }
  ];

  const howItWorksSteps = [
    {
      number: "1",
      title: "Create Campaign",
      description: "Use our AI-powered wizard to create your campaign strategy"
    },
    {
      number: "2",
      title: "Find Creators",
      description: "Browse and connect with talented content creators"
    },
    {
      number: "3",
      title: "Collaborate",
      description: "Work together to create amazing content"
    },
    {
      number: "4",
      title: "Launch & Grow",
      description: "Publish your content and watch your brand grow"
    }
  ];

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex h-full">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-12">

          {/* Pink Welcome Header */}
          <div className="bg-dc-pink-bg -mx-8 -mt-8 px-8 pt-6 pb-6 mb-6">
            <h1 className="text-xl font-extrabold text-dc-teal uppercase tracking-wide text-center">
              Welcome Back, {profile.business_name}!
            </h1>
            <p className="text-sm text-[#111111] text-center mt-1">Create content and drive revenue</p>
          </div>

          {/* Ask Bar */}
          <div className="pt-4">
            <AskBar onClick={openModal} userRole="business_client" />
          </div>

          {/* Review Prompts */}
          <RatingPromptManager />

          {/* Create Campaign CTA - DragonDash Branded */}
          <div className="text-center">
            <Card className="max-w-2xl mx-auto border-2 border-dc-teal rounded-3xl bg-white shadow-sm">
              <CardContent className="p-8">
                <div className="space-y-6">
                  {/* Plus Icon */}
                  <div className="w-16 h-16 bg-dc-teal rounded-full flex items-center justify-center mx-auto shadow-lg">
                    <Plus className="w-8 h-8 text-white" />
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h2 className="text-3xl font-bold text-[#111111] mb-1">
                      DragonDash
                    </h2>
                    <p className="text-lg text-gray-700 font-medium">
                      Fast Content, On Demand
                    </p>
                  </div>

                  {/* Description */}
                  <p className="text-gray-600">
                    Need content in hours, not days? Choose your delivery speed and let our creators deliver quality content fast.
                  </p>

                  {/* CTA Button */}
                  <Button
                    size="lg"
                    className="bg-dc-teal text-white rounded-full hover:bg-dc-teal-dark px-8 py-3"
                    onClick={() => navigate('/dashboard/business/campaigns/create')}
                  >
                    DragonDash
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* How It Works */}
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-dc-teal uppercase mb-4">How It Works</h2>
              <p className="text-gray-600">Simple steps to launch your next successful campaign</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {howItWorksSteps.map((step, index) => (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-dc-teal text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                      {step.number}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Sponsorship Proposals Section */}
          {pendingProposals.length > 0 && (
            <div className="space-y-6">
              <Card className="border-2 border-dc-teal bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-dc-teal" />
                    Sponsorship Proposals ({pendingProposals.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
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
                      className="w-full mt-4"
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
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-dc-teal uppercase mb-4">Quick Actions</h2>
              <p className="text-gray-600 text-center">Manage your campaigns and discover new opportunities</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {quickActions.map((action, index) => (
                <Card key={index} className="border-2 border-dc-teal rounded-2xl hover:shadow-md cursor-pointer" onClick={action.action}>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {action.icon}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {action.title}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {action.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
