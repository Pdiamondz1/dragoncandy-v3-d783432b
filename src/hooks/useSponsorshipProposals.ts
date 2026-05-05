import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

export interface SponsorshipProposal {
  id: string;
  campaign_id: string;
  brand_id: string;
  restaurant_id: string;
  sponsorship_amount: number;
  proposal_message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  terms: any;
  created_at: string;
  updated_at: string;
  brand_completion_status?: string;
  business_completion_status?: string;
  completed_at?: string;
  review_status?: string;
  payment_status?: string;
  payment_date?: string;
  campaigns?: {
    id: string;
    title: string;
    description: string;
    deadline?: string;
    platforms?: string[];
  };
  brand_profile?: {
    business_name: string;
    logo_url: string;
    user_id: string;
  };
}

export const useSponsorshipProposals = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['sponsorship-proposals', user?.id],
    queryFn: async () => {
      // Get user's business profile first
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select(`
          *,
          campaigns (
            id,
            title,
            description,
            deadline,
            platforms
          ),
          brand_profile:business_profiles!brand_id (
            business_name,
            logo_url,
            user_id
          )
        `)
        .eq('restaurant_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SponsorshipProposal[];
    },
    enabled: !!user,
  });

  const updateProposalStatus = useMutation({
    mutationFn: async ({ 
      proposalId, 
      status 
    }: { 
      proposalId: string; 
      status: 'accepted' | 'rejected';
    }) => {
      const { error } = await supabase
        .from('campaign_sponsorships')
        .update({ status })
        .eq('id', proposalId);

      if (error) throw error;
    },
    onSuccess: async (_, { proposalId, status }) => {
      queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });
      
      // Get the proposal data to send notification
      const proposal = proposals?.find(p => p.id === proposalId);
      
      if (proposal?.brand_profile?.user_id && proposal?.campaigns) {
        await sendNotification(
          'sponsorship_status',
          undefined, // Let edge function resolve email
          undefined, // Let edge function resolve name
          {
            recipientUserId: proposal.brand_profile.user_id,
            campaignTitle: proposal.campaigns.title,
            proposalStatus: status,
          }
        );
        
      }
      
      toast({
        title: status === 'accepted' ? 'Proposal accepted' : 'Proposal rejected',
        description: status === 'accepted' 
          ? 'The brand has been notified of your acceptance.'
          : 'The brand has been notified of your decision.',
      });
    },
    onError: (error) => {
      console.error('Error updating proposal:', error);
      toast({
        title: 'Error',
        description: 'Failed to update proposal status.',
        variant: 'destructive',
      });
    },
  });

  return {
    proposals: proposals || [],
    isLoading,
    updateProposalStatus,
  };
};
