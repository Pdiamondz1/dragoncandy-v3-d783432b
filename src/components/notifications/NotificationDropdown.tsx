import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { useNotificationsList, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useNotificationQueries';
import type { PushNotification } from '@/types/notifications';

export const NotificationDropdown: React.FC = () => {
  const { data: notifications = [] } = useNotificationsList();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleNotificationClick = (notification: PushNotification) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }
    setIsOpen(false);

    if (notification.action_url) {
      navigate(notification.action_url);
      return;
    }

    // Fallback: navigate based on notification type + embedded data
    const notifData = notification.data as Record<string, unknown> | null;

    if (notification.type === 'sponsorship_proposal') {
      navigate(notifData?.campaign_id
        ? `/dashboard/business/campaigns/${notifData.campaign_id}`
        : '/dashboard/business/campaigns');
    } else if (notification.type === 'sponsorship_accepted' || notification.type === 'sponsorship_rejected') {
      navigate('/dashboard/brand/sponsorships');
    } else if (notification.type === 'application_received') {
      if (notifData?.campaign_id) {
        navigate(`/dashboard/business/campaigns/${notifData.campaign_id}`);
      }
    } else if (notification.type === 'application_accepted' || notification.type === 'application_rejected') {
      navigate('/dashboard/creator/my-campaigns?tab=applied');
    } else if (notification.type === 'content_liked') {
      navigate('/dashboard/creator/dragon-feed');
    } else if (notification.type === 'campaign_invitation') {
      if (notifData?.campaign_id) {
        navigate(`/dashboard/creator/campaigns/${notifData.campaign_id}?invited=true`);
      }
    } else if (notification.type === 'message_received') {
      if (notifData?.conversation_id) {
        navigate(`/dashboard/messages/${notifData.conversation_id}`);
      } else if (notifData?.campaign_id) {
        navigate(`/messages/${notifData.campaign_id}`);
      }
    } else if (notification.type === 'counter_offer_received' || notification.type === 'counter_offer_responded') {
      if (notifData?.campaign_id) {
        const isCreatorView = notifData.sender_role === 'business';
        navigate(isCreatorView
          ? `/dashboard/creator/my-campaigns/${notifData.campaign_id}`
          : `/dashboard/business/campaigns/${notifData.campaign_id}`);
      }
    }
  };

  const recentNotifications = notifications.slice(0, 5);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold text-dc-text">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate()}
              className="h-auto p-1 text-dc-teal hover:text-dc-teal-dark"
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />

        {recentNotifications.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-dc-text-muted">
            <div className="h-10 w-10 rounded-full bg-dc-teal/10 flex items-center justify-center mb-2">
              <Bell className="h-5 w-5 text-dc-teal" />
            </div>
            <span className="text-sm">No notifications yet</span>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {recentNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                compact
                onClick={() => handleNotificationClick(notification)}
              />
            ))}
          </div>
        )}

        <DropdownMenuSeparator className="m-0" />
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            navigate('/notifications');
          }}
          className="w-full flex items-center justify-center gap-1 px-4 py-2.5 text-sm font-medium text-dc-teal hover:bg-dc-teal/[0.06] transition-colors"
        >
          See all notifications
          <ChevronRight className="h-4 w-4" />
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
