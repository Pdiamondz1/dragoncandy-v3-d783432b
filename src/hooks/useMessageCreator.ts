import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export function useMessageCreator() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { activeOrgUnit } = useAuth();

  const messageCreator = async (creatorId: string, creatorName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to send messages.",
          variant: "destructive"
        });
        return;
      }

      const rpcParams: { user1_uuid: string; user2_uuid: string; p_org_unit_id?: string } = {
        user1_uuid: user.id,
        user2_uuid: creatorId,
      };
      if (activeOrgUnit?.id) {
        rpcParams.p_org_unit_id = activeOrgUnit.id;
      }

      const { data: conversationId, error } = await supabase.rpc(
        'create_or_get_direct_conversation',
        rpcParams
      );

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      toast({
        title: "Opening conversation",
        description: `Starting a conversation with ${creatorName}`,
      });

      const userRole = user.user_metadata?.role || 'business_client';
      const rolePrefix = userRole === 'brand' ? 'brand' : 'business';

      navigate(`/dashboard/${rolePrefix}/messages/direct/${conversationId}`);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast({
        title: "Error",
        description: "Failed to start conversation. Please try again.",
        variant: "destructive"
      });
    }
  };

  return { messageCreator };
}
