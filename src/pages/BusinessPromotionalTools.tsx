import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivePromotionsTab } from '@/components/promotions/ActivePromotionsTab';
import { PendingReviewsTab } from '@/components/promotions/PendingReviewsTab';
import { VerifyCodesTab } from '@/components/promotions/VerifyCodesTab';
import { ApprovedVideosTab } from '@/components/promotions/ApprovedVideosTab';
import { QrCode, Video, Ticket, Film } from 'lucide-react';
import { usePromotions } from '@/hooks/usePromotions';

const BusinessPromotionalTools: React.FC = () => {
  const { pendingSubmissions, approvedSubmissions, rejectedSubmissions, isLoading } = usePromotions();
  const pendingCount = pendingSubmissions?.length || 0;
  const approvedCount = approvedSubmissions?.length || 0;

  return (
    <DashboardLayout userRole="business_client">
      <div className="p-4 lg:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            Promotional Tools
          </h1>
          <p className="text-muted-foreground mt-1">
            Create QR-based video promotions to incentivize customer content creation.
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="promotions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="promotions" className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              <span className="hidden sm:inline">Promotions</span>
              <span className="sm:hidden">Promos</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">Pending</span>
              <span className="sm:hidden">Pending</span>
              {pendingCount > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="videos" className="flex items-center gap-2">
              <Film className="h-4 w-4" />
              <span className="hidden sm:inline">Videos</span>
              <span className="sm:hidden">Videos</span>
              {approvedCount > 0 && (
                <span className="ml-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {approvedCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="codes" className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              <span className="hidden sm:inline">Codes</span>
              <span className="sm:hidden">Codes</span>
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
    </DashboardLayout>
  );
};

export default BusinessPromotionalTools;
