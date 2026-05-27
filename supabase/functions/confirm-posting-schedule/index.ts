// confirm-posting-schedule — queues all draft posts in a plan group with
// Outstand via the outstand-proxy edge function, then updates post statuses
// and the campaign's posting_schedule_status.
//
// ENV required:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ConfirmRequest {
  plan_group_id: string;
  campaign_id: string;
}

interface DraftPost {
  id: string;
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

    // Fetch all draft posts in this plan group
    const { data: drafts, error: fetchError } = await admin
      .from('donny_scheduled_posts')
      .select('id, platform, content_type, caption, media_urls, hashtags, scheduled_at, metadata')
      .eq('plan_group_id', plan_group_id)
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

    const posts = drafts as DraftPost[];
    let scheduledCount = 0;
    let failedCount = 0;

    // Queue each draft post with Outstand via outstand-proxy
    for (const post of posts) {
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
          }),
        });

        if (outstandResp.ok) {
          const outstandData = await outstandResp.json().catch(() => null);

          const { error: updateError } = await admin
            .from('donny_scheduled_posts')
            .update({
              status: 'scheduled',
              metadata: {
                ...(post.metadata ?? {}),
                outstand_response: outstandData,
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

    const { error: campaignUpdateError } = await admin
      .from('campaigns')
      .update({ posting_schedule_status: campaignStatus })
      .eq('id', campaign_id);

    if (campaignUpdateError) {
      console.error('[confirm-posting-schedule] Failed to update campaign status:', campaignUpdateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        scheduled_count: scheduledCount,
        failed_count: failedCount,
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
