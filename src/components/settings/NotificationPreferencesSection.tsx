import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SettingsSection } from './SettingsSection';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { toast } from '@/hooks/use-toast';

export function NotificationPreferencesSection() {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const handleToggle = (field: string, value: boolean) => {
    updatePrefs.mutate(
      { [field]: value },
      {
        onError: () => {
          toast({
            title: 'Failed to update preference',
            description: 'Please try again.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <SettingsSection
        value="notifications"
        icon="🔔"
        title="Notifications"
        subtitle="Manage how you receive notifications"
      >
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </SettingsSection>
    );
  }

  const emailEnabled = prefs?.email_notifications ?? true;
  const pushEnabled = prefs?.push_notifications ?? true;
  const messageEnabled = prefs?.message_notifications ?? true;
  const campaignEnabled = prefs?.campaign_notifications ?? true;

  return (
    <SettingsSection
      value="notifications"
      icon="🔔"
      title="Notifications"
      subtitle="Manage how you receive notifications"
    >
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Delivery Channels
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-notifs" className="text-sm font-medium">Email notifications</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Receive updates in your inbox</p>
              </div>
              <Switch
                id="email-notifs"
                checked={emailEnabled}
                onCheckedChange={(v) => handleToggle('email_notifications', v)}
                disabled={updatePrefs.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="push-notifs" className="text-sm font-medium">In-app notifications</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Toast alerts and bell icon updates</p>
              </div>
              <Switch
                id="push-notifs"
                checked={pushEnabled}
                onCheckedChange={(v) => handleToggle('push_notifications', v)}
                disabled={updatePrefs.isPending}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            What to Notify
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="msg-notifs" className="text-sm font-medium">Messages</Label>
                <p className="text-xs text-muted-foreground mt-0.5">New messages and replies</p>
              </div>
              <Switch
                id="msg-notifs"
                checked={messageEnabled}
                onCheckedChange={(v) => handleToggle('message_notifications', v)}
                disabled={updatePrefs.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="campaign-notifs" className="text-sm font-medium">Campaign activity</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Applications, sponsorships, and invitations</p>
              </div>
              <Switch
                id="campaign-notifs"
                checked={campaignEnabled}
                onCheckedChange={(v) => handleToggle('campaign_notifications', v)}
                disabled={updatePrefs.isPending}
              />
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
