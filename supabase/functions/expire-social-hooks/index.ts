import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const { data: expiredHooks, error: hookErr } = await supabase
      .from('campaign_social_hooks')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .select('id');

    if (hookErr) throw hookErr;

    let revokedCount = 0;

    const { data: completedCampaigns } = await supabase
      .from('campaigns')
      .select('id')
      .in('status', ['completed', 'cancelled']);

    if (completedCampaigns?.length) {
      const { data: revoked } = await supabase
        .from('delegated_posting_permissions')
        .update({ status: 'revoked' })
        .eq('status', 'active')
        .in('campaign_id', completedCampaigns.map((c) => c.id))
        .select('id');

      revokedCount += revoked?.length ?? 0;
    }

    const { data: expiredPerms } = await supabase
      .from('delegated_posting_permissions')
      .update({ status: 'revoked' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    revokedCount += expiredPerms?.length ?? 0;

    return new Response(
      JSON.stringify({
        ok: true,
        expired_hooks: expiredHooks?.length ?? 0,
        revoked_permissions: revokedCount,
      }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
