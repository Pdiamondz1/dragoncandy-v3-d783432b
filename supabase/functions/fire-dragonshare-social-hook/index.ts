import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { isAuthorizedIngest } from '../_shared/ingest-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface HookRequest {
  boost_id: string;
  post_id: string;
}

function getNudgeSummary(role: string, creatorName: string, businessName: string): string {
  if (role === 'restaurant') return `You boosted @${creatorName}'s post — amplify it on your channels!`;
  if (role === 'creator') return `Your post got boosted by ${businessName} — cross-post it!`;
  return 'Sponsored content is live — amplify it!';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  // Service-role only. Its sole caller is `_shared/fulfill-boost.ts`, which already sends
  // `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` — so this guard needs no caller change. Nothing in
  // `src/` invokes it. Without it the function read no Authorization header at all, and
  // `verify_jwt=true` is not a gate here because the anon key is a valid JWT that ships in the
  // frontend bundle: anyone could plant scheduled-post drafts and nudges, carrying another
  // tenant's caption and media URL, into three users' accounts. See [[Service-Role Data Exposure]].
  if (!isAuthorizedIngest(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { boost_id, post_id } = (await req.json()) as HookRequest;

    // 1. Fetch boost
    const { data: boost } = await supabase
      .from('dragonshare_boosts')
      .select('id, boosting_org_id, boosting_user_id')
      .eq('id', boost_id)
      .single();

    if (!boost) {
      return new Response(JSON.stringify({ error: 'Boost not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch post
    const { data: post } = await supabase
      .from('dragonshare_posts')
      .select('id, creator_id, target_org_id, post_url, screenshot_url, content_file_path, caption, platform, content_type, hashtags, mentions')
      .eq('id', post_id)
      .single();

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 3. Resolve parties
    const parties: { user_id: string; role: string }[] = [];

    // Business: owner of boosting org
    const { data: orgOwner } = await supabase
      .from('org_members')
      .select('user_id')
      .eq('org_id', boost.boosting_org_id)
      .eq('role', 'owner')
      .eq('invitation_status', 'active')
      .limit(1)
      .single();

    if (orgOwner) {
      parties.push({ user_id: orgOwner.user_id, role: 'restaurant' });
    }

    // Creator
    parties.push({ user_id: post.creator_id, role: 'creator' });

    // Brand (best-effort): org owner → campaigns → active sponsorships → brand user
    if (orgOwner) {
      try {
        const { data: orgCampaigns } = await supabase
          .from('campaigns')
          .select('id')
          .eq('user_id', orgOwner.user_id)
          .limit(10);

        if (orgCampaigns?.length) {
          const campaignIds = orgCampaigns.map((c) => c.id);
          const { data: sponsorships } = await supabase
            .from('campaign_sponsorships')
            .select('brand_id')
            .in('campaign_id', campaignIds)
            .in('status', ['active', 'accepted'])
            .limit(1);

          if (sponsorships?.length) {
            const { data: brandProfile } = await supabase
              .from('business_profiles')
              .select('user_id')
              .eq('id', sponsorships[0].brand_id)
              .single();

            if (brandProfile) {
              parties.push({ user_id: brandProfile.user_id, role: 'brand' });
            }
          }
        }
      } catch (brandErr) {
        console.warn('[fire-dragonshare-social-hook] Brand resolution failed (best-effort):', brandErr.message);
      }
    }

    // Fetch business name and creator name for caption context
    const { data: businessProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', orgOwner?.user_id ?? boost.boosting_user_id)
      .single();

    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', post.creator_id)
      .single();

    const businessName = businessProfile?.full_name || 'Business';
    const creatorName = creatorProfile?.full_name || 'Creator';

    const ROLE_ROUTES: Record<string, string> = {
      restaurant: '/dashboard/business/social',
      creator: '/dashboard/creator/social',
      brand: '/dashboard/brand/social',
    };

    let draftsCreated = 0;

    // 4. For each party: check Outstand, generate caption, create draft + nudge
    for (const party of parties) {
      try {
        const { data: outstandAccounts } = await supabase
          .from('business_outstand_accounts')
          .select('platform, platform_handle')
          .eq('user_id', party.user_id)
          .limit(1);

        if (!outstandAccounts?.length) continue;

        const platform = outstandAccounts[0].platform;

        // Generate AI caption
        let caption = post.caption || `Amazing content from ${creatorName}!`;
        let hashtags: string[] = post.hashtags || [];
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
                campaign_title: post.caption || 'DragonShare content',
                campaign_description: '',
                content_type: post.content_type || 'photo',
                party_role: party.role,
                platform,
                user_id: party.user_id,
                source: 'dragonshare',
                context: {
                  creator_name: creatorName,
                  business_name: businessName,
                },
              }),
            },
          );
          if (captionResp.ok) {
            const captionData = await captionResp.json();
            caption = captionData.caption || caption;
            hashtags = captionData.hashtags || hashtags;
          }
        } catch (captionErr) {
          console.warn(`[fire-dragonshare-social-hook] Caption failed for ${party.role}:`, captionErr.message);
        }

        // Get optimal posting time
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
                content_type: post.content_type || 'photo',
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
          console.warn(`[fire-dragonshare-social-hook] Schedule failed for ${party.role}:`, schedErr.message);
        }

        // Build media URLs — prefer the uploaded content file (direct uploads),
        // then screenshot, then the external post URL.
        const mediaUrls: string[] = [];
        if (post.content_file_path) {
          mediaUrls.push(post.content_file_path);
        } else if (post.screenshot_url) {
          mediaUrls.push(post.screenshot_url);
        } else if (post.post_url) {
          mediaUrls.push(post.post_url);
        }

        // Insert draft post
        const { data: scheduledPost } = await supabase
          .from('donny_scheduled_posts')
          .insert({
            user_id: party.user_id,
            campaign_id: null,
            platform,
            content_type: post.content_type || 'photo',
            caption,
            media_urls: mediaUrls,
            hashtags,
            scheduled_at: scheduledAt,
            status: 'draft',
            ai_suggested_time: true,
            ai_reasoning: 'Auto-drafted by DragonShare social hook (boost)',
            metadata: { source: 'dragonshare_social_hook', boost_id, post_id },
          })
          .select('id')
          .single();

        // Insert nudge
        await supabase.from('donny_nudges').upsert(
          {
            user_id: party.user_id,
            type: 'content',
            priority: 'high',
            source_table: 'dragonshare_boosts',
            source_id: boost_id,
            summary: getNudgeSummary(party.role, creatorName, businessName),
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
                  route: ROLE_ROUTES[party.role] || '/dashboard/business/social',
                },
              },
            ],
          },
          { onConflict: 'user_id,source_table,source_id', ignoreDuplicates: true },
        );

        draftsCreated++;
      } catch (partyErr) {
        console.warn(`[fire-dragonshare-social-hook] Failed for ${party.role} (${party.user_id}):`, partyErr.message);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, drafts_created: draftsCreated, parties: parties.length }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[fire-dragonshare-social-hook] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
