import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkHourlyRateLimit } from '../_shared/usage-tracker.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface HookRequest {
  campaign_id: string;
  stage: number;
}

const STAGE_TEMPLATES: Record<number, string> = {
  1: 'New campaign live! {title} — share with your followers',
  2: 'Sponsorship confirmed! {brand} is backing {title}',
  3: '{creator} is creating content for {title}!',
  4: 'Content approved! Post {title} to your channels',
  5: 'Campaign wrap! {title} — check your results',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  // Authenticate before any database work. This hook is browser-invoked (ContentReviewSection,
  // useJointApproval) and had no caller check at all — yet it calls social-caption with the
  // SERVICE-ROLE bearer, so it bypasses that function's per-user auth and rate limit. Gating it
  // at its own entrance is what actually closes the LLM path; the ownership check follows once
  // the party list is known.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const callerId = userData.user.id;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { campaign_id, stage } = (await req.json()) as HookRequest;

    // `stage` is body-supplied AND selects the authorization set below (brands join at >=2,
    // creators at >=3), so it must be constrained to the five real stages. Unvalidated, a
    // string "4" satisfies the `>=` comparisons via coercion and `stage: 99` passes every
    // branch while writing a nonsense value into campaign_social_hooks.stage.
    if (typeof stage !== 'number' || !Number.isInteger(stage) || stage < 1 || stage > 5) {
      return new Response(JSON.stringify({ error: 'stage must be an integer between 1 and 5' }), {
        status: 400,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, title, description, goals, user_id, status, org_unit_id, delivery_type, platforms, posting_preferences')
      .eq('id', campaign_id)
      .single();

    if (!campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: businessProfile } = await supabase
      .from('business_profiles')
      .select('business_name, location, city, industry')
      .eq('user_id', campaign.user_id)
      .maybeSingle();

    const parties: { user_id: string; role: string }[] = [];
    const template = STAGE_TEMPLATES[stage] ?? '';

    parties.push({ user_id: campaign.user_id, role: 'restaurant' });

    if (stage >= 2) {
      const { data: sponsorships } = await supabase
        .from('campaign_sponsorships')
        .select('brand_id')
        .eq('campaign_id', campaign_id)
        .in('status', ['active', 'accepted']);

      if (sponsorships?.length) {
        const brandProfileIds = sponsorships.map((s) => s.brand_id);
        const { data: brandProfiles } = await supabase
          .from('business_profiles')
          .select('user_id')
          .in('id', brandProfileIds);

        for (const bp of brandProfiles ?? []) {
          parties.push({ user_id: bp.user_id, role: 'brand' });
        }
      }
    }

    if (stage >= 3) {
      const { data: applications } = await supabase
        .from('campaign_applications')
        .select('creator_id')
        .eq('campaign_id', campaign_id)
        .eq('status', 'accepted');

      for (const app of applications ?? []) {
        parties.push({ user_id: app.creator_id, role: 'creator' });
      }
    }

    // The caller must be a party to this campaign — its owner, an accepted sponsoring brand,
    // or an accepted creator. `parties` is exactly that set, already resolved above, so this
    // reuses the function's own notion of who is involved rather than inventing a second one.
    // Checked before the first write below.
    if (!parties.some((p) => p.user_id === callerId)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Bound replay. The campaign_social_hooks upsert is idempotent, but the caption/schedule
    // loop below re-runs on EVERY invocation — and it calls social-caption with the
    // service-role bearer, which takes that function's isService branch and so skips its
    // per-user limit. Without this, any single accepted party could replay this endpoint and
    // burn one LLM call per party per request. Attributed to the caller, so the cost lands on
    // whoever is actually driving it.
    const hookRateCheck = await checkHourlyRateLimit(supabase, callerId);
    if (!hookRateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'rate_limited', retry_after: hookRateCheck.retryAfterSeconds }),
        {
          status: 429,
          headers: {
            ...corsHeaders(req),
            'Content-Type': 'application/json',
            'Retry-After': String(hookRateCheck.retryAfterSeconds),
          },
        },
      );
    }

    const rows = parties.map((p) => ({
      campaign_id,
      stage,
      user_id: p.user_id,
      party_role: p.role,
      status: 'pending',
      content_template: template.replace('{title}', campaign.title),
      prompted_at: new Date().toISOString(),
      deliverable_id: null,
    }));

    const { error: hookError } = await supabase
      .from('campaign_social_hooks')
      .upsert(rows, { onConflict: 'campaign_id,stage,user_id,deliverable_id', ignoreDuplicates: true });

    if (hookError) throw hookError;

    if (stage === 4) {
      const creatorIds = parties.filter((p) => p.role === 'creator').map((p) => p.user_id);
      const brandId = parties.find((p) => p.role === 'brand')?.user_id ?? null;

      for (const creatorId of creatorIds) {
        await supabase.from('triple_post_sessions').upsert(
          {
            campaign_id,
            restaurant_id: campaign.user_id,
            creator_id: creatorId,
            brand_id: brandId,
            restaurant_status: 'pending',
            creator_status: 'pending',
            brand_status: brandId ? 'pending' : 'n/a',
          },
          { onConflict: 'campaign_id,creator_id', ignoreDuplicates: true },
        );
      }
    }

    // --- Stage 4 auto-draft: create scheduled post drafts + nudges ---
    if (stage === 4) {
      const hasAutoSchedule = campaign.posting_preferences?.auto_schedule_on_approval === true;
      for (const party of parties) {
        if (hasAutoSchedule && party.role === 'restaurant') continue;
        try {
          let accountQuery = supabase
            .from('business_outstand_accounts')
            .select('platform, platform_handle')
            .eq('user_id', party.user_id)
            .eq('status', 'active');

          if (campaign.org_unit_id) {
            accountQuery = accountQuery.eq('org_unit_id', campaign.org_unit_id);
          }

          const { data: outstandAccounts } = await accountQuery.limit(1);

          const outstandConnected = !!outstandAccounts?.length;
          const platform = outstandConnected
            ? outstandAccounts[0].platform
            : (campaign.platforms?.[0] ?? 'instagram');

          const { data: uploadedFiles } = await supabase
            .from('file_uploads')
            .select('file_path, bucket_name, mime_type')
            .eq('campaign_id', campaign_id)
            .eq('upload_status', 'complete')
            .limit(5);

          const mediaUrls: string[] = [];
          if (uploadedFiles?.length) {
            for (const f of uploadedFiles) {
              const { data: signedUrl } = await supabase.storage
                .from(f.bucket_name)
                .createSignedUrl(f.file_path, 3600);
              if (signedUrl?.signedUrl) mediaUrls.push(signedUrl.signedUrl);
            }
          }

          const { data: delivSpecs } = await supabase
            .from('campaign_deliverables')
            .select('content_type, platform, description')
            .eq('campaign_id', campaign_id);

          const contentType = delivSpecs?.[0]?.content_type || 'photo';
          const deliverableTypes = [...new Set(delivSpecs?.map((d) => d.content_type) ?? [])];
          const deliverableDescriptions = delivSpecs?.map((d) => d.description).filter(Boolean) ?? [];

          let caption = template;
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
                  campaign_title: campaign.title,
                  campaign_description: campaign.description || campaign.goals || '',
                  content_type: contentType,
                  party_role: party.role,
                  platform,
                  user_id: party.user_id,
                  business_name: businessProfile?.business_name || '',
                  business_location: businessProfile?.city || businessProfile?.location || '',
                  business_category: businessProfile?.industry || '',
                  deliverable_types: deliverableTypes,
                  campaign_goals: campaign.goals || '',
                  deliverable_descriptions: deliverableDescriptions,
                }),
              },
            );
            if (captionResp.ok) {
              const captionData = await captionResp.json();
              caption = captionData.caption || caption;
              hashtags = captionData.hashtags || [];
            }
          } catch (captionErr) {
            console.warn('[fire-campaign-social-hook] Caption generation failed, using template:', captionErr.message);
          }

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
                  content_type: contentType,
                }),
              },
            );
            if (scheduleResp.ok) {
              const scheduleData = await scheduleResp.json();
              const suggestedTime =
                scheduleData.data?.slots?.[0]?.datetime ??
                scheduleData.suggestions?.[0]?.time;
              if (suggestedTime) {
                scheduledAt = suggestedTime;
              }
            }
          } catch (schedErr) {
            console.warn('[fire-campaign-social-hook] Time suggestion failed, using +24h default:', schedErr.message);
          }

          const { data: scheduledPost } = await supabase
            .from('donny_scheduled_posts')
            .insert({
              user_id: party.user_id,
              campaign_id,
              platform,
              content_type: contentType,
              caption,
              media_urls: mediaUrls,
              hashtags,
              scheduled_at: scheduledAt,
              status: 'draft',
              ai_suggested_time: true,
              ai_reasoning: scheduledAt !== new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                ? 'Donny picked the optimal posting time for your audience'
                : 'Auto-drafted by campaign social hook (stage 4)',
              metadata: { source: 'campaign_social_hook', stage: 4, outstand_connected: outstandConnected },
            })
            .select('id')
            .single();

          const { data: hookRow } = await supabase
            .from('campaign_social_hooks')
            .select('id')
            .eq('campaign_id', campaign_id)
            .eq('stage', 4)
            .eq('user_id', party.user_id)
            .single();

          if (hookRow) {
            const nudgeActions = outstandConnected
              ? [
                  {
                    label: 'Post Now',
                    variant: 'primary',
                    action: 'post_now',
                    payload: { scheduled_post_id: scheduledPost?.id ?? null, campaign_id },
                  },
                  {
                    label: 'Review Draft',
                    variant: 'secondary',
                    action: 'navigate',
                    payload: { route: party.role === 'creator' ? '/dashboard/creator/social' : '/dashboard/business/social' },
                  },
                ]
              : [
                  {
                    label: 'Connect Outstand',
                    variant: 'primary',
                    action: 'navigate',
                    payload: { route: '/settings/social' },
                  },
                  {
                    label: 'Review Draft',
                    variant: 'secondary',
                    action: 'navigate',
                    payload: { route: party.role === 'creator' ? '/dashboard/creator/social' : '/dashboard/business/social' },
                  },
                ];

            await supabase.from('donny_nudges').upsert(
              {
                user_id: party.user_id,
                type: 'content',
                priority: 'high',
                source_table: 'campaign_social_hooks',
                source_id: hookRow.id,
                summary: outstandConnected
                  ? 'Your campaign content is ready to share!'
                  : 'Your campaign draft is ready — connect Outstand to schedule it.',
                actions: nudgeActions,
              },
              { onConflict: 'user_id,source_table,source_id', ignoreDuplicates: true },
            );
          }
        } catch (autoDraftErr) {
          console.warn(`[fire-campaign-social-hook] Auto-draft failed for ${party.user_id}:`, autoDraftErr.message);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, hooks_created: rows.length, stage }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
