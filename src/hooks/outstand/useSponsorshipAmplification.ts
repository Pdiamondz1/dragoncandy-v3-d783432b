import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { toDbContentType, type DbContentType } from '@/lib/contentType';

interface AmplifyInput {
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  campaignId: string;
  scheduledAt?: string;
}

export interface ResolvedAmplificationPlatforms {
  /** Distinct platform names to write into social_post_log, one row per entry. */
  platforms: string[];
  /** accountIds with no platform match — never written anywhere, caller must warn. */
  unresolved: string[];
}

/**
 * Maps each amplified accountId to a real platform name via a caller-supplied
 * lookup (sourced from business_outstand_accounts), deduplicating accounts
 * that share a platform — e.g. two locations both on Instagram — down to one
 * entry. This matches social_post_log's `(outstand_post_id, platform)` unique
 * key: one physical Outstand post fans out to N accounts but should only ever
 * produce one row per platform, the same grain the webhook and
 * content-performance-capture already use. An accountId with no match is
 * reported in `unresolved` rather than coerced into a fabricated platform
 * value — writing the raw accountId as `platform` was the original bug this
 * hook exists to fix.
 */
export function resolveAmplificationPlatforms(
  accountIds: string[],
  platformByAccountId: Map<string, string>,
): ResolvedAmplificationPlatforms {
  const platforms = new Set<string>();
  const unresolved: string[] = [];
  for (const accountId of accountIds) {
    const platform = platformByAccountId.get(accountId);
    if (!platform) {
      unresolved.push(accountId);
      continue;
    }
    platforms.add(platform);
  }
  return { platforms: [...platforms], unresolved };
}

// Same extension check as MediaPreviewGrid.tsx's isVideoItem — the only other
// content-type-from-URL derivation in the codebase. That helper also checks a
// MediaItem's mimeType, which amplification never has (it only carries raw
// URL strings); this mirrors the URL-extension half of it.
const VIDEO_URL_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv']);

/**
 * Planner-side content type ('video' | 'photo') for the media batch being
 * amplified. Any video URL in the batch marks the whole post 'video' —
 * toDbContentType then maps that through the DB vocabulary exactly like every
 * other write path (it's a no-op pass-through here since both values are
 * already native DB_CONTENT_TYPES, but routing through it keeps a single
 * source of truth for the CHECK vocabulary rather than writing a raw value).
 */
export function derivePlannerContentType(mediaUrls: string[]): string {
  const hasVideo = mediaUrls.some((url) => {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    return VIDEO_URL_EXTENSIONS.has(ext);
  });
  return hasVideo ? 'video' : 'photo';
}

export interface AmplificationScheduleRow {
  user_id: string;
  campaign_id: string;
  platform: string;
  content_type: DbContentType;
  caption: string;
  media_urls: string[];
  scheduled_at: string;
  published_at: string | null;
  status: 'scheduled' | 'published';
  metadata: { outstand_post_id: string };
}

/**
 * Builds one donny_scheduled_posts row per resolved platform for an
 * amplification post, so it becomes visible to the same schedule-row lookup
 * (metadata->>outstand_post_id) every other publish path already produces —
 * see recordPublishedPost in supabase/functions/outstand-webhook/index.ts.
 * Amplification was the only publish path that skipped this table, which is
 * why its posts were never verified/measured; this removes that special-case
 * status instead of adding a webhook-side fallback (see that function's
 * comment for why a fallback was tried and rejected).
 *
 * Pure: `now` is a caller-supplied parameter, never read from Date.now()
 * internally, so a missing scheduledAt is testable without faking the clock.
 * scheduledAt present AND in the future (relative to `now`) => a genuinely
 * scheduled post ('scheduled', no published_at); otherwise (missing, or not
 * in the future) => already published at effectiveScheduledAt ('published',
 * published_at = effectiveScheduledAt) — mirrors SocialPostPrompt.tsx's
 * syncScheduledPost status/published_at pairing.
 */
export function buildAmplificationScheduleRows(
  platforms: string[],
  outstandPostId: string,
  userId: string,
  caption: string,
  mediaUrls: string[],
  campaignId: string,
  scheduledAt: string | null | undefined,
  now: string,
): AmplificationScheduleRow[] {
  if (platforms.length === 0) return [];

  const contentType = toDbContentType(derivePlannerContentType(mediaUrls));
  const nowMs = new Date(now).getTime();
  // scheduledAt ? new Date(...).getTime() : NaN, and NaN > anything is false
  // in JS — null/missing/unparseable scheduledAt all fall through to
  // 'published' without a separate guard.
  const scheduledMs = scheduledAt ? new Date(scheduledAt).getTime() : NaN;
  const isFutureSchedule = scheduledMs > nowMs;
  const status: 'scheduled' | 'published' = isFutureSchedule ? 'scheduled' : 'published';
  const effectiveScheduledAt = scheduledAt ?? now;

  return platforms.map((platform) => ({
    user_id: userId,
    campaign_id: campaignId,
    platform,
    content_type: contentType,
    caption,
    media_urls: mediaUrls,
    scheduled_at: effectiveScheduledAt,
    published_at: status === 'published' ? effectiveScheduledAt : null,
    status,
    metadata: { outstand_post_id: outstandPostId },
  }));
}

