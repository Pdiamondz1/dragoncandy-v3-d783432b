import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { campaign_id, file_ids } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'campaign_id required' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: campaign, error: campaignError } = await adminClient
      .from('campaigns')
      .select('id, user_id')
      .eq('id', campaign_id)
      .single();

    let hasAccess = campaign && campaign.user_id === user.id;
    if (campaign && !hasAccess) {
      const { data: fullCampaign } = await adminClient
        .from('campaigns')
        .select('org_id')
        .eq('id', campaign_id)
        .single();
      if (fullCampaign?.org_id) {
        const { data: membership } = await adminClient
          .from('org_members')
          .select('id')
          .eq('org_id', fullCampaign.org_id)
          .eq('user_id', user.id)
          .eq('invitation_status', 'active')
          .maybeSingle();
        hasAccess = !!membership;
      }
    }

    if (campaignError || !campaign || !hasAccess) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: collabs } = await adminClient
      .from('campaign_collaborations')
      .select('id, creator_id, deliverables_status')
      .eq('campaign_id', campaign_id)
      .in('status', ['active', 'completed']);

    let fileQuery = adminClient
      .from('file_uploads')
      .select('id, file_path, bucket_name, original_filename, uploaded_by, created_at')
      .eq('campaign_id', campaign_id)
      .eq('file_category', 'deliverable')
      .order('created_at', { ascending: false });

    if (file_ids?.length) {
      fileQuery = fileQuery.in('id', file_ids);
    }

    const { data: files, error: fileError } = await fileQuery;
    if (fileError) throw fileError;

    const approvedFiles: typeof files = [];
    for (const collab of collabs ?? []) {
      const ds = collab.deliverables_status as Record<string, string> | null;
      if (!ds) continue;
      const dsKeys = Object.keys(ds);
      const creatorFiles = (files ?? [])
        .filter(f => f.uploaded_by === collab.creator_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      for (let i = 0; i < creatorFiles.length; i++) {
        const status = i < dsKeys.length ? ds[dsKeys[i]] : null;
        if (status === 'approved' || status === 'auto_approved') {
          approvedFiles.push(creatorFiles[i]);
        }
      }
    }

    if (approvedFiles.length === 0) {
      return new Response(JSON.stringify({ error: 'No approved files to download' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (approvedFiles.length === 1) {
      const file = approvedFiles[0];
      const { data: signed } = await adminClient.storage
        .from(file.bucket_name)
        .createSignedUrl(file.file_path, 3600, { download: true });

      return new Response(JSON.stringify({ download_url: signed?.signedUrl }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const downloadUrls: { filename: string; url: string }[] = [];
    for (const file of approvedFiles) {
      const { data: signed } = await adminClient.storage
        .from(file.bucket_name)
        .createSignedUrl(file.file_path, 3600, { download: true });
      if (signed?.signedUrl) {
        downloadUrls.push({ filename: file.original_filename, url: signed.signedUrl });
      }
    }

    return new Response(JSON.stringify({ download_urls: downloadUrls }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
