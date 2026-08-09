import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authorizeCampaignHook } from './authz.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface HookRequest {
  campaign_id: string;
  stage: number;
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Social-account manager route for one of THIS function's parties.
 *
 * Note the vocabulary: `parties[]` below uses 'restaurant' | 'brand' | 'creator',
 * which is neither the profile roles ('business_client' | 'content_creator' |
 * 'brand') that routes.ts's socialRoute() expects, nor interchangeable with them.
 * Mapping locally keeps the two from being silently conflated.
 *
 * 'brand' used to fall through to the business branch, so a brand sponsor's
 * "Connect Outstand" / "Review Draft" CTA pointed at /dashboard/business/social —
 * which sits behind BusinessRoute and redirects a brand user away. Caught by
 * Codex on the primary CTA; the two secondary CTAs carried it already.
 */
function partySocialRoute(partyRole: string): string {
  if (partyRole === 'creator') return '/dashboard/creator/social';
  if (partyRole === 'brand') return '/dashboard/brand/social';
  return '/dashboard/business/social'; // 'restaurant'
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

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { campaign_id, stage } = (await req.json()) as HookRequest;

    // --- Authorization -------------------------------------------------------
    // Service-role function acting on a body-supplied `campaign_id`, with no caller check before
    // this change — and `verify_jwt=true` does not gate it, because the anon key is a valid JWT
    // that ships in the frontend bundle. With `stage: 4` on someone else's campaign it minted
    // 1-hour signed Storage URLs over THAT campaign's private deliverables and persisted them into
    // `donny_scheduled_posts.media_urls` for every party, behind a "Post Now" nudge — content the
    // owner never approved, one tap from a live social account. See [[Service-Role Data Exposure]].
    //
    // Identity is resolved FIRST, before the campaign is ever read, so an anonymous caller cannot
    // use 404-vs-403 as an existence oracle on a campaign id (a private crew campaign id in
    // particular), and cannot make us run a service-role query on an id of their choosing.
    // Rules live in ./authz.ts (pure + unit-tested) — and deliberately NOT in
    // `_shared/campaign-access.ts`, which answers a READ question; see that file's header.
    const unauthorized = (status: 401 | 403) =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    let callerId: string | null = null;
    if (token) {
      const anon = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
      const { data: userData } = await anon.auth.getUser(token);
      callerId = userData?.user?.id ?? null;
    }
    if (!callerId) return unauthorized(401);

    // Error BOUND, not discarded. A failed lookup still resolves to `campaign = null` and is
    // answered 403 by the gate below — that fail-closed shape is deliberate and unchanged. But an
    // unbound error makes "this campaign does not exist" and "the query itself failed" identical in
    // the log too, which is exactly how a nonexistent-column 42703 hid for months in
    // send-campaign-publish-notifications (#400). The response stays silent; the log does not.
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, title, description, goals, user_id, org_id, group_id, status, org_unit_id, delivery_type, platforms, posting_preferences')
      .eq('id', campaign_id)
      .maybeSingle();

    if (campaignError) {
      console.error('[fire-campaign-social-hook] campaign lookup failed:', campaignError);
    }

    const [orgRes, sponsorRes] = await Promise.all([
      supabase.from('org_members').select('org_id')
        .eq('user_id', callerId).eq('invitation_status', 'active'),
      // Active sponsoring brand: campaign_sponsorships.brand_id → business_profiles.user_id,
      // the same hop `fire-dragonshare-social-hook` already uses to resolve its brand party.
      // The `!brand_id` hint is REQUIRED, not stylistic: campaign_sponsorships has two FKs into
      // business_profiles (brand_id and restaurant_id), so a bare `business_profiles!inner`
      // is ambiguous and PostgREST answers 300/PGRST201. supabase-js surfaces that as
      // `{ data: null }` rather than throwing, so the arm would fail closed and silently —
      // this whole branch would be dead the day BRAND_ROLE_ENABLED flips on.
      campaign
        ? supabase.from('campaign_sponsorships')
            .select('brand_id, business_profiles!brand_id!inner(user_id)')
            .eq('campaign_id', campaign.id)
            .in('status', ['active', 'accepted'])
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const sponsorUserIds = ((sponsorRes.data ?? []) as Array<{
      business_profiles?: { user_id?: string } | Array<{ user_id?: string }>;
    }>).flatMap((s) => {
      const bp = s.business_profiles;
      const rows = Array.isArray(bp) ? bp : bp ? [bp] : [];
      return rows.map((r) => r.user_id).filter((v): v is string => !!v);
    });

    const access = authorizeCampaignHook({
      campaign: campaign ? { user_id: campaign.user_id, org_id: campaign.org_id ?? null } : null,
      callerId,
      callerOrgIds: (orgRes.data ?? []).map((m: { org_id: string }) => m.org_id),
      isActiveSponsorBrand: sponsorUserIds.includes(callerId),
    });

    if (!access.ok) {
      console.warn(`[fire-campaign-social-hook] denied campaign=${campaign_id} status=${access.status}`);
      return unauthorized(access.status);
    }
    if (!campaign) return unauthorized(403); // unreachable — narrows the type for the code below
    // --- end authorization ---------------------------------------------------

    // `stage` indexes STAGE_TEMPLATES and is written straight into the row, but was never
    // validated: `STAGE_TEMPLATES[stage] ?? ''` silently accepted `stage: 99` and wrote hook rows
    // with an empty template. Checked AFTER authorization on purpose — an unauthenticated caller
    // should learn nothing from us, not even that their body was malformed.
    if (!Number.isInteger(stage) || stage < 1 || stage > 5) {
      return new Response(JSON.stringify({ error: 'stage must be an integer from 1 to 5' }), {
        status: 400,
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
            console.warn('[fire-campaign-social-hook] Caption generation failed, using template:', errMessage(captionErr));
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
            console.warn('[fire-campaign-social-hook] Time suggestion failed, using +24h default:', errMessage(schedErr));
          }

          // Every other write in this function is an upsert; this one is an INSERT.
          // `ContentReviewSection` retries the whole invoke once on failure, so a partial failure
          // AFTER the draft landed stacked a second identical draft on the retry. Latent rather
          // than live — prod currently holds 10 hook-sourced drafts across 10 distinct
          // (campaign, user) pairs, zero duplicates — but the retry that causes it is real code.
          const { data: existingDraft, error: existingDraftError } = await supabase
            .from('donny_scheduled_posts')
            .select('id')
            .eq('campaign_id', campaign_id)
            .eq('user_id', party.user_id)
            .eq('metadata->>source', 'campaign_social_hook')
            .limit(1)
            .maybeSingle();

          // Bound and logged, deliberately NOT thrown: if this lookup ever breaks, falling through
          // to the insert restores the old behaviour (a possible duplicate draft), whereas throwing
          // would skip this party's draft entirely. A duplicate is the lesser failure — this guard
          // is an optimisation, not a gate.
          if (existingDraftError) {
            console.warn(
              `[fire-campaign-social-hook] existing-draft check failed for ${party.user_id}, inserting anyway:`,
              existingDraftError,
            );
          }

          let scheduledPostId: string | null = existingDraft?.id ?? null;

          if (!scheduledPostId) {
            const { data: scheduledPost, error: draftError } = await supabase
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

            if (draftError) throw draftError;
            scheduledPostId = scheduledPost?.id ?? null;
          }

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
                    payload: { scheduled_post_id: scheduledPostId, campaign_id },
                  },
                  {
                    label: 'Review Draft',
                    variant: 'secondary',
                    action: 'navigate',
                    payload: { route: partySocialRoute(party.role) },
                  },
                ]
              : [
                  {
                    label: 'Connect Outstand',
                    variant: 'primary',
                    action: 'navigate',
                    // Was '/settings/social' — not a route (no top-level /settings/*
                    // exists), so this primary CTA 404'd outright.
                    payload: { route: partySocialRoute(party.role) },
                  },
                  {
                    label: 'Review Draft',
                    variant: 'secondary',
                    action: 'navigate',
                    payload: { route: partySocialRoute(party.role) },
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
          console.warn(`[fire-campaign-social-hook] Auto-draft failed for ${party.user_id}:`, errMessage(autoDraftErr));
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, hooks_created: rows.length, stage }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    // Logged in full, answered generically. `error.message` here is raw Postgres/runtime text —
    // the same class of string that hands a caller the schema ("column X does not exist").
    console.error('[fire-campaign-social-hook] Error:', errMessage(error), error);
    return new Response(
      JSON.stringify({ error: 'Failed to fire campaign social hook' }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
