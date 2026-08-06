import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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
      const outstandPostId = (data.id ?? (data.data as Record<string, unknown>)?.id ?? 'unknown') as string;

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
      if (platforms.length > 0) {
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
