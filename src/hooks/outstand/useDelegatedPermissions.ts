import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface DelegatedPermission {
  id: string;
  grantor_id: string;
  grantee_id: string;
  campaign_id: string;
  platforms: string[];
  status: 'active' | 'revoked';
  expires_at: string | null;
  created_at: string;
}

export function useDelegatedPermissions(campaignId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['delegated-permissions', user?.id, campaignId],
    queryFn: async (): Promise<DelegatedPermission[]> => {
      let q = supabase
        .from('delegated_posting_permissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (campaignId) q = q.eq('campaign_id', campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DelegatedPermission[];
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!user?.id) return;
    const filter = campaignId ? `campaign_id=eq.${campaignId}` : undefined;
    const channel = supabase
      .channel(`delegated-perms-${user.id}-${campaignId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delegated_posting_permissions', filter },
        () => qc.invalidateQueries({ queryKey: ['delegated-permissions'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, campaignId, qc]);

  const grantPermission = useMutation({
    mutationFn: async ({ granteeId, platforms, campaignId: cId, expiresAt }: {
      granteeId: string;
      platforms: string[];
      campaignId: string;
      expiresAt?: string;
    }) => {
      const { error } = await supabase.from('delegated_posting_permissions').insert({
        grantor_id: user!.id,
        grantee_id: granteeId,
        campaign_id: cId,
        platforms,
        status: 'active',
        expires_at: expiresAt ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delegated-permissions'] });
      toast.success('Posting permission granted');
    },
    onError: (err: Error) => toast.error(`Failed to grant permission: ${err.message}`),
  });

  const revokePermission = useMutation({
    mutationFn: async (permissionId: string) => {
      const { error } = await supabase
        .from('delegated_posting_permissions')
        .update({ status: 'revoked' })
        .eq('id', permissionId)
        .eq('grantor_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delegated-permissions'] });
      toast.success('Permission revoked');
    },
    onError: (err: Error) => toast.error(`Failed to revoke: ${err.message}`),
  });

  const myGranted = (query.data ?? []).filter((p) => p.grantor_id === user?.id);
  const myReceived = (query.data ?? []).filter((p) => p.grantee_id === user?.id);

  return {
    permissions: query.data ?? [],
    myGranted,
    myReceived,
    isLoading: query.isLoading,
    grantPermission: grantPermission.mutate,
    revokePermission: revokePermission.mutate,
  };
}
