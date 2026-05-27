import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivePromotionsTab } from '@/components/promotions/ActivePromotionsTab';
import { CGCContentLibrary } from '@/components/promotions/CGCContentLibrary';
import { HelpTooltip } from '@/features/promotions/components/HelpTooltip';
import { Button } from '@/components/ui/button';
import { usePromotions } from '@/hooks/usePromotions';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
import { useState } from 'react';

const BusinessPromotionalTools = () => {
  const { pendingSubmissions, stats, socialPostStats, promotions } = usePromotions();
  const pendingCount = pendingSubmissions?.length || 0;
  const approvedCount = stats.approvedCount;
  const postedCount = socialPostStats?.total || 0;
  const [activeTab, setActiveTab] = useState('promotions');

  const firstPromotionTitle = promotions?.[0]?.title || '';

  return (
    <DashboardLayout userRole="business_client">
      <PrerequisiteGate feature="use Promotions">
      <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4">
          <h1 className="font-sans text-sm font-bold uppercase tracking-wide text-dc-text inline-flex items-center gap-2">
            Customer Generated Content
            <HelpTooltip
              slug="create-promotion"
              summary="Turn your customers into content creators. They record, you approve, it posts to your social media automatically."
            />
          </h1>
          <p className="text-xs text-dc-text-muted mt-1">
            Turn your customers into content creators. They record, you approve, it posts to your social media automatically.
          </p>

          {/* 3 stat cards */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-white rounded-2xl p-3 border-2 border-dc-teal">
              <p className="text-2xl font-extrabold text-dc-text">{pendingCount}</p>
              <p className="text-[10px] text-dc-text-muted">Pending</p>
            </div>
            <div className="bg-white rounded-2xl p-3 border-2 border-dc-teal">
              <p className="text-2xl font-extrabold text-dc-text">{approvedCount}</p>
              <p className="text-[10px] text-dc-text-muted">Approved</p>
            </div>
            <div className="bg-white rounded-2xl p-3 border-2 border-dc-teal">
              <p className="text-2xl font-extrabold text-dc-text">{postedCount}</p>
              <p className="text-[10px] text-dc-text-muted">Posted to Social</p>
            </div>
          </div>
        </div>

        {/* Priority banner */}
        {pendingCount > 0 && (
          <div className="mx-4 mt-3 bg-dc-teal/10 border border-dc-teal/30 rounded-2xl p-4 flex items-center justify-between">
            <p className="text-sm font-medium text-dc-text">
              You have {pendingCount} video{pendingCount !== 1 ? 's' : ''} to review
            </p>
            <Button
              size="sm"
              className="rounded-full bg-dc-teal text-white"
              onClick={() => setActiveTab('library')}
            >
              Review Now
            </Button>
          </div>
        )}

        {/* White body */}
        <div className="bg-white p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="promotions">Promotions</TabsTrigger>
              <TabsTrigger value="library" className="flex items-center gap-1">
                Content Library
                {pendingCount > 0 && (
                  <span className="ml-1 bg-dc-teal text-white text-xs px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="promotions">
              {(!promotions || promotions.length === 0) && (
                <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-2xl p-4 text-center space-y-2 mb-4">
                  <p className="text-sm font-medium text-dc-text">
                    Turn your customers into content creators
                  </p>
                  <p className="text-xs text-dc-text-muted">
                    Create a promotion → Customers scan your QR code → Record content → Get a discount. Their content posts to your social media automatically.
                  </p>
                </div>
              )}
              <ActivePromotionsTab />
            </TabsContent>

            <TabsContent value="library">
              <CGCContentLibrary promotionTitle={firstPromotionTitle} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      </PrerequisiteGate>
    </DashboardLayout>
  );
};

export default BusinessPromotionalTools;
