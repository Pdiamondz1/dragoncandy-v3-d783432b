import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type {
  DragonSharePostWithRelations,
} from '@/types/dragonshare';

const KEYS = {
  creatorPosts: (userId?: string) => ['dragonshare-posts', 'creator', userId],
  orgPosts: (orgId?: string) => ['dragonshare-posts', 'org', orgId],
  post: (postId?: string) => ['dragonshare-post', postId],
  creatorPayouts: (userId?: string) => ['dragonshare-payouts', userId],
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
        .select('*, boosts:dragonshare_boosts(*)')
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
        .is('flagged_at', null)
        .is('declined_at', null)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data as DragonSharePostWithRelations[];
    },
    enabled: !!orgId,
  });
}


export function useSubmitDragonSharePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (post: {
      target_org_id: string;
      content_type: string;
      post_url?: string | null;
      platform?: string | null;
      content_file_path?: string | null;
      caption?: string;
      source_brief_id?: string | null;
      target_org_unit_id?: string;
      hashtags?: string[];
      mentions?: string[];
    }) => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .insert({
          creator_id: user!.id,
          target_org_id: post.target_org_id,
          content_type: post.content_type,
          post_url: post.post_url ?? null,
          platform: post.platform ?? null,
          content_file_path: post.content_file_path ?? null,
          source_brief_id: post.source_brief_id ?? null,
          caption: post.caption ?? null,
          status: 'verified',
          boost_status: 'available',
        })
        .select('id, creator_id, platform, content_type, post_url, content_file_path, caption, target_org_id, status, boost_status, submitted_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.creatorPosts(user?.id) });
      if (data?.id) {
        supabase.functions.invoke('dragonshare-notify', {
          body: { event: 'submission', post_id: data.id },
        }).catch((e) => console.warn('dragonshare-notify (submission) failed:', e));
      }
    },
    onError: () => { toast.error('Failed to submit DragonShare post'); },
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
