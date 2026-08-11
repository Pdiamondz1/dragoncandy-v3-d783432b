import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";
import { checkHourlyRateLimit } from "../_shared/usage-tracker.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const VALID_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
] as const;

const VALID_CONTENT_TYPES = [
  "photo",
  "reel",
  "story",
  "video",
  "carousel",
  "tweet",
  "thread",
] as const;

function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function authenticateRequest(
  req: Request,
): Promise<string> {
  const authHeader = req.headers.get("Authorization") ?? "";

  // Try Supabase session first
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabaseUser.auth.getUser();

  if (user && !authError) {
    return user.id;
  }

  // Fallback: Donny OAuth token
  const oauthResult = await validateDonnyToken(req);
  if (!oauthResult) {
    throw new Error("Unauthorized");
  }
  if (!requireScope(oauthResult.scopes, "donny:schedule")) {
    throw new Error("Insufficient scope: donny:schedule required");
  }
  return oauthResult.user_id;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCreate(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const {
    platform,
    content_type,
    caption,
    media_urls,
    hashtags,
    scheduled_at,
    campaign_id,
  } = body as {
    platform: string;
    content_type: string;
    caption?: string;
    media_urls?: string[];
    hashtags?: string[];
    scheduled_at: string;
    campaign_id?: string;
  };

  if (!platform || !VALID_PLATFORMS.includes(platform as typeof VALID_PLATFORMS[number])) {
    return jsonResponse(req, { success: false, error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}` },
      400,
    );
  }
  if (!content_type || !VALID_CONTENT_TYPES.includes(content_type as typeof VALID_CONTENT_TYPES[number])) {
    return jsonResponse(req, { success: false, error: `Invalid content_type. Must be one of: ${VALID_CONTENT_TYPES.join(", ")}` },
      400,
    );
  }
  if (!scheduled_at) {
    return jsonResponse(req, { success: false, error: "scheduled_at is required" }, 400);
  }
  if (new Date(scheduled_at) <= new Date()) {
    return jsonResponse(req, { success: false, error: "scheduled_at must be in the future" },
      400,
    );
  }

  const { data, error } = await supabaseAdmin
    .from("donny_scheduled_posts")
    .insert({
      user_id: userId,
      campaign_id: campaign_id ?? null,
      platform,
      content_type,
      caption: caption ?? null,
      media_urls: media_urls ?? null,
      hashtags: hashtags ?? null,
      scheduled_at,
      status: "scheduled",
    })
    .select()
    .single();

  if (error) {
    return jsonResponse(req, { success: false, error: error.message }, 500);
  }
  return jsonResponse(req, { success: true, data });
}

async function handleUpdate(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const { post_id, updates } = body as {
    post_id: string;
    updates: {
      caption?: string;
      scheduled_at?: string;
      status?: string;
      hashtags?: string[];
    };
  };

  if (!post_id) {
    return jsonResponse(req, { success: false, error: "post_id is required" }, 400);
  }
  if (!updates || Object.keys(updates).length === 0) {
    return jsonResponse(req, { success: false, error: "updates object is required" }, 400);
  }

  // Verify ownership
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("donny_scheduled_posts")
    .select("id, user_id")
    .eq("id", post_id)
    .single();

  if (fetchErr || !existing) {
    return jsonResponse(req, { success: false, error: "Post not found" }, 404);
  }
  if (existing.user_id !== userId) {
    return jsonResponse(req, { success: false, error: "Unauthorized: you do not own this post" }, 403);
  }

  if (updates.scheduled_at && new Date(updates.scheduled_at) <= new Date()) {
    return jsonResponse(req, { success: false, error: "scheduled_at must be in the future" },
      400,
    );
  }

  // Whitelist the fields a caller may change. `updates` is typed above, but a TypeScript type
  // is erased at runtime — spreading it into a SERVICE-ROLE `.update()` wrote whatever the body
  // contained. Sending `updates: { user_id: "<victim>" }` reassigned this post into another
  // user's schedule, carrying the attacker's caption and media, publishable to the victim's
  // connected social accounts. `campaign_id`, `plan_group_id` and `metadata` were writable the
  // same way.
  //
  // Note the ownership check above was correct and still lost: the table's UPDATE policy
  // (`USING (user_id = auth.uid())`, no WITH CHECK — so Postgres reuses USING and pins
  // `user_id`) would have blocked this outright. The service-role client is what bypassed it.
  // Never spread a client object into a service-role write.
  const ALLOWED_STATUSES = ["draft", "scheduled", "publishing", "published", "failed", "cancelled"];
  const safeUpdates: Record<string, unknown> = {};
  if (typeof updates.caption === "string") safeUpdates.caption = updates.caption;
  if (typeof updates.scheduled_at === "string") safeUpdates.scheduled_at = updates.scheduled_at;
  if (Array.isArray(updates.hashtags)) safeUpdates.hashtags = updates.hashtags;
  if (typeof updates.status === "string") {
    if (!ALLOWED_STATUSES.includes(updates.status)) {
      return jsonResponse(req, { success: false, error: "Invalid status" }, 400);
    }
    safeUpdates.status = updates.status;
  }

  if (Object.keys(safeUpdates).length === 0) {
    return jsonResponse(req, { success: false, error: "No updatable fields supplied" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("donny_scheduled_posts")
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq("id", post_id)
    .select()
    .single();

  if (error) {
    return jsonResponse(req, { success: false, error: error.message }, 500);
  }
  return jsonResponse(req, { success: true, data });
}

async function handleDelete(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const { post_id } = body as { post_id: string };

  if (!post_id) {
    return jsonResponse(req, { success: false, error: "post_id is required" }, 400);
  }

  // Verify ownership
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("donny_scheduled_posts")
    .select("id, user_id")
    .eq("id", post_id)
    .single();

  if (fetchErr || !existing) {
    return jsonResponse(req, { success: false, error: "Post not found" }, 404);
  }
  if (existing.user_id !== userId) {
    return jsonResponse(req, { success: false, error: "Unauthorized: you do not own this post" }, 403);
  }

  const { data, error } = await supabaseAdmin
    .from("donny_scheduled_posts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", post_id)
    .select()
    .single();

  if (error) {
    return jsonResponse(req, { success: false, error: error.message }, 500);
  }
  return jsonResponse(req, { success: true, data });
}

async function handleList(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const { start_date, end_date, platform, campaign_id } = body as {
    start_date: string;
    end_date: string;
    platform?: string;
    campaign_id?: string;
  };

  if (!start_date || !end_date) {
    return jsonResponse(req, { success: false, error: "start_date and end_date are required" },
      400,
    );
  }

  // Explicit column list, not `*`. This is a SERVICE-ROLE read whose result goes straight back
  // to the client, so `*` means "whatever columns this table grows in future". Own rows only
  // (`user_id`), so `*` is not a leak today — naming the columns is what stops a future column
  // from becoming one silently.
  //
  // Deliberately the table's CURRENT FULL column set (verified against prod
  // `information_schema` 2026-08-11), not a narrower guess. Narrowing looked tempting —
  // `metadata` carries provider payloads — but I could not establish from `src/` which fields
  // this particular response feeds, and dropping one consumed by the calendar would fail as a
  // silently-missing value rather than an error. Enumerating everything current gets the whole
  // point of the change (a new column is not auto-exposed; adding it here is a deliberate act)
  // at zero regression risk. Narrow it further only with the consumer list in hand.
  let query = supabaseAdmin
    .from("donny_scheduled_posts")
    .select(
      "id, user_id, campaign_id, platform, content_type, caption, media_urls, hashtags, " +
        "scheduled_at, published_at, status, ai_suggested_time, ai_reasoning, metadata, " +
        "created_at, updated_at, plan_group_id, plan_order, deliverable_id",
    )
    .eq("user_id", userId)
    .gte("scheduled_at", start_date)
    .lte("scheduled_at", end_date)
    .order("scheduled_at", { ascending: true });

  if (platform) {
    query = query.eq("platform", platform);
  }
  if (campaign_id) {
    query = query.eq("campaign_id", campaign_id);
  }

  const { data, error } = await query;

  if (error) {
    return jsonResponse(req, { success: false, error: error.message }, 500);
  }

  // Group by date
  const grouped: Record<string, typeof data> = {};
  for (const post of data ?? []) {
    const dateKey = new Date(post.scheduled_at).toISOString().split("T")[0];
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(post);
  }

  return jsonResponse(req, { success: true, data: grouped });
}

async function handleSuggestTimes(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const { platform, content_type, target_audience } = body as {
    platform: string;
    content_type: string;
    target_audience?: string;
  };

  if (!platform || !content_type) {
    return jsonResponse(req, { success: false, error: "platform and content_type are required" },
      400,
    );
  }

  const userPrompt = [
    `Platform: ${platform}`,
    `Content type: ${content_type}`,
    target_audience ? `Target audience: ${target_audience}` : null,
    "",
    "Return your response as a JSON object with a single key 'slots' containing exactly 5 objects, each with: datetime (ISO 8601 string for next week), score (0-100), reason (string).",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropicFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system:
        "You are Donny, DragonCandy's scheduling expert. Analyze the best posting times for the given platform and content type. Consider: platform-specific peak engagement windows, content type patterns (e.g. Reels perform better in evenings, Stories in mornings), audience timezone if provided. Return exactly 5 time slots as JSON.",
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find(
    (b: { type: string }) => b.type === "text",
  );
  const raw = textBlock?.text ?? "";

  // Extract JSON from response (may be wrapped in markdown code fences)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return jsonResponse(req, { success: false, error: "Failed to parse AI suggestion" },
      500,
    );
  }

  const slots = JSON.parse(jsonMatch[0]);
  return jsonResponse(req, { success: true, data: slots });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { success: false, error: "Method not allowed" }, 405);
    }

    const userId = await authenticateRequest(req);
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const hourlyCheck = await checkHourlyRateLimit(supabaseAdmin, userId);
    if (!hourlyCheck.allowed) {
      return jsonResponse(req, { error: "rate_limited", retry_after: hourlyCheck.retryAfterSeconds }, 429);
    }

    const body = await req.json();
    const { action } = body as { action: string };

    switch (action) {
      case "create":
        return await handleCreate(req, userId, body, supabaseAdmin);
      case "update":
        return await handleUpdate(req, userId, body, supabaseAdmin);
      case "delete":
        return await handleDelete(req, userId, body, supabaseAdmin);
      case "list":
        return await handleList(req, userId, body, supabaseAdmin);
      case "suggest_times":
        return await handleSuggestTimes(req, body);
      default:
        return jsonResponse(req, {
            success: false,
            error: `Unknown action: ${action}. Valid actions: create, update, delete, list, suggest_times`,
          },
          400,
        );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuthError =
      msg.includes("Unauthorized") ||
      msg.includes("authorization") ||
      msg.includes("scope");
    return jsonResponse(req, { success: false, error: msg },
      isAuthError ? 401 : 500,
    );
  }
});
