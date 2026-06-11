import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { safeUrl } from '@/lib/safeUrl';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useCreatorDragonSharePosts } from '@/hooks/useDragonShare';
import { useResolveDragonShareOrgs } from '@/hooks/useResolveDragonShareOrgs';
import { mergeResolvedOrgs } from '@/lib/dragonshareOrgs';
import { DragonShareSubmitSheet } from '@/components/dragonshare/DragonShareSubmitSheet';
import { DragonShareInlineForm } from '@/components/dragonshare/DragonShareInlineForm';
import { DragonShareHowItWorks } from '@/components/dragonshare/DragonShareHowItWorks';
import { DragonShareQuickTip } from '@/components/dragonshare/DragonShareQuickTip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Clock, CheckCircle } from 'lucide-react';
import { isVideoPost } from '@/types/dragonshare';
import type { DragonSharePostWithRelations } from '@/types/dragonshare';
import { deriveCreatorPostState } from '@/lib/dragonsharePostState';
import { WatermarkedMedia } from '@/components/dragonshare/WatermarkedMedia';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreButton } from '@/components/shared/LoadMoreButton';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

type Tab = 'submitted' | 'boosted' | 'expired';

type ActivePostStatus = 'verified' | 'rejected' | 'expired';

const statusConfig: Record<ActivePostStatus, { label: string; className: string; icon: React.ElementType }> = {
  verified: { label: 'Verified', className: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800', icon: Clock },
  expired: { label: 'Expired', className: 'bg-dc-teal/10 text-dc-teal', icon: Clock },
};

function usePreselectedOrg() {
  const [searchParams, setSearchParams] = useSearchParams();
  const restaurantId = searchParams.get('restaurant');
  // Capture once so it survives the param cleanup below.
  const [briefId] = useState(() => searchParams.get('brief'));

  const { data: org } = useQuery({
    queryKey: ['preselected-org', restaurantId],
    queryFn: async (): Promise<RestaurantSearchResult | null> => {
      if (!restaurantId) return null;
      const { data, error } = await supabase.rpc('get_restaurant_by_org_id', {
        target_org_id: restaurantId,
      });
      if (error || !data || data.length === 0) return null;
      return data[0] as RestaurantSearchResult;
    },
    enabled: !!restaurantId,
  });

  // Validate the brief is the creator's own (RLS) AND targets the same org.
  const { data: briefOrgId } = useQuery({
    queryKey: ['preselected-brief', briefId],
    queryFn: async (): Promise<string | null> => {
      if (!briefId) return null;
      const { data, error } = await supabase
        .from('content_briefs')
        .select('organization_id')
        .eq('id', briefId)
        .maybeSingle();
      if (error || !data) return null;
      return data.organization_id as string;
    },
    enabled: !!briefId,
  });

  const sourceBriefId = briefId && org && briefOrgId === org.id ? briefId : null;

  useEffect(() => {
    if (restaurantId && org) {
      const next = new URLSearchParams(searchParams);
      next.delete('restaurant');
      next.delete('brief');
      setSearchParams(next, { replace: true });
    }
  }, [org, restaurantId, searchParams, setSearchParams]);

  return { org: org ?? null, sourceBriefId };
}

const CreatorDragonShare: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('submitted');
  const [submitOpen, setSubmitOpen] = useState(false);
  const { data: posts, isLoading } = useCreatorDragonSharePosts();
  const orgIds = (posts ?? []).map((p) => p.target_org_id);
  const { data: resolvedOrgs } = useResolveDragonShareOrgs(orgIds);
  const postsWithOrg = mergeResolvedOrgs(posts ?? [], resolvedOrgs ?? []);
  const { org: preselectedOrg, sourceBriefId } = usePreselectedOrg();

  useEffect(() => {
    if (preselectedOrg) {
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      if (!isDesktop) setSubmitOpen(true);
    }
  }, [preselectedOrg]);

  const filteredPosts = postsWithOrg.filter((p) => {
    if (activeTab === 'submitted') return p.status === 'verified';
    if (activeTab === 'boosted') return p.boost_status === 'boosted';
    return p.status === 'expired' || p.boost_status === 'expired';
  });
  const { visible, hasMore, showing, total, loadMore } = usePagedList(filteredPosts, 12);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'submitted', label: 'Submitted', count: postsWithOrg.filter((p) => p.status === 'verified').length },
    { key: 'boosted', label: 'Boosted', count: postsWithOrg.filter((p) => p.boost_status === 'boosted').length },
    { key: 'expired', label: 'Expired', count: postsWithOrg.filter((p) => p.status === 'expired' || p.boost_status === 'expired').length },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <PrerequisiteGate feature="use DragonShare">
        <div className="space-y-6 pt-4">
          {/* Page header */}
          <div className="rounded-2xl bg-gradient-to-br from-dc-teal/10 to-pink-50 border border-dc-teal/15 p-5">
            <h1 className="text-2xl font-bold tracking-tight">DragonShare</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Submit your organic posts and earn when restaurants boost them
            </p>
            {/* Mobile-only: show Share Content button */}
            <div className="flex items-center justify-end mt-3 lg:hidden">
              <Button
                onClick={() => setSubmitOpen(true)}
                className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold px-6"
              >
                + Share Content
              </Button>
            </div>
          </div>

          {/* Desktop: side-by-side / Mobile: single column */}
          <div className="flex flex-col lg:flex-row lg:gap-6 lg:items-start">
            {/* Left: Inline form (desktop only) */}
            <div className="hidden lg:block lg:w-[440px] lg:flex-shrink-0">
              <DragonShareInlineForm preselectedOrg={preselectedOrg} sourceBriefId={sourceBriefId} />
            </div>

            {/* Right: Post history */}
            <div className="flex-1 min-w-0 space-y-4">
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
                    {tab.count > 0 && (
                      <Badge variant="secondary" className="ml-2">{tab.count}</Badge>
                    )}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-dc-teal/10" />
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="space-y-4">
                  <DragonShareHowItWorks role="creator" />
                  <DragonShareQuickTip role="creator" />
                </div>
              ) : (
                <div className="space-y-4">
                  <DragonShareHowItWorks role="creator" />
                  <div className="grid gap-4 lg:grid-cols-2">
                    {visible.map((post) => (
                      <CreatorPostCard key={post.id} post={post} />
                    ))}
                  </div>
                  <LoadMoreButton
                    hasMore={hasMore}
                    showing={showing}
                    total={total}
                    onClick={loadMore}
                    noun="posts"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile-only: bottom sheet */}
        <div className="lg:hidden">
          <DragonShareSubmitSheet open={submitOpen} onOpenChange={setSubmitOpen} preselectedOrg={preselectedOrg} sourceBriefId={sourceBriefId} />
        </div>
      </PrerequisiteGate>
    </DashboardLayout>
  );
};

