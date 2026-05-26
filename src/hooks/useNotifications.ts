import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useNotificationsList, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useNotificationQueries';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import type { PushNotification } from '@/types/notifications';

/** @deprecated Use PushNotification directly. Kept for backward compatibility. */
export type Notification = PushNotification;

/** @deprecated Legacy interface kept for backward compatibility. */
export interface NotificationData {
  campaign_id?: string;
  application_id?: string;
  sponsorship_id?: string;
  brand_id?: string;
  status?: string;
  content_id?: string;
  liker_id?: string;
  liker_name?: string;
  invitation_id?: string;
  conversation_id?: string;
  sender_id?: string;
  sender_name?: string;
  proposed_rate?: number;
  sender_role?: string;
  [key: string]: unknown;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { matrix } = useNotificationPreferences();

  const { data: notifications = [] } = useNotificationsList();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!user) return;

    const suffix = Math.random().toString(36).substring(2, 8);
    const channel = supabase
      .channel(`notifications-${user.id}-${suffix}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'push_notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const newNotif = payload.new as PushNotification;

        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });

        const category = newNotif.category as keyof typeof matrix;
        const inAppEnabled = matrix[category]?.in_app ?? true;

        if (inAppEnabled && newNotif.title) {
          toast({
            title: newNotif.title,
            description: newNotif.body,
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'push_notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'push_notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['notification-unread-by-category'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient, matrix]);

  const markAsRead = useCallback((notificationId: string) => {
    markReadMutation.mutate(notificationId);
  }, [markReadMutation]);

  const markAllAsRead = useCallback(() => {
    markAllReadMutation.mutate();
  }, [markAllReadMutation]);

  const markConversationRead = useCallback((conversationId: string) => {
    const conversationNotifs = notifications.filter(
      n => n.type === 'message_received' && !n.read_at &&
        (n.data as Record<string, unknown>)?.conversation_id === conversationId
    );
    for (const notif of conversationNotifs) {
      markReadMutation.mutate(notif.id);
    }
  }, [notifications, markReadMutation]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    markConversationRead,
  };
};
