import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSponsorshipCampaigns, SponsorshipCampaign } from '@/hooks/useSponsorshipCampaigns';
import { useBrandCampaignFilters } from '@/hooks/useBrandCampaignFilters';
import DashboardLayout from '@/components/DashboardLayout';
import BrandCampaignCard from '@/components/campaigns/BrandCampaignCard';
import AdvancedCampaignFilters from '@/components/campaigns/AdvancedCampaignFilters';
import CampaignBrowseContent from '@/components/campaigns/CampaignBrowseContent';
import MarketplaceLoadingState from '@/components/campaigns/MarketplaceLoadingState';
import MarketplaceErrorState from '@/components/campaigns/MarketplaceErrorState';
import { ArrowLeft, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useSubmitSponsorshipProposal } from '@/hooks/useSubmitSponsorshipProposal';

const BrandDiscoverCampaigns = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const submitProposal = useSubmitSponsorshipProposal();
  const { data: campaigns = [], isLoading, error } = useSponsorshipCampaigns(user?.id);
  const { filters, filteredCampaigns, updateFilter, resetFilters } = useBrandCampaignFilters(campaigns);

  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [showSponsorDialog, setShowSponsorDialog] = useState(false);
  const [sponsorshipAmount, setSponsorshipAmount] = useState('');
  const [proposalMessage, setProposalMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounced campaigns for map performance
  const [debouncedCampaigns, setDebouncedCampaigns] = useState(filteredCampaigns);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCampaigns(filteredCampaigns);
    }, 300);
    return () => clearTimeout(timer);
  }, [filteredCampaigns]);

  if (isLoading) {
    return <MarketplaceLoadingState />;
  }

  if (error) {
    return <MarketplaceErrorState />;
  }

  const handleSponsor = (campaignId: string, existingProposal?: any) => {
    if (existingProposal) {
      toast({
        title: 'Proposal Already Submitted',
        description: `You already have a ${existingProposal.status} proposal for this campaign.`,
        variant: 'default',
      });
      return;
    }
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      setSelectedCampaign(campaign);
      setShowSponsorDialog(true);
    }
  };

  const handleViewDetails = (campaignId: string) => {
    navigate(`/dashboard/brand/campaigns/${campaignId}`);
  };

  const handleSubmitSponsorship = async () => {
    if (!user || !selectedCampaign) return;

    setIsSubmitting(true);
    try {
      await submitProposal.mutateAsync({
        campaignId: selectedCampaign.id,
        restaurantUserId: selectedCampaign.user_id,
        sponsorshipAmount: parseFloat(sponsorshipAmount),
        proposalMessage: proposalMessage,
      });

      toast({
        title: 'Sponsorship Proposal Sent',
        description: 'Your sponsorship proposal has been submitted successfully.',
      });

      setShowSponsorDialog(false);
      setSponsorshipAmount('');
      setProposalMessage('');
      setSelectedCampaign(null);
    } catch (err: any) {
      console.error('Error submitting sponsorship via hook:', err);
      if (err?.message === 'DUPLICATE_PROPOSAL') {
        toast({
          title: 'Proposal Already Exists',
          description: 'You have already submitted a proposal for this campaign. Check your sponsorships page to view it.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: err?.message || 'Failed to submit sponsorship proposal. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Template B Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => navigate('/dashboard/brand')}
            className="text-dc-pink-accent mr-2"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            Discover Campaigns
          </h1>
          <div className="flex items-center gap-1 text-xs text-gray-400 font-semibold">
            <Search className="h-3.5 w-3.5" />
            <span>{campaigns.length}</span>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pt-4 pb-24 space-y-4">
          {/* Filters */}
          <AdvancedCampaignFilters
            filters={filters}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            totalCount={campaigns.length}
            filteredCount={filteredCampaigns.length}
          />

          {/* Campaign Browse Content */}
          <CampaignBrowseContent
            campaigns={debouncedCampaigns}
            onViewDetails={handleViewDetails}
            renderCampaignCard={(campaign) => (
              <BrandCampaignCard
                key={campaign.id}
                campaign={campaign as SponsorshipCampaign}
                onSponsor={handleSponsor}
                onViewDetails={handleViewDetails}
                submittingCampaignId={isSubmitting ? selectedCampaign?.id : undefined}
              />
            )}
            emptyState={
              <div className="text-center py-12 border-2 border-dc-teal rounded-2xl p-4">
                <Search className="h-10 w-10 mx-auto text-dc-teal mb-3" />
                <h3 className="font-bold text-gray-900 mb-2">No campaigns found</h3>
                <p className="text-gray-500 text-sm mb-4">
                  {campaigns.length === 0
                    ? 'No campaigns are currently open for sponsorship'
                    : 'Try adjusting your filters to see more campaigns'}
                </p>
                {campaigns.length > 0 && (
                  <button
                    onClick={resetFilters}
                    className="w-full rounded-full border-2 border-dc-teal text-dc-teal font-bold py-3"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            }
          />
        </div>
      </div>

      {/* Sponsorship Proposal Dialog */}
      <Dialog open={showSponsorDialog} onOpenChange={setShowSponsorDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sponsor Campaign</DialogTitle>
            <DialogDescription>
              Submit a sponsorship proposal for "{selectedCampaign?.title}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Sponsorship Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter sponsorship amount"
                value={sponsorshipAmount}
                onChange={(e) => setSponsorshipAmount(e.target.value)}
                min="0"
                step="100"
                className="rounded-full h-12 px-5 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposal">Proposal Message</Label>
              <Textarea
                id="proposal"
                placeholder="Explain why you'd like to sponsor this campaign and what value you can bring..."
                value={proposalMessage}
                onChange={(e) => setProposalMessage(e.target.value)}
                rows={6}
              />
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <Button
                onClick={handleSubmitSponsorship}
                disabled={isSubmitting || !sponsorshipAmount || !proposalMessage}
                className="w-full rounded-full bg-dc-teal text-white font-bold py-3"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Proposal'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSponsorDialog(false)}
                disabled={isSubmitting}
                className="w-full rounded-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default BrandDiscoverCampaigns;
