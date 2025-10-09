import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSponsorshipCampaigns } from '@/hooks/useSponsorshipCampaigns';
import { useBrandCampaignFilters } from '@/hooks/useBrandCampaignFilters';
import { useBrandSponsorshipStatus } from '@/hooks/useBrandSponsorshipStatus';
import DashboardLayout from '@/components/DashboardLayout';
import BrandCampaignCard from '@/components/campaigns/BrandCampaignCard';
import BrandCampaignFilters from '@/components/campaigns/BrandCampaignFilters';
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
import { supabase } from '@/integrations/supabase/client';

const BrandDiscoverCampaigns = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: campaigns = [], isLoading, error } = useSponsorshipCampaigns(user?.id);
  const { filters, filteredCampaigns, updateFilter, resetFilters } = useBrandCampaignFilters(campaigns);
  
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [showSponsorDialog, setShowSponsorDialog] = useState(false);
  const [sponsorshipAmount, setSponsorshipAmount] = useState('');
  const [proposalMessage, setProposalMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return <MarketplaceLoadingState />;
  }

  if (error) {
    return <MarketplaceErrorState />;
  }

  const handleSponsor = (campaignId: string, existingProposal?: any) => {
    // Don't allow opening dialog if proposal already exists
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
      // Get brand profile
      const { data: brandProfile, error: profileError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      // Get restaurant profile
      const { data: restaurantProfile, error: restaurantError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', selectedCampaign.user_id)
        .single();

      if (restaurantError) throw restaurantError;

      // Create sponsorship proposal
      const { error: sponsorshipError } = await supabase
        .from('campaign_sponsorships')
        .insert({
          campaign_id: selectedCampaign.id,
          brand_id: brandProfile.id,
          restaurant_id: restaurantProfile.id,
          sponsorship_amount: parseFloat(sponsorshipAmount),
          proposal_message: proposalMessage,
          status: 'pending',
        });

      if (sponsorshipError) {
        // Check for duplicate key error
        if (sponsorshipError.code === '23505' || sponsorshipError.message?.includes('duplicate')) {
          throw new Error('DUPLICATE_PROPOSAL');
        }
        throw sponsorshipError;
      }

      toast({
        title: 'Sponsorship Proposal Sent',
        description: 'Your sponsorship proposal has been submitted successfully.',
      });

      setShowSponsorDialog(false);
      setSponsorshipAmount('');
      setProposalMessage('');
      setSelectedCampaign(null);
    } catch (err: any) {
      console.error('Error submitting sponsorship:', err);
      
      if (err.message === 'DUPLICATE_PROPOSAL') {
        toast({
          title: 'Proposal Already Exists',
          description: 'You have already submitted a proposal for this campaign. Check your sponsorships page to view it.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to submit sponsorship proposal. Please try again.',
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
          {/* Header */}
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

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filters Sidebar */}
            <div className="lg:col-span-1">
              <BrandCampaignFilters
                filters={filters}
                onFilterChange={updateFilter}
                onReset={resetFilters}
                totalCount={campaigns.length}
                filteredCount={filteredCampaigns.length}
              />
            </div>

            {/* Campaigns Grid */}
            <div className="lg:col-span-3">
              {filteredCampaigns.length === 0 ? (
                <div className="text-center py-12 bg-card rounded-lg border">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No campaigns found</h3>
                  <p className="text-muted-foreground mb-4">
                    {campaigns.length === 0
                      ? 'No campaigns are currently open for sponsorship'
                      : 'Try adjusting your filters to see more campaigns'}
                  </p>
                  {campaigns.length > 0 && (
                    <Button variant="outline" onClick={resetFilters}>
                      Reset Filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredCampaigns.map((campaign) => (
                    <BrandCampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      onSponsor={handleSponsor}
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </div>
              )}
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
