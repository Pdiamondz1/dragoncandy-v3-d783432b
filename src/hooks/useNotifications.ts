
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface Notification {
  id: string;
  type: 'application_received' | 'application_status_changed' | 'milestone_completed';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: any;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Set up real-time subscription for application status changes
    const applicationChannel = supabase
      .channel('application-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_applications',
        },
        (payload) => {
          console.log('Application status updated:', payload);
          
          // Show toast notification
          const newStatus = payload.new.status;
          if (newStatus === 'accepted') {
            toast({
              title: 'Application Accepted!',
              description: 'Your application has been accepted. A new collaboration has been created.',
            });
          } else if (newStatus === 'rejected') {
            toast({
              title: 'Application Update',
              description: 'Your application status has been updated.',
              variant: 'destructive',
            });
          }

          // Add to notifications list
          const notification: Notification = {
            id: `app-${payload.new.id}-${Date.now()}`,
            type: 'application_status_changed',
            title: `Application ${newStatus}`,
            message: `Your application status has been updated to ${newStatus}`,
            read: false,
            created_at: new Date().toISOString(),
            data: payload.new,
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_applications',
        },
        (payload) => {
          console.log('New application received:', payload);
          
          // For business users - show toast when they receive new applications
          toast({
            title: 'New Application Received',
            description: 'A creator has applied to one of your campaigns.',
          });

          const notification: Notification = {
            id: `new-app-${payload.new.id}`,
            type: 'application_received',
            title: 'New Application',
            message: 'A creator has applied to your campaign',
            read: false,
            created_at: new Date().toISOString(),
            data: payload.new,
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(applicationChannel);
    };
  }, [user]);

  const markAsRead = (notificationId: string) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    setUnreadCount(0);
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  };
};
