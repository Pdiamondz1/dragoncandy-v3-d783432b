import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorApplications } from '@/hooks/useCreatorApplications';
import { useCreatorCollaborations } from '@/hooks/useCreatorCollaborations';
import { useCreatorEarnings } from '@/hooks/useCreatorEarnings';
import { EarningsSummary } from '@/components/projects/EarningsSummary';
import { MyCampaignCard } from '@/components/my-campaigns/MyCampaignCard';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardLayout } from '@/components/DashboardLayout';

type TabId = 'applied' | 'active' | 'done';

export default function MyCampaignsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: applications = [], isLoading: appsLoading } = useCreatorApplications();
  const { data: activeCollabs = [], isLoading: activeLoading } = useCreatorCollaborations('active');
  const { data: completedCollabs = [], isLoading: completedLoading } = useCreatorCollaborations('completed');
  const { data: earnings } = useCreatorEarnings(user?.id);

  const isLoading = appsLoading || activeLoading || completedLoading;

  const pendingApps = useMemo(
    () => applications.filter((a) => a.status === 'pending' || a.status === 'counter_offered'),
    [applications],
  );

  const defaultTab: TabId = activeCollabs.length > 0 ? 'active' : 'applied';
  const activeTab = (searchParams.get('tab') as TabId) || defaultTab;

  const setTab = (tab: TabId) => {
    setSearchParams({ tab }, { replace: true });
  };

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'applied', label: 'Applied', count: pendingApps.length },
    { id: 'active', label: 'Active', count: activeCollabs.length },
    { id: 'done', label: 'Done', count: completedCollabs.length },
  ];

  const handleSetupPayouts = async () => {
    const { data } = await supabase.functions.invoke('create-creator-connect-account');
    if (data?.url) window.location.href = data.url;
  };

  return (
    <DashboardLayout userRole="content_creator">
      <div className="bg-white min-h-full">
        {/* Page title */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 tracking-wide">MY CAMPAIGNS</h1>
        </div>

        {/* Earnings Summary */}
        {earnings && (
          <div className="px-4 pb-3">
            <EarningsSummary
              totalEarned={earnings.totalEarned}
              inEscrow={earnings.inEscrow}
              available={earnings.available}
              onboardingComplete={earnings.onboardingComplete}
              onSetupPayouts={handleSetupPayouts}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex px-4 mb-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex-1 text-center py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'text-gray-900 border-b-[3px] border-dc-teal'
                  : 'text-gray-400 border-b-[3px] border-transparent'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="px-4 pb-24 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))
          ) : (
            <>
              {activeTab === 'applied' && (
                pendingApps.length === 0 ? (
                  <EmptyState message="No pending applications" sub="Browse campaigns to find your next gig" />
                ) : (
                  pendingApps.map((app) => (
                    <MyCampaignCard
                      key={app.id}
                      variant={app.status === 'counter_offered' ? 'counter_offered' : 'applied'}
                      campaignId={app.campaign_id}
                      title={app.campaign?.title || 'Untitled Campaign'}
                      businessName={app.business_profile?.business_name || 'Unknown Business'}
                      businessLocation={app.business_profile?.city}
                      price={app.proposed_rate ?? app.campaign?.fixed_price ?? null}
                      application={app}
                    />
                  ))
                )
              )}

              {activeTab === 'active' && (
                activeCollabs.length === 0 ? (
                  <EmptyState message="No active projects" sub="Applied campaigns will appear here once accepted" />
                ) : (
                  activeCollabs.map((collab) => (
                    <MyCampaignCard
                      key={collab.id}
                      variant="active"
                      campaignId={collab.campaign_id}
                      title={collab.campaign?.title || 'Untitled Campaign'}
                      businessName={collab.business_profile?.business_name || 'Unknown Business'}
                      price={collab.campaign?.fixed_price ?? null}
                      collaboration={collab}
                    />
                  ))
                )
              )}

              {activeTab === 'done' && (
                completedCollabs.length === 0 ? (
                  <EmptyState message="No completed projects yet" sub="Completed work will appear here" />
                ) : (
                  completedCollabs.map((collab) => (
                    <MyCampaignCard
                      key={collab.id}
                      variant="completed"
                      campaignId={collab.campaign_id}
                      title={collab.campaign?.title || 'Untitled Campaign'}
                      businessName={collab.business_profile?.business_name || 'Unknown Business'}
                      price={collab.campaign?.fixed_price ?? null}
                      collaboration={collab}
                    />
                  ))
                )
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-gray-600 font-semibold">{message}</p>
      <p className="text-gray-400 text-sm mt-1">{sub}</p>
    </div>
  );
}
