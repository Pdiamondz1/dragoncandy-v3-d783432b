import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Download, Copy, ExternalLink } from 'lucide-react';

interface ConnectedAccount {
  id: string;
  platform: string;
  platform_handle: string | null;
  outstand_social_account_id: string;
}

interface SocialPostEditorProps {
  connectedAccounts: ConnectedAccount[];
  caption: string;
  onCaptionChange: (caption: string) => void;
  hashtags: string[];
  onHashtagsChange: (hashtags: string[]) => void;
  selectedPlatforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
  scheduleForLater: boolean;
  onScheduleToggle: (schedule: boolean) => void;
  suggestedTime: string | null;
  scheduledAt: string | null;
  onScheduledAtChange: (time: string) => void;
  videoUrl: string | null;
  isLoading: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  twitter: 'X',
  youtube: 'YouTube',
  x: 'X',
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  tiktok: 'bg-black text-white',
  facebook: 'bg-blue-600 text-white',
  twitter: 'bg-black text-white',
  x: 'bg-black text-white',
  youtube: 'bg-red-600 text-white',
};

export function SocialPostEditor({
  connectedAccounts,
  caption,
  onCaptionChange,
  hashtags,
  onHashtagsChange: _onHashtagsChange,
  selectedPlatforms,
  onPlatformsChange,
  scheduleForLater,
  onScheduleToggle,
  suggestedTime,
  scheduledAt,
  onScheduledAtChange,
  videoUrl,
  isLoading,
}: SocialPostEditorProps) {
  const hasAccounts = connectedAccounts.length > 0;

  if (!hasAccounts) {
    return (
      <div className="space-y-3 p-4 bg-dc-teal/5 rounded-2xl border border-dc-teal/20">
        <p className="text-sm text-dc-text-muted">
          Connect social accounts to auto-post approved content.
        </p>
        <div className="flex gap-2">
          {videoUrl && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                const a = document.createElement('a');
                a.href = videoUrl;
                a.download = 'approved-content';
                a.click();
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => navigator.clipboard.writeText(caption || '')}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Caption
          </Button>
        </div>
        <a
          href="/dashboard/business/settings"
          className="inline-flex items-center gap-1 text-xs text-dc-teal hover:underline"
        >
          Connect social accounts to auto-post
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  const togglePlatform = (platform: string) => {
    if (selectedPlatforms.includes(platform)) {
      onPlatformsChange(selectedPlatforms.filter(p => p !== platform));
    } else {
      onPlatformsChange([...selectedPlatforms, platform]);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-dc-teal/5 rounded-2xl border border-dc-teal/20">
      {/* Platform chips */}
      <div>
        <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
          Post to
        </Label>
        <div className="flex flex-wrap gap-2">
          {connectedAccounts.map(account => {
            const isSelected = selectedPlatforms.includes(account.platform);
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => togglePlatform(account.platform)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isSelected
                    ? PLATFORM_COLORS[account.platform] || 'bg-dc-teal text-white'
                    : 'bg-dc-teal/5 text-dc-text-muted hover:bg-dc-teal/10'
                }`}
              >
                {PLATFORM_LABELS[account.platform] || account.platform}
                {account.platform_handle && (
                  <span className="ml-1 opacity-75">@{account.platform_handle}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Caption editor */}
      <div>
        <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
          Caption
        </Label>
        <Textarea
          value={caption}
          onChange={e => onCaptionChange(e.target.value)}
          placeholder={isLoading ? 'Generating caption...' : 'Write a caption or tap Generate to try again'}
          className="min-h-[80px] rounded-xl text-sm resize-none"
          disabled={isLoading}
        />
        {hashtags.length > 0 && (
          <p className="text-xs text-dc-text-muted mt-1">
            {hashtags.join(' ')}
          </p>
        )}
      </div>

      {/* Schedule toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-dc-text-muted">
          Schedule for best time
        </Label>
        <Switch
          checked={scheduleForLater}
          onCheckedChange={onScheduleToggle}
        />
      </div>

      {scheduleForLater && suggestedTime && (
        <div>
          <Label className="text-xs font-medium text-dc-text-muted mb-1 block">
            Scheduled for
          </Label>
          <input
            type="datetime-local"
            value={(scheduledAt || suggestedTime).slice(0, 16)}
            onChange={e => onScheduledAtChange(new Date(e.target.value).toISOString())}
            className="w-full rounded-xl border border-dc-teal/20 px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}
