// confirm-posting-schedule — queues all draft posts in a plan group with
// Outstand via the outstand-proxy edge function, then updates post statuses
// and the campaign's posting_schedule_status.
//
// ENV required:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { resolveProviderFromRows, resolveProviderId } from '../_shared/social-provider.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ConfirmRequest {
  plan_group_id: string;
  campaign_id: string;
}

interface DraftPost {
  id: string;
  user_id: string;
  platform: string;
  content_type: string;
  caption: string | null;
  media_urls: string[] | null;
  hashtags: string[] | null;
  scheduled_at: string;
  metadata: Record<string, unknown> | null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'No authorization header' }),
      { status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Validate the user JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (!user || authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const body = (await req.json()) as ConfirmRequest;
    const { plan_group_id, campaign_id } = body;

    if (!plan_group_id || !campaign_id) {
      return new Response(
        JSON.stringify({ error: 'plan_group_id and campaign_id are required' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch the caller's draft posts in this plan group.
    //
    // SCOPED BY user.id — this uses the service-role client, which bypasses RLS
    // entirely, so `plan_group_id` alone (a value taken straight from the request
    // body) was the only thing selecting rows. Any authenticated caller who knew
    // or guessed another user's plan_group_id could read their drafts, force them
    // to `failed`, and receive their post ids and platforms back in `failed_posts`.
    // Only the UUID's secrecy stood in the way, which is not an authorization check.
    const { data: drafts, error: fetchError } = await admin
      .from('donny_scheduled_posts')
      .select('id, user_id, platform, content_type, caption, media_urls, hashtags, scheduled_at, metadata')
      .eq('plan_group_id', plan_group_id)
      .eq('user_id', user.id)
      .eq('status', 'draft');

    if (fetchError) {
      console.error('[confirm-posting-schedule] Failed to fetch drafts:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch draft posts', detail: fetchError.message }),
        { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    if (!drafts || drafts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No draft posts found for this plan group' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // The drafts query is now scoped to the caller, so this IS the caller. Derive
    // it from `user` rather than from drafts[0]: `donny_scheduled_posts`'s INSERT
    // policy is `WITH CHECK (user_id = auth.uid())` with NO constraint on
    // plan_group_id, so another user can attach a row to someone else's plan
    // group — and first-row-wins would then have let that row decide whose social
    // accounts EVERY post in the group was queued against.
    const draftOwnerId = user.id;

    // Fetch the campaign owner's connected social accounts.
    const { data: accounts, error: accountsError } = await admin
      .from('business_outstand_accounts')
      .select('outstand_social_account_id, platform, provider, status')
      .eq('user_id', draftOwnerId)
      .neq('status', 'revoked');

    if (accountsError) {
      console.error('[confirm-posting-schedule] Failed to fetch accounts:', accountsError);
    }

    // Account ids are only opaque WITHIN a provider, so a mixed row set must be
    // narrowed to ONE provider before mapping platform -> account. This builder
    // previously took the last row per platform with no provider filter, which
    // during a cutover window silently picked whichever row the DB happened to
    // return last — and handed one provider's id to the other's API.
    //
    // Uses the SAME resolveProviderFromRows rule as the social-proxy gateway
    // (now in _shared/, so the two cannot drift into disagreeing about which
    // provider a user is on) and prefers an active row over an errored one.
    const rows = (accounts ?? []) as Array<{
      outstand_social_account_id: string;
      platform: string;
      provider: string | null;
      status: string;
    }>;
    const activeProvider = resolveProviderFromRows(rows);

    // FAIL CLOSED on a non-Outstand provider. Everything below queues through
    // `outstand-proxy` unconditionally, so selecting (say) Zernio rows here would
    // hand Zernio account ids to Outstand's API — the exact cross-provider
    // confusion the narrowing above exists to prevent, just one layer down.
    //
    // This path is Outstand-specific by construction, so it says so rather than
    // pretending to be provider-agnostic. If we ever route a second provider's
    // posting through here, dispatch via social-proxy `createPost` instead of
    // widening this check.
    if (activeProvider !== 'outstand') {
      console.error(
        `[confirm-posting-schedule] refusing to queue: owner resolves to provider '${activeProvider}', but this path posts only via outstand-proxy`,
      );
      return new Response(
        JSON.stringify({
          error: 'unsupported_provider',
          detail: `Scheduling through this flow supports Outstand accounts only (owner resolved to '${activeProvider}').`,
        }),
        { status: 409, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    const platformAccountMap: Record<string, string> = {};
    for (const acct of rows) {
      if (resolveProviderId(acct.provider) !== activeProvider) continue;
      const incumbent = platformAccountMap[acct.platform];
      if (incumbent && acct.status !== 'active') continue;
      platformAccountMap[acct.platform] = acct.outstand_social_account_id;
    }

    const posts = drafts as DraftPost[];
    let scheduledCount = 0;
    let failedCount = 0;
    const failedPosts: Array<{ id: string; platform: string; reason: string }> = [];

    // Queue each draft post with Outstand via outstand-proxy
    for (const post of posts) {
      if (!platformAccountMap[post.platform]) {
        await admin
          .from('donny_scheduled_posts')
          .update({
            status: 'failed',
            metadata: {
              ...(post.metadata ?? {}),
              outstand_error: 'no_connected_account_for_platform',
              failed_at: new Date().toISOString(),
            },
          })
          .eq('id', post.id);
        failedPosts.push({ id: post.id, platform: post.platform, reason: 'no_connected_account_for_platform' });
        failedCount++;
        continue;
      }

      try {
        const outstandResp = await fetch(`${SUPABASE_URL}/functions/v1/outstand-proxy/v1/posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            caption: post.caption,
            media_urls: post.media_urls,
            platform: post.platform,
            content_type: post.content_type,
            scheduled_at: post.scheduled_at,
            hashtags: post.hashtags,
            social_account_ids: [platformAccountMap[post.platform]],
          }),
        });

        if (outstandResp.ok) {
          const outstandData = await outstandResp.json().catch(() => null);
          const outstandPostId = outstandData?.data?.post?.id ?? outstandData?.post?.id ?? null;

          const { error: updateError } = await admin
            .from('donny_scheduled_posts')
            .update({
              status: 'scheduled',
              metadata: {
                ...(post.metadata ?? {}),
                outstand_response: outstandData,
                outstand_post_id: outstandPostId,
                confirmed_at: new Date().toISOString(),
              },
            })
            .eq('id', post.id);

          if (updateError) {
            console.error(`[confirm-posting-schedule] Failed to update post ${post.id} to scheduled:`, updateError);
            failedCount++;
          } else {
            scheduledCount++;
          }
        } else {
          const errText = await outstandResp.text().catch(() => '');
          console.error(`[confirm-posting-schedule] Outstand failed for post ${post.id}: ${outstandResp.status} ${errText.slice(0, 300)}`);

          await admin
            .from('donny_scheduled_posts')
            .update({
              status: 'failed',
              metadata: {
                ...(post.metadata ?? {}),
                outstand_error: errText.slice(0, 500),
                outstand_status: outstandResp.status,
                failed_at: new Date().toISOString(),
              },
            })
            .eq('id', post.id);

          failedCount++;
        }
      } catch (postErr) {
        console.error(`[confirm-posting-schedule] Exception scheduling post ${post.id}:`, postErr);

        await admin
          .from('donny_scheduled_posts')
          .update({
            status: 'failed',
            metadata: {
              ...(post.metadata ?? {}),
              outstand_error: String(postErr),
              failed_at: new Date().toISOString(),
            },
          })
          .eq('id', post.id)
          .catch((e) => console.error('[confirm-posting-schedule] Could not update failed post:', e));

        failedCount++;
      }
    }

    // Update campaign posting_schedule_status
    const campaignStatus = failedCount > 0 && scheduledCount === 0
      ? 'failed'
      : failedCount > 0
        ? 'in_progress'
        : 'scheduled';

    // Scoped to the caller's own campaign. `campaign_id` comes from the request
    // body and was previously written with the service-role client with no owner
    // check at all, so any authenticated caller could flip another user's
    // posting_schedule_status — and campaign ids are discoverable in browse.
    const { error: campaignUpdateError } = await admin
      .from('campaigns')
      .update({ posting_schedule_status: campaignStatus })
      .eq('id', campaign_id)
      .eq('user_id', user.id);

    if (campaignUpdateError) {
      console.error('[confirm-posting-schedule] Failed to update campaign status:', campaignUpdateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        scheduled_count: scheduledCount,
        failed_count: failedCount,
        failed_posts: failedPosts,
        campaign_status: campaignStatus,
      }),
      { status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[confirm-posting-schedule] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
