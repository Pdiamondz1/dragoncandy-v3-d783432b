import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { toDbContentType, type DbContentType } from '@/lib/contentType';
import { extractOutstandPostId } from '@/lib/outstandPostId';

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

export interface PlannerContentType {
  contentType: string;
  /**
   * True only when a recognized video extension was actually found — real
   * evidence. False means 'photo' was the fallback with NO positive
   * evidence: no media at all, a URL with an unrecognized or missing
   * extension (this function only tests for video extensions; it never
   * positively detects a photo). `donny_scheduled_posts.content_type` is
   * NOT NULL, so `contentType` must be written regardless — but a caller
   * writing this row downstream (social_post_log.format via
   * buildSocialPostLogRow) must be able to tell "found a video" from
   * "guessed photo for lack of anything else", since a wrong format is
   * indistinguishable from a real finding once it lands there. See
   * metadata.content_type_inferred on the schedule row this feeds.
   */
  confident: boolean;
}

/**
 * Planner-side content type ('video' | 'photo') for the media batch being
 * amplified. Any RECOGNIZED video URL in the batch marks the whole post
 * 'video' with confident: true; anything else (no media, or every URL's
 * extension unrecognized) falls back to 'photo' with confident: false — a
 * placeholder, not a finding. Callers still pass `contentType` through
 * toDbContentType exactly like every other write path (a no-op pass-through
 * here since both values are already native DB_CONTENT_TYPES, but routing
 * through it keeps a single source of truth for the CHECK vocabulary rather
 * than writing a raw value).
 */
export function derivePlannerContentType(mediaUrls: string[]): PlannerContentType {
  const hasVideo = mediaUrls.some((url) => {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    return VIDEO_URL_EXTENSIONS.has(ext);
  });
  return hasVideo ? { contentType: 'video', confident: true } : { contentType: 'photo', confident: false };
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
  metadata: {
    outstand_post_id: string;
    source: 'sponsorship_amplification';
    /**
     * True when content_type above was a URL-extension guess with no
     * positive evidence (see derivePlannerContentType), not a real finding.
     * donny_scheduled_posts.content_type is NOT NULL so the column must
     * carry something regardless — this flag is how buildSocialPostLogRow
     * (_shared/social-post-log-row.ts) knows to write
     * social_post_log.format: null instead of propagating the guess. A
     * wrong format is indistinguishable from a real finding downstream
     * (content-performance-capture, "do reels beat photos"), so the guess
     * must stop here, not at content_type.
     */
    content_type_inferred: boolean;
  };
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
 * metadata.source is set to 'sponsorship_amplification', the postType.ts
 * SOURCE_TO_POST_TYPE key for this flow (not just a stray label): the webhook
 * derives post_type from THIS metadata via resolvePostType, independent of
 * what the caller writes into social_post_log.post_type directly below.
 * Leaving source unset made resolvePostType fall through to the campaignId
 * fallback -- amplification always carries a campaignId, so that resolved to
 * 'campaign' and silently overwrote the correct 'amplification' value on the
 * webhook's upsert.
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

  const { contentType: plannerContentType, confident: contentTypeConfident } = derivePlannerContentType(mediaUrls);
  const contentType = toDbContentType(plannerContentType);
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
    // source: 'sponsorship_amplification' is the postType.ts SOURCE_TO_POST_TYPE
    // key for this flow. Without it, outstand-webhook's recordPublishedPost
    // (which resolves postType from THIS metadata, not from the caller) falls
    // through to the campaignId fallback and resolves 'campaign' instead of
    // 'amplification' -- silently overwriting the social_post_log row's
    // correct post_type on upsert. See the doc comment on this function.
    metadata: {
      outstand_post_id: outstandPostId,
      source: 'sponsorship_amplification',
      content_type_inferred: !contentTypeConfident,
    },
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
      //
      // BUG FIXED 2026-08-06 (Codex P1): this read used to be
      // `data.id ?? data.data.id`, which never checks the `.post` level. Against
      // the real proxy response ({success, post, data:{post}}) BOTH links are
      // undefined, so it returned null on EVERY call -- and the guard below then
      // skipped both the donny_scheduled_posts insert and the social_post_log
      // write, so amplified posts got no schedule row at all and neither the
      // webhook nor the reconcile sweep could ever measure them. That made this
      // branch's Task 1 (which exists to give amplification that row) inert.
      // Now routed through the one shared, tested reader.
      const outstandPostId = extractOutstandPostId(data);

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

      // Write every platform's row in ONE array call, not a sequential loop.
      // PostgREST executes a JSON-array insert/upsert as a single statement,
      // so there is no window where some rows exist and others don't while
      // this call is in flight. A sequential per-platform loop left exactly
      // that window open: if the Outstand webhook's no-schedule path
      // (outstand-webhook/index.ts's recordPublishedPost) ran between two
      // iterations, it would find the first-inserted row, treat that as
      // sufficient, stamp only that subset, and return 200 -- so Outstand
      // never retries and the remaining platforms stay permanently
      // unverified and unmeasured. A single atomic call removes the window
      // rather than requiring the webhook to detect and retry against a
      // partial subset. (The social_post_log write below is an upsert with
      // ignoreDuplicates, not a plain insert, for an unrelated reason — see
      // its own comment — which relaxes "all or nothing" to "every
      // non-conflicting row lands, still in one call, still no partial-loop
      // window"; the donny_scheduled_posts insert just above stays a plain
      // insert, so still genuinely all-or-nothing.)
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
        // upsert + ignoreDuplicates, not a plain insert: the schedule row
        // above is now written FIRST, which opens a window where a fast
        // outstand-webhook delivery matches it and upserts its OWN (fuller —
        // caption/hashtags/format/scheduled_at/published_at/verified_at)
        // social_post_log row for the same (outstand_post_id, platform) keys
        // before this insert runs. A plain .insert() would then fail the
        // whole batch with 23505 on a path that actually succeeded — the
        // webhook's row is a strict superset and already resolves the same
        // post_type (Task 2), so nothing is lost, but a benign race would
        // read as a hard failure to anyone triaging this log. ON CONFLICT DO
        // NOTHING (ignoreDuplicates: true, not a full upsert) skips only the
        // rows the webhook already won, without an UPDATE that would need a
        // privilege this table's RLS doesn't grant clients (INSERT + SELECT
        // only, verified against prod — no UPDATE policy on social_post_log).
        const { error: logError } = await supabase
          .from('social_post_log')
          .upsert(rows, { onConflict: 'outstand_post_id,platform', ignoreDuplicates: true });
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
