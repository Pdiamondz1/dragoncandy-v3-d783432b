import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { isAuthorizedIngest } from '../_shared/ingest-auth.ts';
import { authorizeNotify, type NotifyPost } from './authz.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type NudgeType = 'application' | 'content' | 'milestone' | 'payment' | 'invitation' | 'match';

interface NudgeAction {
  label: string;
  variant: string;
  action: string;
  payload: Record<string, unknown>;
}

interface NotifyRequest {
  event: 'submission' | 'boost_paid' | 'declined';
  post_id?: string;
  boost_id?: string;
  creator_id?: string;
  creator_payout_cents?: number;
}

// --- Small helpers -----------------------------------------------------------

function jsonHeaders(req: Request) {
  return { ...corsHeaders(req), 'Content-Type': 'application/json' };
}

function ok(req: Request, body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: jsonHeaders(req) });
}

// --- Best-effort external steps ----------------------------------------------

async function notify(
  recipientId: string,
  type: string,
  title: string,
  body: string,
  actionUrl?: string,
  icon?: string,
  data?: Record<string, unknown>,
) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/create-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ recipientId, type, category: 'dragonshare', title, body, actionUrl, icon, data }),
    });
  } catch (e) {
    console.warn('[dragonshare-notify] create-notification failed:', (e as Error).message);
  }
}

async function upsertNudge(
  sb: SupabaseClient,
  userId: string,
  nudgeType: NudgeType,
  sourceTable: string,
  sourceId: string,
  summary: string,
  actions: NudgeAction[],
) {
  try {
    await sb.from('donny_nudges').upsert(
      {
        user_id: userId,
        type: nudgeType,
        source_table: sourceTable,
        source_id: sourceId,
        summary,
        priority: 'high',
        actions,
        raw_data: {},
      },
      { onConflict: 'user_id,source_table,source_id', ignoreDuplicates: true },
    );
  } catch (e) {
    console.warn('[dragonshare-notify] nudge failed:', (e as Error).message);
  }
}

// --- Resolution helpers ------------------------------------------------------

async function resolveOrgOwner(sb: SupabaseClient, orgId: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .eq('invitation_status', 'active')
      .limit(1)
      .maybeSingle();
    return data?.user_id ?? null;
  } catch (e) {
    console.warn('[dragonshare-notify] resolveOrgOwner failed:', (e as Error).message);
    return null;
  }
}

async function fullName(sb: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await sb.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    return data?.full_name || 'A creator';
  } catch (e) {
    console.warn('[dragonshare-notify] fullName failed:', (e as Error).message);
    return 'A creator';
  }
}

async function cleanBusinessName(sb: SupabaseClient, orgId: string): Promise<string> {
  try {
    const ownerId = await resolveOrgOwner(sb, orgId);
    if (ownerId) {
      const { data: bp } = await sb
        .from('business_profiles')
        .select('business_name')
        .eq('user_id', ownerId)
        .maybeSingle();
      if (bp?.business_name) return bp.business_name;
    }
    const { data: org } = await sb.from('organizations').select('name').eq('id', orgId).maybeSingle();
    if (org?.name) return org.name;
  } catch (e) {
    console.warn('[dragonshare-notify] cleanBusinessName failed:', (e as Error).message);
  }
  return 'A restaurant';
}

async function postDonnyChatMessage(
  sb: SupabaseClient,
  ownerId: string,
  creatorName: string,
  contentType: string,
  route: string,
) {
  try {
    // Find newest non-archived conversation, else create one.
    let conversationId: string | null = null;
    const { data: existing } = await sb
      .from('donny_conversations')
      .select('id')
      .eq('user_id', ownerId)
      .is('archived_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      conversationId = existing.id;
    } else {
      const { data: created } = await sb
        .from('donny_conversations')
        .insert({ user_id: ownerId })
        .select('id')
        .single();
      conversationId = created?.id ?? null;
    }

    if (!conversationId) return;

    await sb.from('donny_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: `${creatorName} just shared a ${contentType} about you on DragonShare. Want to review and boost it?`,
      quick_actions: [
        { label: 'Review & boost', action: 'navigate', url: route },
        { label: 'Later', action: 'dismiss' },
      ],
    });

    await sb
      .from('donny_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);
  } catch (e) {
    console.warn('[dragonshare-notify] Donny chat message failed:', (e as Error).message);
  }
}

