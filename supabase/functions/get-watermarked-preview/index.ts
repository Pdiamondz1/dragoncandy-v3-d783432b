import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
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

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const userId = user.id;

    const { file_path, bucket_name, collaboration_id } = await req.json();
    if (!file_path || !bucket_name || !collaboration_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Use service role to check collaboration
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify user is a participant in the collaboration
    const { data: collab, error: collabError } = await adminClient
      .from('campaign_collaborations')
      .select('id, content_status, creator_id, campaign_id, dispute_outcome, campaigns!inner(user_id)')
      .eq('id', collaboration_id)
      .single();

    if (collabError || !collab) {
      return new Response(JSON.stringify({ error: 'Collaboration not found' }), {
        status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const isCreator = collab.creator_id === userId;
    let isBusiness = (collab as any).campaigns?.user_id === userId;

    // Check org membership — other team members at the same org get business-level access
    if (!isCreator && !isBusiness) {
      const { data: campaign } = await adminClient
        .from('campaigns')
        .select('org_id')
        .eq('id', collab.campaign_id)
        .single();
      if (campaign?.org_id) {
        const { data: membership } = await adminClient
          .from('org_members')
          .select('id')
          .eq('org_id', campaign.org_id)
          .eq('user_id', userId)
          .eq('invitation_status', 'active')
          .maybeSingle();
        isBusiness = !!membership;
      }
    }

    // Check brand access via campaign sponsorships
    let isBrand = false;
    if (!isCreator && !isBusiness) {
      const { data: sponsorship } = await adminClient
        .from('campaign_sponsorships')
        .select('brand_id')
        .eq('campaign_id', collab.campaign_id)
        .single();
      if (sponsorship) {
        const { data: brandProfile } = await adminClient
          .from('business_profiles')
          .select('user_id')
          .eq('id', sponsorship.brand_id)
          .single();
        isBrand = brandProfile?.user_id === userId;
      }
    }

    if (!isCreator && !isBusiness && !isBrand) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Determine access level based on content_status and role
    const status = collab.content_status;
    const disputeOutcome = (collab as any).dispute_outcome;
    let canDownload = false;
    let accessDenied = false;
    let message = '';

    if (status === 'pending' || status === 'in_progress') {
      if (isCreator) {
        // Creator can view their own content
        canDownload = false;
        message = 'Content is still in progress.';
      } else {
        // Business/Brand: no access to pending/in-progress content
        accessDenied = true;
        message = 'Content is not yet available for review.';
      }
    } else if (status === 'submitted') {
      // Creator can view own; business/brand get preview only
      canDownload = false;
      message = isCreator
        ? 'Content submitted for review.'
        : 'Preview only. Content is awaiting review.';
    } else if (status === 'revision_requested') {
      // Creator can view + re-upload; business/brand get preview only
      canDownload = false;
      message = isCreator
        ? 'Revision requested. You may re-upload.'
        : 'Preview only. Revision has been requested.';
    } else if (status === 'approved' || status === 'auto_approved') {
      // Full download for everyone
      canDownload = true;
      message = 'Content approved. Full download available.';
    } else if (status === 'rejected' || status === 'disputed') {
      if (isCreator) {
        canDownload = false;
        message = 'Content has been ' + status + '.';
      } else {
        canDownload = false;
        message = 'Preview only. Content has been ' + status + '.';
      }
    } else if (status === 'resolved') {
      if (disputeOutcome === 'approved') {
        // Resolved in favor of approval — full download
        canDownload = true;
        message = 'Dispute resolved. Full download available.';
      } else if (disputeOutcome === 'refund') {
        if (isCreator) {
          canDownload = false;
          message = 'Dispute resolved with refund. View only.';
        } else {
          accessDenied = true;
          message = 'Dispute resolved with refund. Access revoked.';
        }
      } else {
        // Unknown dispute outcome — default to preview
        canDownload = false;
        message = 'Dispute resolved. Preview only.';
      }
    } else {
      // Unknown status — default to preview for safety
      canDownload = false;
      message = 'Preview only.';
    }

    // Log file access (fire-and-forget)
    writePaymentEvent(adminClient, {
      event_type: 'file_accessed',
      entity_type: 'collaboration',
      entity_id: collaboration_id,
      campaign_id: collab.campaign_id,
      actor_id: userId,
      actor_role: isCreator ? 'creator' : isBrand ? 'brand' : 'business',
      metadata: { file_path, can_download: canDownload },
    }, '[GET-WATERMARKED-PREVIEW]');

    if (accessDenied) {
      return new Response(JSON.stringify({ error: message }), {
        status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Bind the FILE to the collaboration that was just authorized.
    //
    // Everything above authorizes `collaboration_id`; the object signed below came from
    // `file_path` + `bucket_name`, and until this check nothing ever joined the two. Anyone
    // holding one collaboration of their own in an approved state could name ANY object in any
    // private bucket and get a signed download URL for it. It also defeated two rules this
    // function exists to enforce: the preview-vs-download ladder, and the
    // `dispute_outcome='refund'` access revocation, both of which could be sidestepped by
    // re-presenting a known path under a different, still-approved collaboration.
    //
    // Scoped to the collaboration's CREATOR, not merely its campaign. Campaign scope is one
    // level too coarse: a campaign can carry several collaborations, so creator A — holding
    // their own approved collaboration — could name creator B's `file_path` on the same
    // campaign and have it signed with `download:true`. `file_uploads` has no
    // `collaboration_id` (verified against prod `information_schema`), so `uploaded_by` is the
    // available grain, and it is the correct one: every caller passes the collaboration whose
    // work they are asking about, so a campaign owner previewing B still resolves B's files by
    // passing B's collaboration.
    //
    // Storage RLS is NOT a second control to fall back on here — the service-role signature is
    // the only door. (An earlier version of this comment said `campaign-deliverables` is
    // service-role-only for SELECT per `20260425000000`; that is stale — `20260513000001`
    // re-added a participant/org-member SELECT policy, and the two coexist. The conclusion is
    // unchanged, but the reason is: RLS never sees a `createSignedUrl` made with the service
    // role, whatever policies exist.)
    const { data: fileRow, error: fileError } = await adminClient
      .from('file_uploads')
      .select('file_path, bucket_name')
      .eq('campaign_id', collab.campaign_id)
      .eq('uploaded_by', collab.creator_id)
      .eq('file_path', file_path)
      .eq('bucket_name', bucket_name)
      .maybeSingle();

    if (fileError) {
      console.error('[get-watermarked-preview] file lookup failed:', fileError.message);
      return new Response(JSON.stringify({ error: 'Authorization check unavailable' }), {
        status: 503, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (!fileRow) {
      console.warn('[get-watermarked-preview] file not part of this collaboration', {
        userId, collaboration_id, bucket_name,
      });
      return new Response(JSON.stringify({ error: 'File not found for this collaboration' }), {
        status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Generate signed URL with appropriate expiry
    const expirySeconds = canDownload ? 3600 : 900;
    const signOptions = canDownload ? { download: true } : {};
    const { data: signedData, error: signError } = await adminClient.storage
      .from(fileRow.bucket_name)
      .createSignedUrl(fileRow.file_path, expirySeconds, signOptions);

    if (signError) {
      return new Response(JSON.stringify({ error: 'Failed to generate URL' }), {
        status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      signed_url: signedData.signedUrl,
      can_download: canDownload,
      content_status: collab.content_status,
      message,
    }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
