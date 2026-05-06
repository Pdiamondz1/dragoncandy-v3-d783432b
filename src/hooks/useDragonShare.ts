import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  DragonSharePost,
  DragonSharePostWithRelations,
} from '@/types/dragonshare';

const KEYS = {
  creatorPosts: (userId?: string) => ['dragonshare-posts', 'creator', userId],
  orgPosts: (orgId?: string) => ['dragonshare-posts', 'org', orgId],
  post: (postId?: string) => ['dragonshare-post', postId],
  creatorPayouts: (userId?: string) => ['dragonshare-payouts', userId],
  adminQueue: () => ['dragonshare-admin-queue'],
  creatorMonthlyCount: (userId?: string) => ['dragonshare-monthly-count', userId],
  orgBoostStats: (orgId?: string) => ['dragonshare-boost-stats', orgId],
  creatorEarningsStats: (userId?: string) => ['dragonshare-earnings-stats', userId],
};

export function useCreatorDragonSharePosts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: KEYS.creatorPosts(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .select('*, boosts:dragonshare_boosts(*), target_org:organizations(id, name, logo_url)')
        .eq('creator_id', user!.id)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data as DragonSharePostWithRelations[];
    },
    enabled: !!user,
  });
}

export function useOrgDragonSharePosts(orgId?: string | null) {
  return useQuery({
    queryKey: KEYS.orgPosts(orgId ?? undefined),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .select(`
          *,
          creator:profiles!dragonshare_posts_creator_id_fkey(id, full_name, avatar_url),
          boosts:dragonshare_boosts(*)
        `)
        .eq('target_org_id', orgId!)
        .eq('status', 'verified')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data as DragonSharePostWithRelations[];
    },
    enabled: !!orgId,
  });
}

export function useCreatorMonthlySubmissionCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: KEYS.creatorMonthlyCount(user?.id),
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from('dragonshare_posts')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user!.id)
        .gte('submitted_at', startOfMonth.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });
}

export function useSubmitDragonSharePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (post: {
      platform: string;
      content_type: string;
      post_url: string;
      caption?: string;
      target_org_id: string;
      target_org_unit_id?: string;
      hashtags?: string[];
      mentions?: string[];
    }) => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .insert({ ...post, creator_id: user!.id })
        .select('id, creator_id, platform, content_type, post_url, caption, target_org_id, target_org_unit_id, hashtags, mentions, status, submitted_at')
        .single();
      if (error) throw error;
      return data as DragonSharePost;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.creatorPosts(user?.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.creatorMonthlyCount(user?.id) });
      supabase.functions.invoke('donny-dragonshare-score', {
        body: { post_id: data.id },
      }).catch(() => {});
    },
  });
}

export function useAdminDragonShareQueue() {
  return useQuery({
    queryKey: KEYS.adminQueue(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .select(`
          *,
          creator:profiles!dragonshare_posts_creator_id_fkey(id, full_name, avatar_url, email),
          target_org:organizations(id, name, logo_url)
        `)
        .eq('status', 'pending_verification')
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      return data as DragonSharePostWithRelations[];
    },
  });
}

export function useVerifyDragonSharePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      action,
      rejectionReason,
    }: {
      postId: string;
      action: 'approve' | 'reject';
      rejectionReason?: string;
    }) => {
      if (action === 'approve') {
        const { error } = await supabase
          .from('dragonshare_posts')
          .update({
            status: 'verified',
            boost_status: 'available',
            verification_method: 'manual',
            verified_at: new Date().toISOString(),
            verified_by: user!.id,
          })
          .eq('id', postId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('dragonshare_posts')
          .update({
            status: 'rejected',
            rejection_reason: rejectionReason ?? 'Does not meet verification criteria',
          })
          .eq('id', postId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.adminQueue() });
    },
  });
}

export function useOrgBoostStats(orgId?: string | null) {
  return useQuery({
    queryKey: KEYS.orgBoostStats(orgId ?? undefined),
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('dragonshare_boosts')
        .select('amount_cents')
        .eq('boosting_org_id', orgId!)
        .eq('status', 'transferred')
        .gte('boosted_at', startOfMonth.toISOString());
      if (error) throw error;
      const totalCents = (data ?? []).reduce((sum, b) => sum + b.amount_cents, 0);
      return { totalCents, count: data?.length ?? 0 };
    },
    enabled: !!orgId,
  });
}

export function useCreatorDragonShareEarnings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: KEYS.creatorEarningsStats(user?.id),
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('dragonshare_payouts')
        .select('amount_cents')
        .eq('creator_id', user!.id)
        .eq('status', 'succeeded')
        .gte('processed_at', startOfMonth.toISOString());
      if (error) throw error;
      const totalCents = (data ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
      return { totalCents, count: data?.length ?? 0 };
    },
    enabled: !!user,
  });
}
