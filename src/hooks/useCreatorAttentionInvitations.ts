import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorInvitation {
  invitationId: string;
  campaignId: string;
  campaignTitle: string;
  businessName: string;
  createdAt: string;
}

/**
 * Pending campaign invitations the creator has not yet applied to.
 *
 * Deliberately does NOT filter on `expires_at` — all 17 pending invitations on
 * prod are expired by that column, yet every one points at a campaign that is
 * still `published`, and applying still works (a published campaign is
 * public). `useCreateApplication` ignores expiry too. Gating this nudge on a
 * column that does not gate the underlying action would hide live
 * opportunities from creators.
 */
export function useCreatorAttentionInvitations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-attention-invitations', user?.id],
    queryFn: async (): Promise<CreatorInvitation[]> => {
      const { data, error } = await supabase
        .from('campaign_invitations')
        .select('id, campaign_id, created_at, campaigns!inner(id, title, status, user_id)')
        .eq('creator_id', user!.id)
        .eq('status', 'pending')
        .eq('campaigns.status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Scoped to the invited campaigns, not the creator's whole application
      // history: this only ever answers "has one of THESE been applied to". The
      // `.in()` list is bounded by the invitation count above — single digits on
      // prod, far under the ~100-id threshold where a filter starts overflowing
      // undici's 16 KB header limit.
      const invitedCampaignIds = [...new Set(data.map((inv) => inv.campaign_id))];

      const { data: applied, error: appliedError } = await supabase
        .from('campaign_applications')
        .select('campaign_id')
        .eq('creator_id', user!.id)
        .in('campaign_id', invitedCampaignIds);

      if (appliedError) throw appliedError;

      const appliedIds = new Set((applied ?? []).map((a) => a.campaign_id));

      const pending = data.filter((inv) => {
        const campaign = inv.campaigns as unknown as { id: string; title: string; status: string; user_id: string };
        return campaign && !appliedIds.has(campaign.id);
      });

      if (pending.length === 0) return [];

      const ownerIds = [...new Set(
        pending.map((inv) => (inv.campaigns as unknown as { user_id: string }).user_id)
      )];

      const [bpResult, profileResult] = await Promise.all([
        supabase.from('business_profiles').select('user_id, business_name').in('user_id', ownerIds),
        supabase.from('profiles').select('id, full_name').in('id', ownerIds),
      ]);

      // Deliberately NOT thrown on — unlike the two reads above, whose failure
      // means we do not know whether an invitation exists. These only decorate
      // a row we have already earned the right to show, and throwing would
      // delete the whole invitation category (and, via the errored-source
      // guard, suppress the find-work nudge too) because a display name could
      // not be resolved. Falls through to 'A business'. Matches the sibling
      // useCreatorPendingInvitations, which tolerates the same failure.
      const businessMap = new Map((bpResult.data ?? []).map((b) => [b.user_id, b.business_name]));
      const profileMap = new Map((profileResult.data ?? []).map((p) => [p.id, p.full_name]));

      return pending.map((inv) => {
        const campaign = inv.campaigns as unknown as { id: string; title: string; user_id: string };
        return {
          invitationId: inv.id,
          campaignId: inv.campaign_id,
          campaignTitle: campaign?.title ?? 'Untitled Campaign',
          businessName: businessMap.get(campaign.user_id) ?? profileMap.get(campaign.user_id) ?? 'A business',
          createdAt: inv.created_at,
        };
      });
    },
    enabled: !!user,
  });
}