function CreatorPostCard({ post }: { post: DragonSharePostWithRelations }) {
  const resolvedLogoUrl = useResolvedLogoUrl(post.target_org?.logo_url);
  const contentUrl = post.content_file_path;
  const [logoError, setLogoError] = useState(false);

  const status = post.status as ActivePostStatus;
  const config = statusConfig[status] ?? statusConfig.verified;
  const StatusIcon = config.icon;
  const state = deriveCreatorPostState(post);

  const platformLabel = post.platform ?? 'direct upload';

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      {contentUrl && (
        <WatermarkedMedia src={contentUrl} isVideo={isVideoPost(post)} watermark={false} />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{platformLabel}</span>
          <span className="text-xs text-muted-foreground capitalize">{post.content_type}</span>
        </div>
        {state.kind === 'declined' ? (
          <div className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-dc-pink/10 text-dc-pink-accent">
            Not selected — share again
          </div>
        ) : (
          <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${config.className}`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </div>
        )}
      </div>

      {post.caption && (
        <p className="text-sm text-muted-foreground line-clamp-2">{post.caption}</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {resolvedLogoUrl && !logoError ? (
            <img src={resolvedLogoUrl} alt="Brand logo" className="h-5 w-5 rounded-full ring-2 ring-teal-400" onError={() => setLogoError(true)} />
          ) : (
            <div className="h-5 w-5 rounded-full bg-dc-teal/20 flex items-center justify-center text-[8px] font-bold text-dc-teal ring-2 ring-teal-400">
              {(post.target_org?.name ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-muted-foreground">{post.target_org?.name ?? 'Unknown org'}</span>
        </div>
        <div className="flex items-center gap-3">
          {state.kind === 'paid' && (
            <span className="font-semibold text-teal-600">+${(state.payoutCents / 100).toFixed(0)}</span>
          )}
          {post.post_url && (
            <a
              href={safeUrl(post.post_url) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreatorDragonShare;
