import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;

    const { file_path, bucket_name, collaboration_id } = await req.json();
    if (!file_path || !bucket_name || !collaboration_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to check collaboration
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify user is a participant in the collaboration
    const { data: collab, error: collabError } = await adminClient
      .from('campaign_collaborations')
      .select('id, content_status, creator_id, campaign_id, campaigns!inner(user_id)')
      .eq('id', collaboration_id)
      .single();

    if (collabError || !collab) {
      return new Response(JSON.stringify({ error: 'Collaboration not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isCreator = collab.creator_id === userId;
    const isBusiness = (collab as any).campaigns?.user_id === userId;
    if (!isCreator && !isBusiness) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isApproved = collab.content_status === 'approved';

    // If approved or if user is the creator (they own the content), provide download URL
    if (isApproved || isCreator) {
      const { data: signedData, error: signError } = await adminClient.storage
        .from(bucket_name)
        .createSignedUrl(file_path, 3600);

      if (signError) {
        return new Response(JSON.stringify({ error: 'Failed to generate URL' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        signed_url: signedData.signedUrl,
        can_download: true,
        content_status: collab.content_status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Not approved and user is business - provide preview-only URL (no download)
    const { data: signedData, error: signError } = await adminClient.storage
      .from(bucket_name)
      .createSignedUrl(file_path, 3600);

    if (signError) {
      return new Response(JSON.stringify({ error: 'Failed to generate preview URL' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      signed_url: signedData.signedUrl,
      can_download: false,
      content_status: collab.content_status,
      message: 'Preview only. Download available after content approval.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
