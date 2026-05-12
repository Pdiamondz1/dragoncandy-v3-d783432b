
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from './useConversations';

export const useUnreadMessageCounts = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['unread-counts'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase.rpc('get_unread_message_counts', {
        user_uuid: user.id
      });

      if (error) {
        console.error('Error fetching unread counts:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: 'always',
  });
};

export const useTotalUnreadCount = () => {
  const { data: conversations } = useConversations();

  const total = conversations?.reduce(
    (sum, conv) => sum + (conv.unread_count ?? 0),
    0
  ) ?? 0;

  return Math.min(total, 99);
};
