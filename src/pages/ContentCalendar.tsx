import React, { useMemo, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Post } from '@outstand-so/ui';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DragonCandyOutstandProvider, useOutstandConfig } from '@/integrations/outstand/Provider';
import { useAccounts, usePosts } from '@outstand-so/ui';
import { CalendarTab } from '@/components/outstand/CalendarTab';
import { PostManagementPanel } from '@/components/outstand/PostManagementPanel';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/user';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignDeadline } from '@/components/outstand/CalendarTab';

const POSTS_PAGE_LIMIT = 50;
const ACCOUNTS_PAGE_LIMIT = 100;

const ContentCalendarInner: React.FC = () => {
  const { profile } = useAuth();
  const role = (profile?.role ?? 'content_creator') as UserRole;
  const { apiKey, baseUrl } = useOutstandConfig();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dateParam = searchParams.get('date');
  const roleSeg = role === 'business_client' ? 'business' : role === 'brand' ? 'brand' : 'creator';

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const initialDate = useMemo(() => {
    if (!dateParam) return undefined;
    const d = new Date(dateParam);
    return isNaN(d.getTime()) ? undefined : d;
  }, [dateParam]);

  const { accounts: _accounts, isLoading: loadingAccounts } = useAccounts({ apiKey, baseUrl, limit: ACCOUNTS_PAGE_LIMIT });
  const { posts, isLoading: loadingPosts, refetch } = usePosts({ apiKey, baseUrl, limit: POSTS_PAGE_LIMIT });

  const { data: deadlines } = useQuery({
    queryKey: ['calendar-deadlines'],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaign_collaborations')
        .select('id, campaign_id, campaigns!inner(id, title, deadline)')
        .eq('status', 'active');
      if (!data) return [];
      const results: CampaignDeadline[] = [];
      for (const row of data) {
        const campaign = (row as unknown as { campaigns: { id: string; title: string; deadline: string | null } }).campaigns;
        if (campaign?.deadline) {
          results.push({
            id: row.id,
            title: campaign.title ?? 'Campaign',
            deadline: new Date(campaign.deadline),
            campaignId: campaign.id,
          });
        }
      }
      return results;
    },
  });

  const isLoading = loadingAccounts || loadingPosts;

  const handlePostClick = useCallback((post: Post) => {
    setSelectedPost(post);
    setPanelOpen(true);
  }, []);

  return (
    <DashboardLayout userRole={role}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Content Calendar</h1>
          <p className="text-sm text-dc-text-muted mt-1">Manage your scheduled posts and content deadlines</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow p-4 lg:p-6">
          <CalendarTab
            posts={posts}
            isLoading={isLoading}
            onChanged={() => refetch()}
            campaignDeadlines={deadlines ?? []}
            initialDate={initialDate}
            onPostClick={handlePostClick}
            onSchedule={() => navigate(`/dashboard/${roleSeg}/social?tab=compose`)}
          />
        </div>
      </div>

      <PostManagementPanel
        post={selectedPost}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onChanged={() => refetch()}
      />
    </DashboardLayout>
  );
};

const ContentCalendar: React.FC = () => {
  return (
    <DragonCandyOutstandProvider>
      <ContentCalendarInner />
    </DragonCandyOutstandProvider>
  );
};

export default ContentCalendar;
