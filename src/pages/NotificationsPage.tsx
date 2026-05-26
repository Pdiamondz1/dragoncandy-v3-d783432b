import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { NotificationCategoryTabs } from '@/components/notifications/NotificationCategoryTabs';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import {
  useNotificationsList,
  useUnreadCountByCategory,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/useNotificationQueries';
import { getNotificationRoute } from '@/lib/getNotificationRoute';
import type { NotificationCategory } from '@/types/notifications';

const NotificationsPage = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useNotificationsList(
    activeCategory === 'all' ? undefined : (activeCategory as NotificationCategory),
  );
  const { data: unreadCounts = {} } = useUnreadCountByCategory();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);

  const handleItemClick = (notification: (typeof notifications)[number]) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }
    const route = getNotificationRoute(notification);
    if (route) navigate(route);
  };

  return (
    <div className="bg-dc-gray min-h-screen pb-20 lg:bg-dc-gray/30">
      <div className="lg:max-w-3xl lg:mx-auto lg:pt-8">
        <div className="lg:bg-white lg:rounded-2xl lg:shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-5 pb-3 lg:px-6 lg:pt-6">
            <h1 className="text-xl font-bold text-dc-text">Notifications</h1>
            <div className="flex items-center gap-1">
              {totalUnread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllRead.mutate()}
                  className="text-dc-teal hover:text-dc-teal-dark gap-1.5"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="text-sm">Mark all read</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/settings')}
                className="hidden lg:inline-flex text-dc-text-muted hover:text-dc-text"
                aria-label="Notification settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Category tabs */}
          <div className="px-4 pb-3 lg:px-6">
            <NotificationCategoryTabs
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              unreadCounts={unreadCounts}
            />
          </div>

          {/* List */}
          <div className="px-2 lg:px-4 lg:pb-4">
            {isLoading ? (
              <div className="space-y-2 px-2">
                <DCSkeleton variant="list-row" count={5} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-dc-text-muted">
                <div className="h-14 w-14 rounded-full bg-dc-teal/10 flex items-center justify-center mb-4">
                  <Bell className="h-7 w-7 text-dc-teal" />
                </div>
                <p className="text-base font-medium">You're all caught up!</p>
                <p className="text-sm mt-1">No notifications to show.</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onClick={() => handleItemClick(notification)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