export function useSponsorshipAmplification() {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ caption, mediaUrls, accountIds, campaignId, scheduledAt }: AmplifyInput) => {
      const body: Record<string, unknown> = {
        text: caption,
        socialAccountIds: accountIds,
      };
      if (mediaUrls.length > 0) body.mediaUrls = mediaUrls;
      if (scheduledAt) body.scheduledAt = scheduledAt;

      const res = await fetch(`${baseUrl}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to amplify post');
      const data: Record<string, unknown> = await res.json();
      // No 'unknown' fallback: social_post_log.outstand_post_id is NOT NULL and
      // carries the UNIQUE (outstand_post_id, platform) key added alongside this
      // hook. A placeholder string here would leave the first such row
      // permanently unmatchable by the webhook, AND collide with a second
      // unresolved response on the same platform -- which, since the insert
      // below is one atomic array call, would fail the whole batch and silently
      // lose every platform's measurement row for this post. Null instead, and
      // skip the write below (mirrors SocialPostPrompt's syncScheduledPost
      // outstandPostId == null handling) -- the publish itself already
      // succeeded and must stand regardless.
      const outstandPostId = (data.id ?? (data.data as Record<string, unknown>)?.id ?? null) as string | null;

      // social_post_log.platform must carry a real network name (instagram,
      // youtube, ...), never an Outstand account id — every other writer/reader
      // of this column assumes that (the (outstand_post_id, platform) unique
      // key, content-performance-capture's metricsForPlatform, the strategy
      // recommender's group-by). Resolve accountId -> platform via
      // business_outstand_accounts (own-row RLS: user_id = auth.uid()) rather
      // than writing the id directly. This does not change what accountId is
      // used for above — only what gets recorded for measurement.
      const platformByAccountId = new Map<string, string>();
      if (user) {
        const { data: accounts, error: accountsError } = await supabase
          .from('business_outstand_accounts')
          .select('outstand_social_account_id, platform')
          .eq('user_id', user.id)
          .in('outstand_social_account_id', accountIds);
        if (accountsError) {
          console.error('[useSponsorshipAmplification] Failed to resolve account platforms:', accountsError);
        } else {
          for (const row of accounts ?? []) {
            platformByAccountId.set(row.outstand_social_account_id, row.platform);
          }
        }
      }

      const { platforms, unresolved } = resolveAmplificationPlatforms(accountIds, platformByAccountId);
      for (const accountId of unresolved) {
        // Never fall back to writing accountId into `platform` — that is the
        // exact defect being fixed. The Outstand publish above already
        // succeeded regardless; skipping only costs this account's
        // measurement row, never silently — always a visible console.warn.
        console.warn(
          `[useSponsorshipAmplification] Could not resolve platform for Outstand account ${accountId} (post ${outstandPostId}); skipping its social_post_log write.`,
        );
      }

      if (outstandPostId == null && platforms.length > 0) {
        // Could not resolve an Outstand post id from the response shape at all
        // -- there is no honest row to write for ANY platform, not just the
        // per-account unresolved ones warned above. Skip the write entirely
        // (never substitute a placeholder) and say so loudly: the publish
        // already went out, so this is a measurement loss, not a failed post.
        console.warn(
          `[useSponsorshipAmplification] Could not resolve an Outstand post id from the response; skipping social_post_log write for platform(s) [${platforms.join(', ')}].`,
        );
      }

      // Insert every platform's row in ONE array call, not a sequential loop.
      // PostgREST executes a JSON-array insert as a single INSERT statement, so
      // either every platform row lands or none does -- there is no window where
      // some rows exist and others don't. A sequential per-platform loop left
      // exactly that window open: if the Outstand webhook's no-schedule path
      // (outstand-webhook/index.ts's recordPublishedPost) ran between two
      // iterations, it would find the first-inserted row, treat that as
      // sufficient, stamp only that subset, and return 200 -- so Outstand never
      // retries and the remaining platforms stay permanently unverified and
      // unmeasured. A single atomic insert removes the window rather than
      // requiring the webhook to detect and retry against a partial subset.
      if (outstandPostId != null && platforms.length > 0) {
        // Give this post a donny_scheduled_posts row — the same schedule-row
        // lookup (metadata->>outstand_post_id) recordPublishedPost already uses
        // for every other publish path. Without this, amplification's
        // social_post_log rows below are written but never matched by the
        // webhook, so verified_at never gets set and content-performance-capture
        // never measures them (see that function's comment on why a webhook-side
        // fallback for this was tried and rejected instead). Same atomic-array
        // reasoning as the social_post_log insert below: one array insert, not a
        // sequential loop, so the webhook never sees a partial subset of rows.
        const now = new Date().toISOString();
        const scheduleRows = buildAmplificationScheduleRows(
          platforms,
          outstandPostId,
          user!.id,
          caption,
          mediaUrls,
          campaignId,
          scheduledAt ?? null,
          now,
        );
        const { error: scheduleError } = await supabase.from('donny_scheduled_posts').insert(scheduleRows);
        if (scheduleError) {
          console.error(
            `[useSponsorshipAmplification] Failed to write schedule row(s) for platforms [${platforms.join(', ')}]:`,
            scheduleError,
          );
        }

        const rows = platforms.map((platform) => ({
          user_id: user!.id,
          campaign_id: campaignId,
          outstand_post_id: outstandPostId,
          platform,
          post_type: 'amplification',
        }));
        const { error: logError } = await supabase.from('social_post_log').insert(rows);
        if (logError) {
          console.error(
            `[useSponsorshipAmplification] Failed to log social post(s) for platforms [${platforms.join(', ')}]:`,
            logError,
          );
        }
      }

      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['outstand'] });
      qc.invalidateQueries({ queryKey: ['brand-sponsorships'] });
      toast.success(variables.scheduledAt ? 'Amplification scheduled!' : 'Content amplified to your channels!');
    },
    onError: (err: Error) => {
      toast.error(`Amplification failed: ${err.message}`);
    },
  });
}
