
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  });
};