// --- Event branches ----------------------------------------------------------

async function handleSubmission(sb: SupabaseClient, postId: string) {
  const { data: post } = await sb
    .from('dragonshare_posts')
    .select('id, creator_id, target_org_id, content_type')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return;

  const ownerId = await resolveOrgOwner(sb, post.target_org_id);
  if (!ownerId) return;

  const creatorName = await fullName(sb, post.creator_id);
  const route = `/dashboard/business/dragonshare?highlight=${post.id}`;

  await notify(
    ownerId,
    'dragonshare_submission',
    `${creatorName} shared a post about you`,
    `New ${post.content_type} awaiting your boost decision.`,
    route,
    'star',
    { post_id: post.id, creator_name: creatorName, content_type: post.content_type },
  );

  await upsertNudge(
    sb,
    ownerId,
    'content',
    'dragonshare_posts',
    post.id,
    `${creatorName} shared a post about you — review & boost it.`,
    [
      { label: 'Review & boost', variant: 'primary', action: 'navigate', payload: { route } },
      { label: 'Later', variant: 'ghost', action: 'dismiss', payload: {} },
    ],
  );

  // Proactive Donny chat message — SUBMISSION ONLY.
  await postDonnyChatMessage(sb, ownerId, creatorName, post.content_type, route);
}

async function handleBoostPaid(
  sb: SupabaseClient,
  boostId: string,
  postIdArg?: string,
  creatorIdArg?: string,
  payoutCentsArg?: number,
) {
  const { data: boost } = await sb
    .from('dragonshare_boosts')
    .select('id, post_id, boosting_org_id, creator_payout_cents')
    .eq('id', boostId)
    .maybeSingle();
  if (!boost) return;

  const pid = postIdArg ?? boost.post_id;
  const payoutCents = payoutCentsArg ?? boost.creator_payout_cents ?? 0;
  const payoutDollars = Math.round(payoutCents / 100);

  let creatorId = creatorIdArg ?? null;
  if (!creatorId && pid) {
    const { data: post } = await sb
      .from('dragonshare_posts')
      .select('creator_id')
      .eq('id', pid)
      .maybeSingle();
    creatorId = post?.creator_id ?? null;
  }

  const businessName = await cleanBusinessName(sb, boost.boosting_org_id);

  if (creatorId) {
    const route = `/dashboard/creator/dragonshare?highlight=${pid}`;
    await notify(
      creatorId,
      'dragonshare_boost',
      'Your post got boosted! 🎉',
      `${businessName} boosted your content — $${payoutDollars} is on the way.`,
      route,
      'dollar',
      { post_id: pid, boost_id: boost.id, payout_dollars: payoutDollars, business_name: businessName },
    );
    await upsertNudge(
      sb,
      creatorId,
      'payment',
      'dragonshare_boosts',
      boost.id,
      `${businessName} boosted your post — $${payoutDollars} is on the way!`,
      [{ label: 'View', variant: 'primary', action: 'navigate', payload: { route } }],
    );
  }

  const ownerId = await resolveOrgOwner(sb, boost.boosting_org_id);
  if (ownerId) {
    await notify(
      ownerId,
      'dragonshare_boost_receipt',
      'Your boost is live',
      'Your boosted content is drafted for one-tap posting.',
      '/dashboard/business/social',
      'check',
      { post_id: pid, boost_id: boost.id },
    );
    await upsertNudge(
      sb,
      ownerId,
      'content',
      'dragonshare_boosts',
      boost.id,
      'Your boost is live — review the draft and post it.',
      [{ label: 'Review draft', variant: 'primary', action: 'navigate', payload: { route: '/dashboard/business/social' } }],
    );
  }
}

