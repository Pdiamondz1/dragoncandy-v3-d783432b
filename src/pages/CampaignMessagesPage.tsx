
import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { ArrowLeft } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import { useAuth } from '@/hooks/useAuth';
import MessageThread from '@/components/messages/MessageThread';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignApplications } from '@/hooks/useFetchApplications';

const CampaignMessagesPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(campaignId!);
  const { data: applications = [] } = useCampaignApplications(campaignId!);

  const userRole = user?.user_metadata?.role || 'business_client';

  const handleBack = () => {
    const from = searchParams.get('from');
    if (from === 'business-projects' && userRole === 'business_client') {
      navigate('/dashboard/business/projects');
    } else {
      navigate('/messages');
    }
  };

  // Find the correct recipient based on user role and campaign applications
  const getRecipientId = () => {
    if (!campaign || !user) return null;

    if (userRole === 'business_client') {
      const acceptedApplication = applications.find(app => app.status === 'accepted');
      return acceptedApplication?.creator_id || null;
    } else {
      return campaign.user_id;
    }
  };

  const recipientId = getRecipientId();

  if (isLoading) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="min-h-screen overflow-x-hidden bg-teal-50">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <div className="w-7" />
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              Campaign Messages
            </h1>
            <div className="w-7" />
          </div>
          <div className="px-4 pt-4 pb-24 md:pb-0 space-y-4">
            <Skeleton className="h-10 w-full rounded-2xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="min-h-screen overflow-x-hidden bg-teal-50">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <button
              onClick={handleBack}
              className="text-dc-pink-accent text-lg mr-2"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              Campaign Messages
            </h1>
            <div className="w-7" />
          </div>
          <div className="px-4 pt-4 pb-24 md:pb-0">
            <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white flex flex-col items-center py-12">
              <h3 className="text-base font-bold text-gray-900 mb-2">Campaign not found</h3>
              <p className="text-sm text-gray-500 text-center mb-4">
                The campaign you're looking for doesn't exist or you don't have access to it.
              </p>
              <button
                onClick={handleBack}
                className="rounded-full bg-dc-teal text-white font-bold px-6 py-2 text-sm"
              >
                Back to Messages
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!recipientId) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="min-h-screen overflow-x-hidden bg-teal-50">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <button
              onClick={handleBack}
              className="text-dc-pink-accent text-lg mr-2"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              {campaign.title}
            </h1>
            <div className="w-7" />
          </div>
          <div className="px-4 pt-4 pb-24 md:pb-0">
            <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white flex flex-col items-center py-12">
              <h3 className="text-base font-bold text-gray-900 mb-2">No conversation available</h3>
              <p className="text-sm text-gray-500 text-center mb-4">
                {userRole === 'business_client'
                  ? 'No creators have been accepted for this campaign yet.'
                  : 'Unable to find the campaign owner for messaging.'}
              </p>
              <button
                onClick={handleBack}
                className="rounded-full bg-dc-teal text-white font-bold px-6 py-2 text-sm"
              >
                Back to Messages
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="min-h-screen overflow-x-hidden bg-teal-50 md:max-w-4xl md:mx-auto">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={handleBack}
            className="text-dc-pink-accent text-lg mr-2"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            {campaign.title}
          </h1>
          <div className="w-7" />
        </div>

        {/* Message thread inside teal-bordered card */}
        <div className="px-4 pt-4 pb-24 md:pb-0">
          <div className="border-2 border-dc-teal rounded-2xl overflow-hidden bg-white">
            <MessageThread
              campaignId={campaign.id}
              recipientId={recipientId}
              campaignTitle={campaign.title}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignMessagesPage;
