import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, CalendarDays, BarChart3, Share2, MessageCircle, TrendingUp, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DragonCandyOutstandProvider, useOutstandConfig } from '@/integrations/outstand/Provider';
import { useAccounts, usePosts, type Post } from '@outstand-so/ui';
import { ComposeTab } from '@/components/outstand/ComposeTab';
import { PublishedTab } from '@/components/outstand/PublishedTab';
import { AccountsTab } from '@/components/outstand/AccountsTab';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { useSanitizeFileInputs } from '@/hooks/outstand/useSanitizeFileInputs';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/user';

const VALID_TABS = ['compose', 'calendar', 'published', 'engagement', 'analytics', 'accounts'] as const;
type TabValue = (typeof VALID_TABS)[number];

// A post is "scheduled" if it has a scheduledAt and no account has finished
// publishing yet. Once any account reports status='published' or the
// post-level publishedAt is stamped, it moves to the published feed.
export function isScheduled(p: Post): boolean {
  if (!p.scheduledAt) return false;
  if (p.publishedAt) return false;
  const sas = p.socialAccounts ?? [];
  return !sas.some((sa) => sa.status === 'published');
}

// "Published-feed" is anything not currently scheduled — includes successful,
// in-flight (pending), and failed posts so the user can see outcomes.
export function isInPublishedFeed(p: Post): boolean {
  if (isScheduled(p)) return false;
  const sas = p.socialAccounts ?? [];
  return sas.length > 0 || !!p.publishedAt;
}

// Convenience flags used by the Published feed for badges + analytics gating.
export function postOutcome(p: Post): 'published' | 'pending' | 'failed' | 'mixed' {
  if (p.publishedAt) return 'published';
  const sas = p.socialAccounts ?? [];
  const allPublished = sas.length > 0 && sas.every((sa) => sa.status === 'published');
  if (allPublished) return 'published';
  const allFailed = sas.length > 0 && sas.every((sa) => sa.status === 'failed');
  if (allFailed) return 'failed';
  if (sas.some((sa) => sa.status === 'failed') && sas.some((sa) => sa.status === 'published')) {
    return 'mixed';
  }
  return 'pending';
}

// Match the SDK's internal default (`useAccounts({limit: 100})` inside
// CreatePostForm; `usePosts({limit: 50})` inside its internal createPost
// mutate). Same limit = same SWR cache key = mutate-from-create refreshes
// our hoisted list automatically.
const POSTS_PAGE_LIMIT = 50;
const ACCOUNTS_PAGE_LIMIT = 100;

const OutstandManagerInner: React.FC = () => {
  useSanitizeFileInputs();
  const { apiKey, baseUrl } = useOutstandConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as TabValue)
    : 'compose';

  const setActiveTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const { accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useAccounts({
    apiKey, baseUrl, limit: ACCOUNTS_PAGE_LIMIT,
  });
  const { posts, isLoading: postsLoading, refetch: refetchPosts } = usePosts({
    apiKey, baseUrl, limit: POSTS_PAGE_LIMIT,
  });

  const connectedCount = accounts?.length ?? 0;
  const scheduledCount = useMemo(
    () => (posts ?? []).filter((p) => isScheduled(p)).length,
    [posts],
  );

  const refreshAll = () => {
    refetchPosts();
    refetchAccounts();
  };

  return (
    <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
      <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal inline-flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Social Media Manager
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Compose, schedule, and engage across Facebook, Instagram, TikTok, X, and YouTube.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={postsLoading || accountsLoading}
            className="rounded-full border border-dc-teal text-dc-teal text-xs font-semibold px-3 py-1.5 inline-flex items-center gap-1 hover:bg-dc-teal/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${postsLoading || accountsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
            <p className="text-3xl font-extrabold text-gray-900">{connectedCount}</p>
            <p className="text-xs text-gray-500">Connected Accounts</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
            <p className="text-3xl font-extrabold text-gray-900">{scheduledCount}</p>
            <p className="text-xs text-gray-500">Scheduled Posts</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="compose" className="flex items-center gap-1 text-xs">
              <Send className="h-3 w-3" />
              <span className="hidden sm:inline">Compose</span>
              <span className="sm:hidden">New</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-1 text-xs">
              <CalendarDays className="h-3 w-3" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="published" className="flex items-center gap-1 text-xs">
              <BarChart3 className="h-3 w-3" />
              <span className="hidden sm:inline">Published</span>
              <span className="sm:hidden">Posts</span>
            </TabsTrigger>
            <TabsTrigger value="engagement" className="flex items-center gap-1 text-xs">
              <MessageCircle className="h-3 w-3" />
              <span className="hidden sm:inline">Engagement</span>
              <span className="sm:hidden">Engage</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1 text-xs">
              <TrendingUp className="h-3 w-3" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="accounts" className="flex items-center gap-1 text-xs">
              <LinkIcon className="h-3 w-3" />
              Accounts
              {connectedCount > 0 && (
                <span className="ml-1 bg-dc-teal text-white text-xs px-1.5 py-0.5 rounded-full">
                  {connectedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose">
            <ComposeTab
              accounts={accounts ?? []}
              accountsLoading={accountsLoading}
              onPosted={(wasScheduled) => {
                refetchPosts();
                setActiveTab(wasScheduled ? 'calendar' : 'published');
              }}
            />
          </TabsContent>
          <TabsContent value="calendar">
            <CalendarTabStub posts={posts ?? []} isLoading={postsLoading} />
          </TabsContent>
          <TabsContent value="published">
            <PublishedTab posts={posts ?? []} isLoading={postsLoading} onChanged={refetchPosts} />
          </TabsContent>
          <TabsContent value="engagement">
            <EngagementTabStub />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTabStub />
          </TabsContent>
          <TabsContent value="accounts">
            <AccountsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const CalendarTabStub: React.FC<{ posts: Post[]; isLoading: boolean }> = ({ isLoading }) =>
  isLoading ? <DCSkeleton variant="card" count={3} /> : <div className="p-8 text-center text-gray-400">Calendar — coming soon</div>;

const EngagementTabStub: React.FC = () =>
  <div className="p-8 text-center text-gray-400">Engagement — coming soon</div>;

const AnalyticsTabStub: React.FC = () =>
  <div className="p-8 text-center text-gray-400">Analytics — coming soon</div>;

const OutstandManager: React.FC = () => {
  const { profile } = useAuth();
  const role: UserRole = profile?.role ?? 'business_client';
  return (
    <DashboardLayout userRole={role}>
      <DragonCandyOutstandProvider>
        <OutstandManagerInner />
      </DragonCandyOutstandProvider>
    </DashboardLayout>
  );
};

export default OutstandManager;
