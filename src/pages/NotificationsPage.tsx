import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCheck, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/DashboardLayout';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { NotificationCategoryTabs } from '@/components/notifications/NotificationCategoryTabs';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import {
  useNotificationsList,
  useUnreadCountByCategory,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useClearNotificationsByCategory,
} from '@/hooks/useNotificationQueries';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { getNotificationRoute } from '@/lib/getNotificationRoute';
import { getSettingsHref } from '@/lib/navConfig';
import type { NotificationCategory } from '@/types/notifications';
import type { UserRole } from '@/types/user';

const NotificationsPage = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userRole = (profile?.role as UserRole) || 'business_client';

  const { data: notifications = [], isLoading } = useNotificationsList(
    activeCategory === 'all' ? undefined : (activeCategory as NotificationCategory),
  );
  const { data: unreadCounts = {} } = useUnreadCountByCategory();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();
  const clearByCategory = useClearNotificationsByCategory();
  const [showClearDialog, setShowClearDialog] = useState(false);

  const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);

  const handleItemClick = (notification: (typeof notifications)[number]) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }
    const route = getNotificationRoute(notification);
    if (route) navigate(route);
  };

  return (
    <DashboardLayout userRole={userRole}>
      <div className="bg-white min-h-screen pb-20">
        <div className="lg:max-w-3xl lg:mx-auto lg:pt-8">
          <div className="lg:bg-white lg:rounded-2xl lg:shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-5 pb-3 lg:px-6 lg:pt-6">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(-1)}
                  className="text-dc-text-muted hover:text-dc-text -ml-2"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-xl font-bold text-dc-text">Notifications</h1>
              </div>
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
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowClearDialog(true)}
                    className="text-dc-text-muted hover:text-red-500 gap-1.5"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="text-sm">Clear</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(getSettingsHref(userRole))}
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
                      onDelete={(id) => deleteNotification.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {notifications.length}{' '}
              {activeCategory === 'all' ? '' : `${activeCategory} `}
              notification{notifications.length !== 1 ? 's' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearByCategory.mutate(
                  activeCategory === 'all' ? undefined : activeCategory,
                );
                setShowClearDialog(false);
              }}
              className="bg-red-500 hover:bg-red-600 text-white rounded-full"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default NotificationsPage;
