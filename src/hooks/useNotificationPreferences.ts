import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { PreferencesMatrix } from '@/types/notifications';
import { DEFAULT_PREFERENCES_MATRIX } from '@/types/notifications';

export const useNotificationPreferences = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notification-preferences', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('id, user_id, preferences_matrix')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching notification preferences:', error);
        throw error;
      }

      return data;
    },
    enabled: !!user,
  });

  const matrix: PreferencesMatrix =
    (query.data?.preferences_matrix as PreferencesMatrix) ?? DEFAULT_PREFERENCES_MATRIX;

  const updateMatrix = useMutation({
    mutationFn: async (newMatrix: PreferencesMatrix) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          { user_id: user.id, preferences_matrix: newMatrix as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('Error updating notification preferences:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });

  return { matrix, isLoading: query.isLoading, updateMatrix };
};
