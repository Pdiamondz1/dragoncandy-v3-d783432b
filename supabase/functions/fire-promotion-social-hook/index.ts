import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface HookRequest {
  promotion_id: string;
  submission_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { promotion_id, submission_id } = (await req.json()) as HookRequest;

    // 1. Fetch promotion
    const { data: promotion } = await supabase
      .from('promotions')
      .select('id, title, description, user_id')
      .eq('id', promotion_id)
      .single();

    if (!promotion) {
      return new Response(JSON.stringify({ error: 'Promotion not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // AUTHORIZATION. The function authenticated the caller above but never checked they OWN this
    // promotion — authenticating is not authorizing. Any signed-in user could drive a draft and a
    // high-priority nudge into the promotion owner's account carrying that submission's
    // `video_url` and `customer_name`, and bill the caption to the owner's `donny_cost_ledger`.
    // `promotions` has no `org_id` (only `user_id` and `business_id`), so ownership is the whole
    // predicate here. See [[Service-Role Data Exposure]].
    if (promotion.user_id !== user.id) {
      console.warn(`[fire-promotion-social-hook] denied promotion=${promotion_id}`);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch submission — PINNED to this promotion. Fetching by `submission_id` alone left the
    // two ids unpaired, so an owner could pull a DIFFERENT promotion's submission (its customer
    // name and video) into their own draft. Same defect shape as the boost/post pair in
    // `fire-dragonshare-social-hook`.
    const { data: submission } = await supabase
      .from('promotion_submissions')
      .select('id, video_url, customer_name, social_handles')
      .eq('id', submission_id)
      .eq('promotion_id', promotion_id)
      .maybeSingle();

    if (!submission) {
      return new Response(JSON.stringify({ error: 'Submission not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const businessUserId = promotion.user_id;

    // 3. Check business Outstand account
    const { data: outstandAccounts } = await supabase
      .from('business_outstand_accounts')
      .select('platform, platform_handle')
      .eq('user_id', businessUserId)
      .limit(1);

    if (!outstandAccounts?.length) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'No Outstand account connected' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    const platform = outstandAccounts[0].platform;

    // 4. Collect media URL (video_url is already a full public URL from Supabase storage)
    const mediaUrls: string[] = [];
    if (submission.video_url) {
      mediaUrls.push(submission.video_url);
    }

    // 5. Generate AI caption
    let caption = `Check out this amazing customer video! ${promotion.title}`;
    let hashtags: string[] = [];
    try {
      const captionResp = await fetch(
        `${SUPABASE_URL}/functions/v1/social-caption`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            campaign_title: promotion.title,
            campaign_description: promotion.description || '',
            content_type: 'video',
            party_role: 'restaurant',
            platform,
            user_id: businessUserId,
            source: 'promotion',
            context: {
              customer_name: submission.customer_name,
              promotion_title: promotion.title,
            },
          }),
        },
      );
      if (captionResp.ok) {
        const captionData = await captionResp.json();
        caption = captionData.caption || caption;
        hashtags = captionData.hashtags || [];
      }
    } catch (captionErr) {
      console.warn('[fire-promotion-social-hook] Caption generation failed, using template:', captionErr.message);
    }

    // 6. Get optimal posting time
    let scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try {
      const scheduleResp = await fetch(
        `${SUPABASE_URL}/functions/v1/donny-schedule`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            action: 'suggest_times',
            platform,
            content_type: 'video',
          }),
        },
      );
      if (scheduleResp.ok) {
        const scheduleData = await scheduleResp.json();
        if (scheduleData.suggestions?.[0]?.time) {
          scheduledAt = scheduleData.suggestions[0].time;
        }
      }
    } catch (schedErr) {
      console.warn('[fire-promotion-social-hook] Time suggestion failed, using +24h default:', schedErr.message);
    }

    // 7. Insert draft post
    const { data: scheduledPost } = await supabase
      .from('donny_scheduled_posts')
      .insert({
        user_id: businessUserId,
        campaign_id: null,
        platform,
        content_type: 'video',
        caption,
        media_urls: mediaUrls,
        hashtags,
        scheduled_at: scheduledAt,
        status: 'draft',
        ai_suggested_time: true,
        ai_reasoning: 'Auto-drafted by promotion social hook (UGC approval)',
        metadata: { source: 'promotion_social_hook', promotion_id, submission_id },
      })
      .select('id')
      .single();

    // 8. Insert nudge
    await supabase.from('donny_nudges').upsert(
      {
        user_id: businessUserId,
        type: 'content',
        priority: 'high',
        source_table: 'promotion_submissions',
        source_id: submission_id,
        summary: 'Customer video approved — share it on your socials!',
        actions: [
          {
            label: 'Post Now',
            variant: 'primary',
            action: 'post_now',
            payload: {
              scheduled_post_id: scheduledPost?.id ?? null,
            },
          },
          {
            label: 'Review Draft',
            variant: 'secondary',
            action: 'navigate',
            payload: {
              route: '/dashboard/business/social',
            },
          },
        ],
      },
      { onConflict: 'user_id,source_table,source_id', ignoreDuplicates: true },
    );

    return new Response(
      JSON.stringify({ ok: true, draft_id: scheduledPost?.id }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[fire-promotion-social-hook] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
