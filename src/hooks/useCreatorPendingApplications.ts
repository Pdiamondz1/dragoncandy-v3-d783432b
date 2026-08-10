import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorPendingApplication {
  applicationId: string;
  campaignId: string;
  campaignTitle: string;
  createdAt: string;
}

/** The creator's own applications still awaiting a business decision. */
export function useCreatorPendingApplications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-pending-applications', user?.id],
    queryFn: async (): Promise<CreatorPendingApplication[]> => {
      const { data, error } = await supabase
        .from('campaign_applications')
        .select('id, campaign_id, created_at, campaigns(title)')
        .eq('creator_id', user!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row) => {
        const campaign = row.campaigns as unknown as { title: string } | null;
        return {
          applicationId: row.id,
          campaignId: row.campaign_id,
          campaignTitle: campaign?.title ?? 'Untitled Campaign',
          createdAt: row.created_at,
        };
      });
    },
    enabled: !!user,
  });
}
