/* eslint-disable react-refresh/only-export-components */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, CalendarDays, BarChart3, MessageCircle, TrendingUp, Link as LinkIcon, RefreshCw, Handshake, FileText } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DragonCandyOutstandProvider, useOutstandConfig } from '@/integrations/outstand/Provider';
import { useAccounts, usePosts } from '@outstand-so/ui';
import { ComposeTab } from '@/components/outstand/ComposeTab';
import { CalendarTab } from '@/components/outstand/CalendarTab';
import { PublishedTab } from '@/components/outstand/PublishedTab';
import { EngagementTab } from '@/components/outstand/EngagementTab';
import { AccountsTab } from '@/components/outstand/AccountsTab';
import { AnalyticsTab } from '@/components/outstand/AnalyticsTab';
import { DraftsTab } from '@/components/outstand/DraftsTab';
import { useDraftPosts } from '@/hooks/useDraftPosts';
import { CrossPartyAnalytics } from '@/components/outstand/CrossPartyAnalytics';
import { toast } from 'sonner';
import { useSanitizeFileInputs } from '@/hooks/outstand/useSanitizeFileInputs';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/user';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignDeadline } from '@/components/outstand/CalendarTab';
import { type SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';

const VALID_TABS = ['compose', 'drafts', 'calendar', 'published', 'engagement', 'analytics', 'sponsorships', 'accounts'] as const;
type TabValue = (typeof VALID_TABS)[number];

import { isScheduled } from '@/lib/outstandUtils';
export { isScheduled, isInPublishedFeed, postOutcome } from '@/lib/outstandUtils';

// Match the SDK's internal default (`useAccounts({limit: 100})` inside
// CreatePostForm; `usePosts({limit: 50})` inside its internal createPost
// mutate). Same limit = same SWR cache key = mutate-from-create refreshes
// our hoisted list automatically.
const POSTS_PAGE_LIMIT = 50;
const ACCOUNTS_PAGE_LIMIT = 100;

const OutstandManagerInner: React.FC = () => {
  useSanitizeFileInputs();
  const { draftCount } = useDraftPosts();
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

  const { user, profile } = useAuth();
  const isBrand = profile?.role === 'brand';

  const { accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useAccounts({
    apiKey, baseUrl, limit: ACCOUNTS_PAGE_LIMIT,
  });
  const { posts, isLoading: postsLoading, refetch: refetchPosts } = usePosts({
    apiKey, baseUrl, limit: POSTS_PAGE_LIMIT,
  });

  const { data: campaignDeadlines } = useQuery<CampaignDeadline[]>({
    queryKey: ['creator-campaign-deadlines', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('campaign_applications')
        .select('id, campaign_id, campaigns!campaign_id(title, deadline)')
        .eq('creator_id', user.id)
        .eq('status', 'accepted');
      if (error || !data) return [];

      type Row = typeof data[number];
      return data
        .filter((row: Row) => {
          const c = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
          return c?.deadline;
        })
        .map((row: Row) => {
          const c = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
          const [y, m, d] = c!.deadline!.split('-').map(Number);
          return {
            id: row.id,
            title: c!.title,
            deadline: new Date(y, m - 1, d),
            campaignId: row.campaign_id,
          } satisfies CampaignDeadline;
        });
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sponsorshipEvents } = useQuery<SponsorshipEvent[]>({
    queryKey: ['brand-sponsorship-events', user?.id],
    queryFn: async () => {
      // Two-step lookup: brand_id FK references business_profiles.id, not auth.users.id
      const { data: brandProfile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .eq('account_type', 'brand')
        .single();
      if (!brandProfile) return [];

      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select('id, created_at, campaigns!campaign_id(title, deadline)')
        .eq('brand_id', brandProfile.id);
      if (error || !data) return [];

      const events: SponsorshipEvent[] = [];
      for (const s of data) {
        const campaign = s.campaigns as unknown as { title: string; deadline?: string } | null;
        if (campaign?.title) {
          events.push({ id: `${s.id}-start`, date: new Date(s.created_at), title: campaign.title, type: 'start' });
          if (campaign.deadline) {
            events.push({ id: `${s.id}-deadline`, date: new Date(campaign.deadline), title: campaign.title, type: 'deadline' });
            const ampDate = new Date(campaign.deadline);
            ampDate.setDate(ampDate.getDate() + 1);
            events.push({ id: `${s.id}-amplify`, date: ampDate, title: campaign.title, type: 'amplification' });
          }
        }
      }
      return events;
    },
    enabled: !!user?.id && isBrand,
    staleTime: 5 * 60 * 1000,
  });

  const connectedCount = accounts?.length ?? 0;
  const ownAccountIds = useMemo(
    () => (accounts ?? []).map((a) => a.id),
    [accounts],
  );
  const scheduledCount = useMemo(
    () => (posts ?? []).filter((p) => isScheduled(p)).length,
    [posts],
  );

  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchPosts(), refetchAccounts()]);
      toast.success('Social accounts refreshed');
    } catch {
      toast.error('Refresh failed — please try again');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
      <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="font-sans text-sm font-bold uppercase tracking-wide text-gray-900">
              Social Media Manager
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Compose, schedule, and engage across Facebook, Instagram, TikTok, X, and YouTube.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={isRefreshing}
            className="rounded-full border border-dc-teal text-dc-teal text-xs font-semibold px-3 py-1.5 inline-flex items-center gap-1 hover:bg-dc-teal/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
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
          <TabsList className={`grid w-full ${isBrand ? 'grid-cols-8 overflow-x-auto' : 'grid-cols-7'} overflow-x-auto`}>
            <TabsTrigger value="compose" className="flex items-center gap-1 text-xs">
              <Send className="h-3 w-3" />
              <span className="hidden sm:inline">Compose</span>
              <span className="sm:hidden">New</span>
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex items-center gap-1 text-xs">
              <FileText className="h-3 w-3" />
              <span className="hidden sm:inline">Drafts</span>
              <span className="sm:hidden">Drafts</span>
              {draftCount > 0 && (
                <span className="ml-1 bg-dc-pink-accent text-white text-xs px-1.5 py-0.5 rounded-full">
                  {draftCount}
                </span>
              )}
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
            {isBrand && (
              <TabsTrigger value="sponsorships" className="flex items-center gap-1 text-xs">
                <Handshake className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sponsorships</span>
                <span className="sm:hidden">Deals</span>
              </TabsTrigger>
            )}
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
          <TabsContent value="drafts">
            <DraftsTab onSwitchTab={setActiveTab} />
          </TabsContent>
          <TabsContent value="calendar">
            <CalendarTab
              posts={posts ?? []}
              isLoading={postsLoading}
              onChanged={refetchPosts}
              onSwitchTab={setActiveTab}
              campaignDeadlines={campaignDeadlines ?? []}
              sponsorshipEvents={sponsorshipEvents ?? []}
            />
          </TabsContent>
          <TabsContent value="published">
            <PublishedTab posts={posts ?? []} isLoading={postsLoading} onChanged={refetchPosts} />
          </TabsContent>
          <TabsContent value="engagement">
            <EngagementTab posts={posts ?? []} ownAccountIds={ownAccountIds} />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab accounts={accounts ?? []} posts={posts ?? []} accountsLoading={accountsLoading} />
          </TabsContent>
          {isBrand && (
            <TabsContent value="sponsorships">
              <CrossPartyAnalytics />
            </TabsContent>
          )}
          <TabsContent value="accounts">
            <AccountsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

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
