
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { useCampaign } from '@/hooks/useCampaigns';
import { useCampaignEditForm } from '@/hooks/useCampaignEditForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import CampaignBasicInfoForm from '@/components/campaigns/CampaignBasicInfoForm';
import CampaignPlatformsForm from '@/components/campaigns/CampaignPlatformsForm';
import CampaignBudgetTimelineForm from '@/components/campaigns/CampaignBudgetTimelineForm';
import CampaignStyleToneForm from '@/components/campaigns/CampaignStyleToneForm';
import CampaignSponsorshipToggle from '@/components/campaigns/CampaignSponsorshipToggle';

const CampaignEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { campaign, isLoading, error } = useCampaign(id!);
  const {
    formData,
    isSaving,
    handleInputChange,
    handleArrayChange,
    handleSave,
  } = useCampaignEditForm(campaign);

  const handleSaveWithNavigation = async (saveStatus: 'draft' | 'published') => {
    const success = await handleSave(saveStatus);
    if (success) {
      navigate(`/dashboard/business/campaigns/${campaign!.id}`);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Campaign Not Found</h2>
              <p className="text-gray-600 mb-6">The campaign you're trying to edit doesn't exist.</p>
              <Button onClick={() => navigate('/dashboard/business/campaigns')}>
                Back to Campaigns
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Details
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Edit Campaign</h1>
                <p className="text-gray-600 mt-1">Update your campaign details and settings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
                className="flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
            </div>
          </div>

          <div className="space-y-6">
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

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-6 border-t">
              <Button
                variant="outline"
                onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              >
                Cancel
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleSaveWithNavigation('draft')}
                  disabled={isSaving || !formData.title.trim()}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save as Draft
                </Button>
                <Button
                  onClick={() => handleSaveWithNavigation('published')}
                  disabled={isSaving || !formData.title.trim()}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Publishing...' : 'Publish Campaign'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignEditPage;
