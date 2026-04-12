import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivePromotionsTab } from '@/components/promotions/ActivePromotionsTab';
import { PendingReviewsTab } from '@/components/promotions/PendingReviewsTab';
import { VerifyCodesTab } from '@/components/promotions/VerifyCodesTab';
import { ApprovedVideosTab } from '@/components/promotions/ApprovedVideosTab';
import { HelpTooltip } from '@/features/promotions/components/HelpTooltip';
import { QrCode, Video, Ticket, Film } from 'lucide-react';
import { usePromotions } from '@/hooks/usePromotions';

const BusinessPromotionalTools: React.FC = () => {
  const { pendingSubmissions, approvedSubmissions, rejectedSubmissions, isLoading } = usePromotions();
  const pendingCount = pendingSubmissions?.length || 0;
  const approvedCount = approvedSubmissions?.length || 0;

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
        {/* Template A: Pink gradient header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4">
          <h1 className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal inline-flex items-center gap-2">
            Promotional Tools
            <HelpTooltip
              slug="create-promotion"
              summary="Create QR-based promotions that turn customers into content creators. They film or snap, you reward them with a discount."
            />
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Create QR-based video promotions to incentivize customer content creation.
          </p>
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
              <p className="text-3xl font-extrabold text-gray-900">{pendingCount}</p>
              <p className="text-xs text-gray-500">Pending Reviews</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
              <p className="text-3xl font-extrabold text-gray-900">{approvedCount}</p>
              <p className="text-xs text-gray-500">Approved Videos</p>
            </div>
          </div>
        </div>

        {/* White body */}
        <div className="bg-white p-4">
          <Tabs defaultValue="promotions" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="promotions" className="flex items-center gap-1 text-xs">
                <QrCode className="h-3 w-3" />
                <span className="hidden sm:inline">Promotions</span>
                <span className="sm:hidden">Promos</span>
              </TabsTrigger>
              <TabsTrigger value="reviews" className="flex items-center gap-1 text-xs">
                <Video className="h-3 w-3" />
                Pending
                {pendingCount > 0 && (
                  <span className="ml-1 bg-dc-teal text-white text-xs px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="videos" className="flex items-center gap-1 text-xs">
                <Film className="h-3 w-3" />
                Videos
                {approvedCount > 0 && (
                  <span className="ml-1 bg-dc-teal text-white text-xs px-1.5 py-0.5 rounded-full">
                    {approvedCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="codes" className="flex items-center gap-1 text-xs">
                <Ticket className="h-3 w-3" />
                Codes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="promotions">
              <ActivePromotionsTab />
            </TabsContent>

            <TabsContent value="reviews">
              <PendingReviewsTab />
            </TabsContent>

            <TabsContent value="videos">
              <ApprovedVideosTab
                approvedSubmissions={approvedSubmissions || []}
                rejectedSubmissions={rejectedSubmissions || []}
                isLoading={isLoading}
              />
            </TabsContent>

            <TabsContent value="codes">
              <VerifyCodesTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessPromotionalTools;
