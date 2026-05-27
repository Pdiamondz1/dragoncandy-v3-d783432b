import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useOrgDragonSharePosts } from '@/hooks/useDragonShare';
import { useOrg } from '@/hooks/useOrgData';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { useAuth } from '@/hooks/useAuth';
import { DragonSharePostCard } from '@/components/dragonshare/DragonSharePostCard';
import { DragonShareHowItWorks } from '@/components/dragonshare/DragonShareHowItWorks';
import { DragonShareQuickTip } from '@/components/dragonshare/DragonShareQuickTip';
import type { UserRole } from '@/types/user';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';

type Tab = 'available' | 'boosted' | 'all';

export function BusinessDragonSharePage({ userRole }: { userRole: UserRole }) {
  useAuth();
  const { data: org } = useOrg();
  const { data: myRole } = useMyOrgRole(org?.id);
  const { data: posts, isLoading } = useOrgDragonSharePosts(org?.id);
  const [activeTab, setActiveTab] = useState<Tab>('available');

  const canBoost = myRole?.role === 'owner' || myRole?.role === 'admin';

  const filteredPosts = (posts ?? []).filter((p) => {
    if (activeTab === 'available') return p.boost_status === 'available';
    if (activeTab === 'boosted') return p.boost_status === 'boosted';
    return true;
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'available', label: 'Available' },
    { key: 'boosted', label: 'Boosted' },
    { key: 'all', label: 'All Time' },
  ];

  return (
    <DashboardLayout userRole={userRole}>
      <PrerequisiteGate feature="use DragonShare">
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader>
          <h1 className="text-2xl font-bold">DragonShare</h1>
          <p className="text-sm text-muted-foreground">
            Creators talking about you. Tap to boost a creator's organic post.
          </p>
        </PageHeader>

        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-dc-teal-btn text-white'
                  : 'bg-dc-teal/10 text-dc-text-muted hover:bg-dc-teal/20'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-dc-teal/10" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-dc-text-muted text-center">
              When creators share content about your restaurant, it'll show up here.
            </p>
            <DragonShareHowItWorks role="business" />
            <DragonShareQuickTip role="business" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {filteredPosts.map((post) => (
                <DragonSharePostCard
                  key={post.id}
                  post={post}
                  canBoost={canBoost}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      </PrerequisiteGate>
    </DashboardLayout>
  );
}

export function BusinessDragonShare() {
  return <BusinessDragonSharePage userRole="business_client" />;
}

export function BrandDragonShare() {
  return <BusinessDragonSharePage userRole="brand" />;
}

export default BusinessDragonShare;
