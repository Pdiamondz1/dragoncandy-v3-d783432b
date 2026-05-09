import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Expire hooks older than 72 hours that are still pending
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data: expiredHooks, error: hookErr } = await supabase
    .from('campaign_social_hooks')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('id');

  // Revoke delegated permissions for completed/cancelled campaigns
  const { data: revokedPerms, error: permErr } = await supabase.rpc('revoke_expired_permissions');

  // If the RPC doesn't exist yet, do it inline
  if (permErr) {
    const { data: completedCampaigns } = await supabase
      .from('campaigns')
      .select('id')
      .in('status', ['completed', 'cancelled']);

    if (completedCampaigns?.length) {
      await supabase
        .from('delegated_posting_permissions')
        .update({ status: 'revoked' })
        .eq('status', 'active')
        .in('campaign_id', completedCampaigns.map((c) => c.id));
    }

    // Also expire by expires_at timestamp
    await supabase
      .from('delegated_posting_permissions')
      .update({ status: 'revoked' })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());
  }

  return new Response(
    JSON.stringify({
      ok: true,
      expired_hooks: expiredHooks?.length ?? 0,
      revoked_permissions: revokedPerms?.length ?? 0,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
