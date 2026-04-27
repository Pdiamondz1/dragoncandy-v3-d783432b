import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useCreatorDragonSharePosts, useCreatorMonthlySubmissionCount } from '@/hooks/useDragonShare';
import { DragonShareSubmitSheet } from '@/components/dragonshare/DragonShareSubmitSheet';
import { DragonShareExplainer } from '@/components/dragonshare/DragonShareExplainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ExternalLink, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { DragonSharePostWithRelations, PostStatus } from '@/types/dragonshare';
import { Coachmark } from '@/components/guidance/Coachmark';

type Tab = 'submitted' | 'boosted' | 'expired';

const CreatorDragonShare: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('submitted');
  const [submitOpen, setSubmitOpen] = useState(false);
  const { data: posts, isLoading } = useCreatorDragonSharePosts();
  const { data: monthlyCount } = useCreatorMonthlySubmissionCount();

  const FREE_LIMIT = 5;
  const canSubmit = (monthlyCount ?? 0) < FREE_LIMIT;

  const filteredPosts = (posts ?? []).filter((p) => {
    if (activeTab === 'submitted') return p.status === 'pending_verification' || p.status === 'verified';
    if (activeTab === 'boosted') return p.boost_status === 'boosted';
    return p.status === 'expired' || p.boost_status === 'expired';
  });

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'submitted', label: 'Submitted', count: (posts ?? []).filter((p) => p.status === 'pending_verification' || p.status === 'verified').length },
    { key: 'boosted', label: 'Boosted', count: (posts ?? []).filter((p) => p.boost_status === 'boosted').length },
    { key: 'expired', label: 'Expired', count: (posts ?? []).filter((p) => p.status === 'expired' || p.boost_status === 'expired').length },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">DragonShare</h1>
            <p className="text-sm text-muted-foreground">
              Submit your organic posts and earn when brands boost them
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {monthlyCount ?? 0}/{FREE_LIMIT} this month
            </span>
            <Coachmark coachmarkKey="dragonshare_submit" title="Paste a link, tag a brand, get paid" body="Submit posts you've already made about brands you love.">
              <Button onClick={() => setSubmitOpen(true)} disabled={!canSubmit}>
                <Sparkles className="mr-2 h-4 w-4" />
                Submit Post
              </Button>
            </Coachmark>
          </div>
        </div>

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
              {tab.count > 0 && (
                <Badge variant="secondary" className="ml-2">{tab.count}</Badge>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <DragonShareExplainer role="creator" />
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <DragonShareExplainer role="creator" collapsed />
            </div>
            {filteredPosts.map((post) => (
              <CreatorPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>

      <DragonShareSubmitSheet open={submitOpen} onOpenChange={setSubmitOpen} />
    </DashboardLayout>
  );
};

function CreatorPostCard({ post }: { post: DragonSharePostWithRelations }) {
  const statusConfig: Record<PostStatus, { label: string; className: string; icon: React.ElementType }> = {
    pending_verification: { label: 'Awaiting verification', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
    verified: { label: 'Verified', className: 'bg-green-100 text-green-800', icon: CheckCircle },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800', icon: XCircle },
    expired: { label: 'Expired', className: 'bg-gray-100 text-gray-800', icon: Clock },
  };

  const config = statusConfig[post.status];
  const StatusIcon = config.icon;
  const boost = post.boosts?.[0];

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{post.platform}</span>
          <span className="text-xs text-muted-foreground capitalize">{post.content_type}</span>
        </div>
        <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${config.className}`}>
          <StatusIcon className="h-3 w-3" />
          {config.label}
        </div>
      </div>

      {post.caption && (
        <p className="text-sm text-muted-foreground line-clamp-2">{post.caption}</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {post.target_org?.logo_url && (
            <img src={post.target_org.logo_url} alt="Brand logo" className="h-5 w-5 rounded-full" />
          )}
          <span className="text-muted-foreground">{post.target_org?.name ?? 'Unknown org'}</span>
        </div>
        <div className="flex items-center gap-3">
          {boost && boost.status === 'transferred' && (
            <span className="font-semibold text-teal-600">
              +${(boost.creator_payout_cents / 100).toFixed(0)}
            </span>
          )}
          <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {post.status === 'rejected' && post.rejection_reason && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{post.rejection_reason}</p>
      )}

      {post.donny_recommended_tier && post.status !== 'rejected' && (
        <div className="flex items-center gap-2 text-xs text-teal-600">
          <Sparkles className="h-3 w-3" />
          Donny recommends ${post.donny_recommended_tier} boost
          {post.donny_reach_estimate && ` · Est. reach: ${post.donny_reach_estimate.toLocaleString()}`}
        </div>
      )}
    </div>
  );
}

export default CreatorDragonShare;
