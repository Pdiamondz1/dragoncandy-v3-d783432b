import React, { useMemo, useState } from 'react';
import { CalendarClock, Send, Loader2 } from 'lucide-react';
import {
  PostComposer,
  NetworkSelector,
  MediaUploader,
  NetworkConfigPanel,
  usePosts,
  type SocialAccount,
  type Post,
  type MediaFile,
  type SocialNetwork,
} from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CustomComposeFormProps {
  accounts: SocialAccount[];
  onPosted?: (post: Post | null, wasScheduled: boolean) => void;
}

const SCHEDULE_MAX_DAYS = 30;

function toDatetimeLocalValue(date: Date): string {
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function defaultScheduledLocal(): string {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setSeconds(0, 0);
  return toDatetimeLocalValue(date);
}

function maxScheduledLocal(): string {
  const date = new Date();
  date.setDate(date.getDate() + SCHEDULE_MAX_DAYS);
  return toDatetimeLocalValue(date);
}

function minScheduledLocal(): string {
  const date = new Date(Date.now() + 5 * 60_000);
  return toDatetimeLocalValue(date);
}

export const CustomComposeForm: React.FC<CustomComposeFormProps> = ({ accounts, onPosted }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { createPost } = usePosts({ apiKey, baseUrl });

  const [content, setContent] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState<string>(defaultScheduledLocal());
  const [networkConfigs, setNetworkConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastFailures, setLastFailures] = useState<Array<{ network: string; username: string; error: string }>>([]);

  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selectedAccountIds.includes(a.id)),
    [accounts, selectedAccountIds],
  );

  const uniqueNetworks = useMemo<SocialNetwork[]>(
    () => Array.from(new Set(selectedAccounts.map((a) => a.network))) as SocialNetwork[],
    [selectedAccounts],
  );

  // Outstand only ships config UI for these networks. Anything else is
  // configurable purely via the post body content (hashtags / @mentions
  // included in the caption text).
  const CONFIGURABLE_NETWORKS: ReadonlySet<string> = new Set([
    'threads',
    'instagram',
    'youtube',
    'tiktok',
  ]);
  const configurableNetworks = uniqueNetworks.filter((n) => CONFIGURABLE_NETWORKS.has(n));

  const scheduledAt = scheduleEnabled ? fromDatetimeLocalValue(scheduledLocal) : null;
  const hasContentOrMedia = content.trim().length > 0 || media.length > 0;
  const hasAccounts = selectedAccountIds.length > 0;
  const scheduleValid = !scheduleEnabled || (!!scheduledAt && scheduledAt.getTime() > Date.now());

  // Per-platform media rules (catch the failures Outstand would otherwise
  // surface only after attempting to publish).
  const mediaIssues = useMemo(() => {
    const issues: string[] = [];
    if (media.length === 0 || uniqueNetworks.length === 0) return issues;

    const hasImage = media.some((m) => (m.contentType ?? '').startsWith('image/'));
    const hasVideo = media.some((m) => (m.contentType ?? '').startsWith('video/'));
    const onlyVideo = hasVideo && !hasImage;

    if (uniqueNetworks.includes('facebook' as SocialNetwork) && hasImage && hasVideo) {
      issues.push('Facebook does not support mixing images and videos in one post. Pick only images or only one video.');
    }
    if (uniqueNetworks.includes('youtube' as SocialNetwork) && !onlyVideo) {
      issues.push('YouTube posts must be a single video. Remove any images and include only one video.');
    }
    if (uniqueNetworks.includes('tiktok' as SocialNetwork) && !onlyVideo) {
      issues.push('TikTok posts must be a single video. Remove any images.');
    }
    if (uniqueNetworks.includes('x' as SocialNetwork)) {
      const imageCount = media.filter((m) => (m.contentType ?? '').startsWith('image/')).length;
      if (imageCount > 4) {
        issues.push('X allows up to 4 images per post.');
      }
      if (hasVideo && hasImage) {
        issues.push('X does not support mixing images and a video in one post.');
      }
    }
    return issues;
  }, [media, uniqueNetworks]);

  const canSubmit =
    hasContentOrMedia && hasAccounts && scheduleValid && mediaIssues.length === 0 && !submitting;

  const submitButtonText = submitting
    ? 'Posting…'
    : scheduledAt
      ? `Schedule for ${scheduledAt.toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}`
      : 'Post Now';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setLastFailures([]);
    try {
      const postData: Record<string, unknown> = {
        accounts: selectedAccountIds,
      };
      if (scheduledAt) {
        postData.scheduledAt = scheduledAt.toISOString();
      }
      if (media.length > 0) {
        postData.containers = [
          {
            content,
            media: media.map((m) => ({
              id: m.id,
              url: m.url,
              filename: m.filename,
              contentType: m.contentType,
              size: m.size,
            })),
          },
        ];
      } else {
        postData.containers = [{ content }];
      }

      // Per-platform configs — Outstand expects each as a top-level key.
      for (const network of ['threads', 'instagram', 'youtube', 'tiktok'] as const) {
        const cfg = networkConfigs[network];
        if (cfg && Object.keys(cfg).length > 0) {
          postData[network] = cfg;
        }
      }

      const response = (await createPost(postData)) as Record<string, unknown>;
      if (!response.success) {
        const error = response.error;
        const message = typeof error === 'string' ? error : 'Failed to create post';
        throw new Error(message);
      }

      const created =
        ((response.data as Record<string, unknown> | undefined)?.post as Post | undefined) ??
        ((response as Record<string, unknown>).post as Post | undefined);

      const failures = (created?.socialAccounts ?? []).filter((sa) => sa.status === 'failed');
      const successes = (created?.socialAccounts ?? []).filter((sa) => sa.status === 'published');
      const allFailed = failures.length > 0 && successes.length === 0;

      if (failures.length > 0) {
        setLastFailures(
          failures.map((sa) => ({
            network: sa.network,
            username: sa.username,
            error: sa.error ?? 'Unknown error',
          })),
        );
        const summary = failures
          .map((sa) => `${sa.network} (${sa.username}): ${sa.error ?? 'unknown error'}`)
          .join('\n');
        toast.error(
          allFailed
            ? `Post failed on every platform.\n${summary}`
            : `Posted with errors:\n${summary}`,
          { duration: 12000 },
        );
      } else {
        toast.success(scheduledAt ? 'Post scheduled.' : 'Post sent.');
      }

      // Skip navigation when EVERY platform failed — let the user stay on
      // Compose with the form preserved so they can fix and retry. If even one
      // platform succeeded (or it's a scheduled post), navigate.
      if (!allFailed) {
        onPosted?.(created ?? null, !!scheduledAt);
      }

      // Only clear the form if the post fully succeeded (or was scheduled, since
      // failures haven't happened yet). On partial/full failure, keep state so
      // the user can fix and retry without re-entering everything.
      const fullySucceeded = failures.length === 0;
      if (fullySucceeded) {
        setContent('');
        setSelectedAccountIds([]);
        setMedia([]);
        setScheduleEnabled(false);
        setScheduledLocal(defaultScheduledLocal());
        setNetworkConfigs({});
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create post';
      toast.error(`Could not create post: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Accounts */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-900">Post to</label>
        <NetworkSelector
          accounts={accounts}
          selectedIds={selectedAccountIds}
          onChange={setSelectedAccountIds}
        />
      </div>

      {/* Content */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-900">Caption</label>
        <PostComposer
          value={content}
          onChange={setContent}
          selectedAccounts={selectedAccounts}
          placeholder="What's on your mind?"
        />
      </div>

      {/* Media */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-900">Media (optional)</label>
        <MediaUploader
          apiKey={apiKey}
          baseUrl={baseUrl}
          maxFiles={4}
          onUploadComplete={(uploaded) => setMedia(uploaded)}
          onUploadError={(error) => {
            console.error('MediaUploader error:', error);
            toast.error(`Upload failed: ${error.message}`);
          }}
        />
      </div>

      {/* Per-platform settings */}
      {configurableNetworks.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-900">Platform settings</label>
          <NetworkConfigPanel
            networks={configurableNetworks}
            configs={networkConfigs}
            onChange={(next) => setNetworkConfigs(next as Record<string, Record<string, unknown>>)}
          />
        </div>
      )}

      {/* Schedule */}
      <div className="rounded-2xl border-2 border-dc-teal/40 p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(e) => setScheduleEnabled(e.target.checked)}
            className="h-4 w-4 accent-dc-teal"
          />
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <CalendarClock className="h-4 w-4 text-dc-teal" />
            Schedule for later
          </span>
        </label>

        {scheduleEnabled && (
          <div className="space-y-2 pl-6">
            <input
              type="datetime-local"
              value={scheduledLocal}
              min={minScheduledLocal()}
              max={maxScheduledLocal()}
              onChange={(e) => setScheduledLocal(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-dc-teal"
            />
            <p className="text-xs text-gray-500">
              Up to {SCHEDULE_MAX_DAYS} days in advance · {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
            {scheduleEnabled && scheduledAt && !scheduleValid && (
              <p className="text-xs text-red-600">Choose a time at least 5 minutes from now.</p>
            )}
          </div>
        )}
      </div>

      {/* Pre-submit media validation issues */}
      {mediaIssues.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 space-y-1">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
            Fix before posting:
          </p>
          {mediaIssues.map((msg, i) => (
            <p key={i} className="text-xs text-amber-900">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Inline failure banner — persists after toast dismisses */}
      {lastFailures.length > 0 && (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-3 space-y-1">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
            Last attempt failed on:
          </p>
          {lastFailures.map((f, i) => (
            <p key={`${f.network}-${i}`} className="text-xs text-red-700">
              <span className="font-semibold capitalize">{f.network}</span>
              {' '}
              <span className="text-red-600">({f.username})</span>: {f.error}
            </p>
          ))}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        variant="dc-primary"
        size="lg"
        disabled={!canSubmit}
        className="w-full"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {submitButtonText}
      </Button>

      {!hasAccounts && (
        <p className="text-xs text-gray-500 text-center">Pick at least one account to enable posting.</p>
      )}
      {hasAccounts && !hasContentOrMedia && (
        <p className="text-xs text-gray-500 text-center">Add a caption or upload media to enable posting.</p>
      )}
    </form>
  );
};
