import { Switch } from '@/components/ui/switch';
import { SettingsSection } from './SettingsSection';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { toast } from '@/hooks/use-toast';
import { CATEGORY_META } from '@/types/notifications';
import type { NotificationCategory, PreferencesMatrix } from '@/types/notifications';

const CATEGORIES: NotificationCategory[] = ['campaigns', 'messages', 'transactions', 'content', 'account'];
const CHANNELS = [
  { key: 'in_app' as const, label: 'IN-APP' },
  { key: 'email' as const, label: 'EMAIL' },
  { key: 'sms' as const, label: 'SMS' },
];

export function NotificationPreferencesSection() {
  const { matrix, isLoading, updateMatrix } = useNotificationPreferences();

  const handleToggle = (category: NotificationCategory, channel: 'in_app' | 'email' | 'sms', value: boolean) => {
    const newMatrix: PreferencesMatrix = {
      ...matrix,
      [category]: {
        ...matrix[category],
        [channel]: value,
      },
    };
    updateMatrix.mutate(newMatrix, {
      onError: () => {
        toast({
          title: 'Failed to update preference',
          description: 'Please try again.',
          variant: 'destructive',
        });
      },
    });
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
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 bg-dc-teal/10 rounded-xl animate-pulse" />
          ))}
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      value="notifications"
      icon="🔔"
      title="Notifications"
      subtitle="Manage how you receive notifications"
    >
      {/* Column headers */}
      <div className="flex items-center gap-2 mb-1 lg:gap-4">
        {/* Left spacer to align with category name column */}
        <div className="flex-1 min-w-0" />
        {CHANNELS.map(channel => (
          <div
            key={channel.key}
            className="w-14 text-center text-[10px] font-bold tracking-widest text-dc-text-muted uppercase lg:w-16"
          >
            {channel.label}
          </div>
        ))}
      </div>

      {/* Category rows */}
      <div className="space-y-3">
        {CATEGORIES.map(category => {
          const meta = CATEGORY_META[category];
          return (
            <div
              key={category}
              className="flex items-center gap-2 py-2 border-b border-dc-teal/15 last:border-0 lg:gap-4"
            >
              {/* Category info */}
              <div className="flex-1 min-w-0 flex items-center gap-2 lg:gap-3">
                <span className="text-base shrink-0 lg:text-lg">{meta.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-dc-text truncate">{meta.label}</p>
                  <p className="text-[11px] text-dc-text-muted leading-tight mt-0.5 line-clamp-1 lg:text-xs">
                    {meta.description}
                  </p>
                </div>
              </div>

              {/* Channel toggles */}
              {CHANNELS.map(channel => {
                const isSms = channel.key === 'sms';
                const isChecked = matrix[category][channel.key];

                return (
                  <div
                    key={channel.key}
                    className="w-14 flex flex-col items-center gap-0.5 shrink-0 lg:w-16"
                  >
                    <Switch
                      id={`${category}-${channel.key}`}
                      checked={!isSms && isChecked}
                      onCheckedChange={
                        isSms ? undefined : (v) => handleToggle(category, channel.key, v)
                      }
                      disabled={isSms || updateMatrix.isPending}
                      aria-label={`${meta.label} ${channel.label.toLowerCase()} notifications${isSms ? ' — coming soon' : ''}`}
                      className={
                        isSms
                          ? 'opacity-40 cursor-not-allowed data-[state=checked]:bg-dc-teal'
                          : 'data-[state=checked]:bg-dc-teal'
                      }
                    />
                    {isSms && (
                      <span className="text-[9px] font-semibold text-dc-text-muted uppercase tracking-wide" aria-hidden="true">
                        Soon
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
