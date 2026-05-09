import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useOrgDragonSharePosts } from '@/hooks/useDragonShare';
import { useOrg } from '@/hooks/useOrgData';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { useAuth } from '@/hooks/useAuth';
import { DragonSharePostCard } from '@/components/dragonshare/DragonSharePostCard';
import { DragonShareExplainer } from '@/components/dragonshare/DragonShareExplainer';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import type { UserRole } from '@/types/user';
import { Coachmark } from '@/components/guidance/Coachmark';
import { PageHeader } from '@/components/ui/PageHeader';

type Tab = 'available' | 'boosted' | 'all';

export function BusinessDragonSharePage({ userRole }: { userRole: UserRole }) {
  useAuth();
  const { data: org } = useOrg();
  const { data: myRole } = useMyOrgRole(org?.id);
  const { data: posts, isLoading } = useOrgDragonSharePosts(org?.id);
  const navigate = useNavigate();
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

  function handleSkip(_postId: string) {
    // no-op: skip action acknowledged
  }

  return (
    <DashboardLayout userRole={userRole}>
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader>
          <h1 className="text-2xl font-bold">
            DragonShare
          </h1>
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
                  ? 'bg-teal-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="space-y-6">
            <Coachmark coachmarkKey="dragonshare_inbox" title="Creators talking about you" body="One tap to boost. The creator gets 80%.">
              <div className="rounded-2xl border border-dashed border-teal-300 p-8 text-center">
                <Users className="mx-auto h-10 w-10 text-teal-400 mb-3" />
                <p className="font-medium">No DragonShare posts yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Creators post about you organically all the time — when they submit those posts here, you'll see them. Want to invite your favorite creators directly?
                </p>
                <Button
                  variant="outline"
                  className="mt-4 rounded-full"
                  onClick={() => navigate(userRole === 'business_client' ? '/dashboard/business/creators' : '/dashboard/brand/creators')}
                >
                  Invite a Creator
                </Button>
              </div>
            </Coachmark>
            <DragonShareExplainer role="brand" />
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <DragonSharePostCard
                key={post.id}
                post={post}
                canBoost={canBoost}
                onSkip={handleSkip}
              />
            ))}
          </div>
        )}
      </div>
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
