
import { useParams } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { AlertCircle } from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import ApplicationsListFixed from '@/components/campaigns/ApplicationsListFixed';

const BusinessProposals = () => {
  const { campaignId } = useParams<{ campaignId: string }>();

  const { campaigns = [], isLoading: campaignLoading, error: campaignError } = useCampaigns();
  const campaign = campaigns.find(c => c.id === campaignId);

  if (campaignLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <div className="flex-1 text-center">
              <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Proposals</h1>
            </div>
          </div>
          <div className="p-4">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded-full w-1/3"></div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-2xl border-2 border-dc-teal"></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (campaignError) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <div className="flex-1 text-center">
              <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Proposals</h1>
            </div>
          </div>
          <div className="p-4">
            <div className="border-2 border-dc-teal rounded-2xl p-6 text-center">
              <AlertCircle className="h-12 w-12 text-dc-pink-accent mx-auto mb-3" />
              <p className="font-bold text-gray-900">Failed to load campaign data</p>
              <p className="text-xs text-gray-500 mt-1">{campaignError?.message || 'Unknown error occurred'}</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <div className="flex-1 text-center">
              <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Proposals</h1>
            </div>
          </div>
          <div className="p-4">
            <div className="border-2 border-dc-teal rounded-2xl p-6 text-center">
              <AlertCircle className="h-12 w-12 text-dc-yellow mx-auto mb-3" />
              <p className="font-bold text-gray-900">Campaign not found</p>
              <p className="text-xs text-gray-500 mt-1">
                The campaign you're looking for doesn't exist or you don't have access to it.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Proposals</h1>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-gray-500">
            Reviewing applications for <span className="font-semibold text-gray-900">"{campaign?.title}"</span>
          </p>
          <ApplicationsListFixed campaignId={campaignId!} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessProposals;
