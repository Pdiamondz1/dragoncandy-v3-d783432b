import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { campaign_id, stage } = (await req.json()) as HookRequest;

  // Get campaign details
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, title, user_id, status')
    .eq('id', campaign_id)
    .single();

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const parties: { user_id: string; role: string }[] = [];
  const template = STAGE_TEMPLATES[stage] ?? '';

  // Restaurant (campaign owner) — prompted at all stages
  parties.push({ user_id: campaign.user_id, role: 'restaurant' });

  // Brand sponsor — resolve user_id through business_profiles
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

  // Creator — resolve from accepted applications
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

  // Insert hook records (upsert to handle re-fires)
  const rows = parties.map((p) => ({
    campaign_id,
    stage,
    user_id: p.user_id,
    party_role: p.role,
    status: 'pending',
    content_template: template.replace('{title}', campaign.title),
    prompted_at: new Date().toISOString(),
  }));

  const { error: hookError } = await supabase
    .from('campaign_social_hooks')
    .upsert(rows, { onConflict: 'campaign_id,stage,user_id', ignoreDuplicates: true });

  // For Stage 4: also create triple_post_session
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

  return new Response(
    JSON.stringify({ ok: true, hooks_created: rows.length, stage }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
