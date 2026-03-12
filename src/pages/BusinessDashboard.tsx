import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Users, Target, DollarSign } from 'lucide-react';
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
      icon: <Target className="h-6 w-6 text-blue-600" />,
      action: () => navigate('/dashboard/business/campaigns')
    },
    {
      title: "Browse Creators",
      description: "Discover talented content creators",
      icon: <Users className="h-6 w-6 text-green-600" />,
      action: () => navigate('/dashboard/business/creators')
    },
    {
      title: "View Analytics",
      description: "Track your campaign performance",
      icon: <BarChart3 className="h-6 w-6 text-purple-600" />,
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
          
          {/* Ask Bar */}
          <div className="pt-4">
            <AskBar onClick={openModal} userRole="business_client" />
          </div>
          
          {/* Review Prompts */}
          <RatingPromptManager />
          
          {/* Welcome Header */}
          <div className="text-center space-y-4 rounded-2xl bg-[#F9C8E0] py-6 px-4">
            <h1 className="text-3xl font-bold uppercase text-teal-500">
              Welcome Back, {profile.business_name}
            </h1>
            <p className="text-base text-gray-700 font-medium">
              Ready to create amazing content with talented creators?
            </p>
          </div>

          {/* Create Campaign CTA - DragonDash Branded */}
          <div className="text-center">
            <Card className="max-w-2xl mx-auto bg-white border border-teal-300 shadow-sm rounded-2xl">
              <CardContent className="p-8">
                <div className="space-y-6">
                  {/* Teal Plus Icon */}
                  <div className="w-16 h-16 bg-teal-400 rounded-full flex items-center justify-center mx-auto shadow">
                    <span className="text-white text-3xl font-bold leading-none">+</span>
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">
                      DragonDash
                    </h2>
                    <p className="text-base text-gray-600">
                      Fast Content, On Demand
                    </p>
                  </div>

                  {/* Description */}
                  <p className="text-gray-600 text-sm">
                    Need content in hours, not days? Choose your delivery speed and let our creators deliver quality content fast.
                  </p>

                  {/* CTA Button */}
                  <Button
                    size="lg"
                    className="w-full rounded-full bg-teal-400 hover:bg-teal-500 text-white font-bold"
                    onClick={() => navigate('/dashboard/business/campaigns/create')}
                  >
                    Start a DragonDash
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* How It Works */}
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
              <p className="text-gray-600">Simple steps to launch your next successful campaign</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {howItWorksSteps.map((step, index) => (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-pink-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
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
              <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-blue-600" />
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
              <h2 className="text-2xl font-bold uppercase text-teal-500 mb-2">Quick Actions</h2>
              <p className="text-gray-600 text-sm">Manage your campaigns and discover new opportunities</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {quickActions.map((action, index) => (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow cursor-pointer border border-teal-300 rounded-2xl" onClick={action.action}>
                  <CardContent className="p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                      {action.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {action.description}
                    </p>
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
