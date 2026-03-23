import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { useCampaign } from '@/hooks/useCampaigns';
import { useCampaignEditForm } from '@/hooks/useCampaignEditForm';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import CampaignBasicInfoForm from '@/components/campaigns/CampaignBasicInfoForm';
import CampaignPlatformsForm from '@/components/campaigns/CampaignPlatformsForm';
import CampaignBudgetTimelineForm from '@/components/campaigns/CampaignBudgetTimelineForm';
import CampaignStyleToneForm from '@/components/campaigns/CampaignStyleToneForm';
import CampaignSponsorshipToggle from '@/components/campaigns/CampaignSponsorshipToggle';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

const CampaignEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(id!);
  const {
    formData,
    isSaving,
    handleInputChange,
    handleArrayChange,
    handleSave,
  } = useCampaignEditForm(campaign);

  // Ownership check — redirect if not owner
  useEffect(() => {
    if (campaign && user && campaign.user_id !== user.id) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to edit this campaign.',
        variant: 'destructive',
      });
      navigate('/dashboard/business/campaigns');
    }
  }, [campaign, user, navigate]);

  const handleSaveWithNavigation = async (saveStatus: 'draft' | 'published') => {
    const success = await handleSave(saveStatus);
    if (success) {
      navigate(`/dashboard/business/campaigns/${campaign!.id}`);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <span className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="px-4 py-6 space-y-4">
            <div className="h-8 bg-gray-200 rounded-full w-1/3 animate-pulse" />
            <div className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
          <div className="text-center space-y-4 max-w-sm w-full">
            <h2 className="text-xl font-bold text-gray-900">Campaign Not Found</h2>
            <p className="text-gray-500 text-sm">The campaign you're trying to edit doesn't exist.</p>
            <button
              onClick={() => navigate('/dashboard/business/campaigns')}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3"
            >
              Back to Campaigns
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Not owner — render nothing while redirecting
  if (campaign && user && campaign.user_id !== user.id) {
    return null;
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Template C Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
            className="text-dc-pink-accent mr-2"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            Edit Campaign
          </h1>
          <button
            onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
            className="text-dc-teal"
            aria-label="Preview"
          >
            <Eye className="h-5 w-5" />
          </button>
        </div>

        {/* Form sections */}
        <div className="px-4 py-6 pb-28 space-y-6">
          <CampaignBasicInfoForm
            formData={formData}
            onInputChange={handleInputChange}
          />

          <CampaignPlatformsForm
            formData={formData}
            onArrayChange={handleArrayChange}
          />

          <CampaignBudgetTimelineForm
            formData={formData}
            onInputChange={handleInputChange}
          />

          <CampaignStyleToneForm
            formData={formData}
            onInputChange={handleInputChange}
          />

          <CampaignSponsorshipToggle
            openForSponsorship={formData.open_for_sponsorship}
            onToggle={(value) => handleInputChange('open_for_sponsorship', value)}
          />

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => handleSaveWithNavigation('published')}
              disabled={isSaving || !formData.title.trim()}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Publishing...' : 'Publish Campaign'}
            </button>
            <button
              onClick={() => handleSaveWithNavigation('draft')}
              disabled={isSaving || !formData.title.trim()}
              className="w-full rounded-full border-2 border-gray-300 text-gray-700 font-bold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save as Draft
            </button>
            <button
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              className="w-full rounded-full border border-gray-200 text-gray-500 font-semibold py-3"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignEditPage;
