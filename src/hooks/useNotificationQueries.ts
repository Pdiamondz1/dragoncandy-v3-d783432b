import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { PushNotification, NotificationCategory } from '@/types/notifications';

const PAGE_SIZE = 20;

export const useNotificationsList = (category?: NotificationCategory) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id, category ?? 'all'],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('push_notifications')
        .select('id, user_id, title, body, type, category, action_url, actor_id, actor_name, icon, data, read_at, sent_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PushNotification[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};

export const useUnreadNotificationCount = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-unread-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from('push_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};

export const useUnreadCountByCategory = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-unread-by-category', user?.id],
    queryFn: async () => {
      if (!user) return {} as Record<string, number>;

      const { data, error } = await supabase
        .from('push_notifications')
        .select('category')
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const cat = row.category ?? 'legacy';
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
      return counts;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};

export const useMarkNotificationRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('push_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('push_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
    },
  });
};

export const useDeleteNotification = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('push_notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
    },
  });
};

export const useClearNotificationsByCategory = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category?: string) => {
      if (!user) throw new Error('Not authenticated');

      let query = supabase
        .from('push_notifications')
        .delete()
        .eq('user_id', user.id);

      if (category && category !== 'all') {
        query = query.eq('category', category);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
    },
  });
};
