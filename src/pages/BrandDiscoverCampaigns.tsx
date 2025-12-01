import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSponsorshipCampaigns } from '@/hooks/useSponsorshipCampaigns';
import { useBrandCampaignFilters } from '@/hooks/useBrandCampaignFilters';
import DashboardLayout from '@/components/DashboardLayout';
import { CampaignBrowseContent } from '@/components/campaigns/CampaignBrowseContent';
import MarketplaceLoadingState from '@/components/campaigns/MarketplaceLoadingState';
import MarketplaceErrorState from '@/components/campaigns/MarketplaceErrorState';
import { Rocket, Search } from 'lucide-react';
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
  const { toast } = useToast();
  const submitProposal = useSubmitSponsorshipProposal();
  const { data: campaigns = [], isLoading, error } = useSponsorshipCampaigns(user?.id);
  const { filters, filteredCampaigns, updateFilter, resetFilters } = useBrandCampaignFilters(campaigns);
  
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [showSponsorDialog, setShowSponsorDialog] = useState(false);
  const [sponsorshipAmount, setSponsorshipAmount] = useState('');
  const [proposalMessage, setProposalMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    window.open(`/dashboard/brand/campaigns/${campaignId}`, '_blank');
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
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Rocket className="h-8 w-8" />
                Discover Campaigns
              </h1>
              <p className="text-muted-foreground mt-1">
                Find restaurant campaigns to sponsor and amplify your brand reach
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              <span>{campaigns.length} campaigns available</span>
            </div>
          </div>

          {isLoading ? (
            <MarketplaceLoadingState />
          ) : error ? (
            <MarketplaceErrorState />
          ) : (
            <CampaignBrowseContent
              filteredCampaigns={filteredCampaigns}
              filters={filters}
              onFilterChange={updateFilter}
              onResetFilters={resetFilters}
              isLoading={isLoading}
              error={error}
              campaignType="brand"
              onSponsor={handleSponsor}
              onViewDetails={handleViewDetails}
              submittingCampaignId={isSubmitting ? selectedCampaign?.id : undefined}
            />
          )}

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

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowSponsorDialog(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitSponsorship}
                    disabled={isSubmitting || !sponsorshipAmount || !proposalMessage}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Proposal'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandDiscoverCampaigns;