async function handleDeclined(sb: SupabaseClient, postId: string) {
  const { data: post } = await sb
    .from('dragonshare_posts')
    .select('id, creator_id')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return;

  const route = `/dashboard/creator/dragonshare?highlight=${post.id}`;

  await notify(
    post.creator_id,
    'dragonshare_declined',
    'Not selected this time',
    `A restaurant passed on this post — your content's still great. Share more and keep earning!`,
    route,
    'default',
    { post_id: post.id },
  );

  // source_id is a uuid column, so a `${post.id}-declined` string is invalid.
  // Use source_id = post.id but a distinct source_table ('dragonshare_declined')
  // so this nudge does not collide with the submission nudge (source_table
  // 'dragonshare_posts') under the unique (user_id, source_table, source_id) index.
  await upsertNudge(
    sb,
    post.creator_id,
    'content',
    'dragonshare_declined',
    post.id,
    `A restaurant passed this time — share more, keep earning!`,
    [{ label: 'Share more', variant: 'primary', action: 'navigate', payload: { route: '/dashboard/creator/dragonshare' } }],
  );
}

// --- Entry point -------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const payload = (await req.json()) as NotifyRequest;
    const { event } = payload;

    // --- Authorization -------------------------------------------------------
    // This function runs as SERVICE ROLE and acts on body-supplied ids. It previously read no
    // Authorization header at all, and `verify_jwt=true` does not close that: the anon key is a
    // valid JWT and ships in the frontend bundle, so the endpoint answered anyone. Rules live in
    // ./authz.ts (pure + unit-tested); this block only gathers the facts they need.
    const isIngest = isAuthorizedIngest(req);

    let callerId: string | null = null;
    if (!isIngest) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (token) {
        // Resolve against the ANON client: with the anon key as the token this yields no user,
        // which is exactly the distinction the old code failed to make.
        const anon = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
        const { data } = await anon.auth.getUser(token);
        callerId = data?.user?.id ?? null;
      }
    }

    // Refuse an unidentified caller BEFORE any service-role lookup, so a body-chosen `post_id`
    // never reaches the database on an anonymous request.
    if (!isIngest && !callerId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: jsonHeaders(req),
      });
    }

    // `boost_paid` is keyed on a boost, not a post, and is service-role only — so skip the post
    // and membership lookups entirely rather than doing work an unauthorized caller can trigger.
    let post: NotifyPost | null = null;
    let callerOrgIds: string[] = [];
    if (!isIngest && event !== 'boost_paid') {
      if (payload.post_id) {
        const { data } = await sb
          .from('dragonshare_posts')
          .select('creator_id, target_org_id')
          .eq('id', payload.post_id)
          .maybeSingle();
        post = (data as NotifyPost | null) ?? null;
      }
      if (callerId) {
        const { data: memberships } = await sb
          .from('org_members')
          .select('org_id')
          .eq('user_id', callerId)
          .eq('invitation_status', 'active');
        callerOrgIds = (memberships ?? []).map((m: { org_id: string }) => m.org_id);
      }
    }

    const decision = authorizeNotify({ event, isIngest, callerId, post, callerOrgIds });
    if (!decision.ok) {
      console.warn(`[dragonshare-notify] denied event=${event} reason=${decision.reason}`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), // deliberately generic to the caller
        { status: decision.status, headers: jsonHeaders(req) },
      );
    }
    // --- end authorization ---------------------------------------------------

    if (event === 'submission' && payload.post_id) {
      await handleSubmission(sb, payload.post_id);
    } else if (event === 'boost_paid' && payload.boost_id) {
      // Derive the post, creator and payout from the boost row — never from the body. The
      // handler already falls back to the DB for all three, so dropping the client-supplied
      // values is behaviour-preserving for the real caller and removes an attacker-chosen
      // dollar figure from a "you got paid" message.
      await handleBoostPaid(sb, payload.boost_id);
    } else if (event === 'declined' && payload.post_id) {
      await handleDeclined(sb, payload.post_id);
    }

    return ok(req);
  } catch (error) {
    console.error('[dragonshare-notify] Error:', (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: jsonHeaders(req) },
    );
  }
});
