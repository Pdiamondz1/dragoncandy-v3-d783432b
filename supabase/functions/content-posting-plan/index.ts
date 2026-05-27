import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage, checkHourlyRateLimit } from "../_shared/usage-tracker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

interface ContentStrategyPost {
  content_type: string;
  platform: string;
  purpose: string;
  description: string;
  day_offset: number;
}

interface ContentStrategy {
  posts: ContentStrategyPost[];
  cadence: "spread" | "burst" | "ramp";
  duration_days: number;
  reasoning: string;
}

interface DeliverableInput {
  url: string;
  mime_type: string;
  filename?: string;
  file_id?: string;
  deliverable_id?: string;
}

interface PlanRequest {
  deliverables: DeliverableInput[];
  content_strategy: ContentStrategy | null;
  connected_platforms: Array<{ platform: string; platform_handle: string | null }>;
  campaign: {
    id: string;
    title: string;
    type: string;
    deadline?: string;
    description?: string;
    key_messages?: string[];
    hashtags?: string[];
  };
  user_id: string;
  timezone?: string;
  posting_preferences?: {
    spread_strategy: 'auto' | 'even' | 'front_loaded' | 'custom';
    spread_window_days: number;
    preferred_days?: string[];
  };
}

interface PlannedPost {
  content_type: string;
  platform: string;
  caption: string;
  hashtags: string[];
  media_urls: string[];
  scheduled_at: string;
  ai_reasoning: string;
  plan_order: number;
  purpose: string;
  deliverable_id?: string;
}

// Static best-practice posting time rules per platform + content type.
// Each entry: [dayOfWeek (0=Sun), hourStart, hourEnd]
const TIME_RULES: Record<string, Array<[number, number, number]>> = {
  "instagram:video_reel": [[2, 11, 13], [4, 11, 13], [6, 9, 11]],
  "instagram:story":      [[1, 8, 9], [2, 8, 9], [3, 8, 9], [4, 8, 9], [5, 8, 9]],
  "instagram:carousel":   [[3, 17, 19], [5, 17, 19]],
  "instagram:photo":      [[1, 12, 14], [3, 12, 14]],
  "tiktok:tiktok":        [[0, 19, 21], [1, 19, 21], [2, 19, 21], [3, 19, 21], [4, 19, 21], [5, 19, 21], [6, 19, 21]],
  "tiktok:video_reel":    [[0, 19, 21], [1, 19, 21], [2, 19, 21], [3, 19, 21], [4, 19, 21], [5, 19, 21], [6, 19, 21]],
  "youtube:youtube_short": [[2, 14, 16], [4, 14, 16]],
  "facebook:photo":       [[1, 13, 15], [3, 13, 15], [5, 13, 15]],
  "facebook:video_reel":  [[1, 13, 15], [3, 13, 15], [5, 13, 15]],
  "x:photo":              [[1, 8, 10], [2, 8, 10], [3, 12, 13], [4, 8, 10], [5, 12, 13]],
};

const FALLBACK_TIMES: Array<[number, number, number]> = [[1, 12, 14], [3, 12, 14], [5, 12, 14]];

// US city/state → IANA timezone (covers initial metro launch markets)
const STATE_TIMEZONE: Record<string, string> = {
  "NJ": "America/New_York", "NY": "America/New_York", "CT": "America/New_York",
  "MA": "America/New_York", "PA": "America/New_York", "FL": "America/New_York",
  "GA": "America/New_York", "VA": "America/New_York", "MD": "America/New_York",
  "NC": "America/New_York", "SC": "America/New_York", "OH": "America/New_York",
  "MI": "America/New_York", "IN": "America/New_York", "IL": "America/Chicago",
  "TX": "America/Chicago", "MN": "America/Chicago", "WI": "America/Chicago",
  "MO": "America/Chicago", "LA": "America/Chicago", "AL": "America/Chicago",
  "CO": "America/Denver", "AZ": "America/Phoenix", "UT": "America/Denver",
  "NM": "America/Denver", "MT": "America/Denver",
  "CA": "America/Los_Angeles", "WA": "America/Los_Angeles", "OR": "America/Los_Angeles",
  "NV": "America/Los_Angeles", "HI": "Pacific/Honolulu",
};

function resolveTimezone(state?: string | null): string {
  if (!state) return "America/New_York";
  const upper = state.toUpperCase().trim();
  return STATE_TIMEZONE[upper] ?? "America/New_York";
}

function inferContentType(mimeType: string): string {
  if (mimeType.startsWith("video/")) return "video_reel";
  return "photo";
}

function pickScheduledTime(
  platform: string,
  contentType: string,
  dayOffset: number,
  baseDate: Date,
  _timezone: string
): string {
  const key = `${platform}:${contentType}`;
  const rules = TIME_RULES[key] ?? TIME_RULES[`${platform}:photo`] ?? FALLBACK_TIMES;

  const targetDate = new Date(baseDate);
  targetDate.setDate(targetDate.getDate() + dayOffset);

  const targetDow = targetDate.getDay();
  let bestRule = rules.find(([dow]) => dow === targetDow);
  if (!bestRule) {
    // Find the closest future day that has a rule
    for (let i = 1; i <= 7; i++) {
      const checkDow = (targetDow + i) % 7;
      bestRule = rules.find(([dow]) => dow === checkDow);
      if (bestRule) {
        targetDate.setDate(targetDate.getDate() + i);
        break;
      }
    }
  }
  if (!bestRule) bestRule = FALLBACK_TIMES[0];

  const [, hourStart, hourEnd] = bestRule;
  const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
  const minute = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45

  targetDate.setHours(hour, minute, 0, 0);
  return targetDate.toISOString();
}

function findNextAvailableDay(
  platform: string,
  contentType: string,
  collidingDate: Date,
  occupiedDays: Set<string>,
  _timezone: string,
): string {
  const key = `${platform}:${contentType}`;
  const rules = TIME_RULES[key] ?? TIME_RULES[`${platform}:photo`] ?? FALLBACK_TIMES;

  for (let i = 1; i <= 14; i++) {
    const candidate = new Date(collidingDate);
    candidate.setDate(candidate.getDate() + i);
    const dow = candidate.getDay();
    const rule = rules.find(([d]) => d === dow);
    if (rule && !occupiedDays.has(candidate.toDateString())) {
      const [, hourStart, hourEnd] = rule;
      const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
      const minute = Math.floor(Math.random() * 4) * 15;
      candidate.setHours(hour, minute, 0, 0);
      return candidate.toISOString();
    }
  }

  for (let i = 1; i <= 30; i++) {
    const candidate = new Date(collidingDate);
    candidate.setDate(candidate.getDate() + i);
    if (!occupiedDays.has(candidate.toDateString())) {
      const [, hourStart, hourEnd] = FALLBACK_TIMES[0];
      const hour = hourStart + Math.floor(Math.random() * (hourEnd - hourStart));
      const minute = Math.floor(Math.random() * 4) * 15;
      candidate.setHours(hour, minute, 0, 0);
      return candidate.toISOString();
    }
  }

  const fallback = new Date(collidingDate);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(12, 0, 0, 0);
  return fallback.toISOString();
}

function assignDatesFromPreferences(
  deliverables: PlanRequest['deliverables'],
  preferences: PlanRequest['posting_preferences'],
  _timezone: string
): Array<{ deliverable_id?: string; target_date: string }> {
  if (!preferences) return deliverables.map(d => ({ deliverable_id: d.deliverable_id }));

  const now = new Date();
  const windowDays = preferences.spread_window_days || 14;

  if (preferences.spread_strategy === 'custom' && preferences.preferred_days?.length) {
    const dayMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    };
    const targetDayNumbers = preferences.preferred_days.map(d => dayMap[d.toLowerCase()]).filter(n => n !== undefined);
    const dates: Date[] = [];
    for (let i = 1; i <= windowDays && dates.length < deliverables.length; i++) {
      const candidate = new Date(now.getTime() + i * 86400000);
      if (targetDayNumbers.includes(candidate.getDay())) {
        dates.push(candidate);
      }
    }
    return deliverables.map((d, i) => ({
      deliverable_id: d.deliverable_id,
      target_date: dates[i]?.toISOString().split('T')[0] ?? '',
    }));
  }

  if (preferences.spread_strategy === 'even') {
    const gap = Math.floor(windowDays / deliverables.length);
    return deliverables.map((d, i) => ({
      deliverable_id: d.deliverable_id,
      target_date: new Date(now.getTime() + (i * gap + 1) * 86400000).toISOString().split('T')[0],
    }));
  }

  if (preferences.spread_strategy === 'front_loaded') {
    const frontWindow = Math.ceil(windowDays / 3);
    const gap = Math.max(1, Math.floor(frontWindow / deliverables.length));
    return deliverables.map((d, i) => ({
      deliverable_id: d.deliverable_id,
      target_date: new Date(now.getTime() + (i * gap + 1) * 86400000).toISOString().split('T')[0],
    }));
  }

  // 'auto' — let AI decide
  return deliverables.map(d => ({ deliverable_id: d.deliverable_id }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    let userId: string;

    if (isServiceRole) {
      // Service-role calls pass user_id in the body
      const bodyPeek = await req.clone().json();
      userId = bodyPeek.user_id;
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "user_id required for service-role calls" }),
          { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    } else {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
      if (!user || authError) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      userId = user.id;

      const hourlyCheck = await checkHourlyRateLimit(supabaseAdmin, userId);
      if (!hourlyCheck.allowed) {
        return new Response(
          JSON.stringify({ error: "rate_limited", retry_after: hourlyCheck.retryAfterSeconds }),
          { status: 429, headers: { ...corsHeaders(req), "Content-Type": "application/json", "Retry-After": String(hourlyCheck.retryAfterSeconds) } }
        );
      }
    }

    const body = (await req.json()) as PlanRequest;
    const { deliverables, content_strategy, connected_platforms, campaign } = body;

    if (!deliverables?.length) {
      return new Response(
        JSON.stringify({ error: "No deliverables provided" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!connected_platforms?.length) {
      return new Response(
        JSON.stringify({ error: "No connected platforms" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Resolve timezone from campaign business context
    let timezone = body.timezone ?? "America/New_York";
    if (!body.timezone) {
      const { data: campaignRow } = await supabaseAdmin
        .from("campaigns")
        .select("ai_analysis")
        .eq("id", campaign.id)
        .single();
      const state = campaignRow?.ai_analysis?.business_context?.location?.state;
      timezone = resolveTimezone(state);
    }

    const dateAssignments = assignDatesFromPreferences(
      deliverables, body.posting_preferences, timezone
    );

    const platformNames = connected_platforms.map(p => p.platform);
    const defaultPlatform = platformNames[0];

    // Build the posting plan slots
    let planSlots: Array<{
      content_type: string;
      platform: string;
      purpose: string;
      description: string;
      day_offset: number;
      media_urls: string[];
    }> = [];

    if (content_strategy?.posts?.length) {
      // Map deliverables to strategy slots by content type
      const unmatchedDeliverables = [...deliverables];

      for (const strategyPost of content_strategy.posts) {
        if (!platformNames.includes(strategyPost.platform)) continue;

        const matchIdx = unmatchedDeliverables.findIndex(
          d => inferContentType(d.mime_type) === strategyPost.content_type ||
               (strategyPost.content_type === "video_reel" && d.mime_type.startsWith("video/")) ||
               (strategyPost.content_type === "photo" && d.mime_type.startsWith("image/"))
        );

        const mediaUrl = matchIdx >= 0
          ? unmatchedDeliverables.splice(matchIdx, 1)[0].url
          : unmatchedDeliverables.length > 0
            ? unmatchedDeliverables.splice(0, 1)[0].url
            : null;

        if (!mediaUrl) continue;

        planSlots.push({
          content_type: strategyPost.content_type,
          platform: strategyPost.platform,
          purpose: strategyPost.purpose,
          description: strategyPost.description,
          day_offset: strategyPost.day_offset,
          media_urls: [mediaUrl],
        });
      }

      // Remaining deliverables get extra slots
      for (const d of unmatchedDeliverables) {
        const ct = inferContentType(d.mime_type);
        const existingOffset = planSlots.length > 0
          ? Math.max(...planSlots.map(s => s.day_offset)) + 1
          : 0;
        planSlots.push({
          content_type: ct,
          platform: defaultPlatform,
          purpose: "follow_up",
          description: `Additional ${ct === "video_reel" ? "reel" : "post"} content`,
          day_offset: existingOffset,
          media_urls: [d.url],
        });
      }
    } else {
      // No strategy — generate default plan from deliverable types
      deliverables.forEach((d, i) => {
        const ct = inferContentType(d.mime_type);
        planSlots.push({
          content_type: ct,
          platform: defaultPlatform,
          purpose: i === 0 ? "hero_showcase" : "follow_up",
          description: ct === "video_reel" ? "Video content for feed" : "Photo content for feed",
          day_offset: i,
          media_urls: [d.url],
        });
      });
    }

    if (planSlots.length === 0) {
      return new Response(
        JSON.stringify({ error: "No posts could be generated from deliverables" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Generate all captions in a single Anthropic call
    const platformHandles = connected_platforms
      .filter(p => p.platform_handle)
      .map(p => `${p.platform}: @${p.platform_handle}`)
      .join(", ");

    const postDescriptions = planSlots.map((slot, i) =>
      `Post ${i + 1}: ${slot.content_type} on ${slot.platform} — purpose: ${slot.purpose} — ${slot.description}`
    ).join("\n");

    const hashtagNote = campaign.hashtags?.length
      ? `Include these campaign hashtags where appropriate: ${campaign.hashtags.join(" ")}. Always include #DragonDashed.`
      : "Always include #DragonDashed.";

    const usageStage = await getUserUsageStage(supabaseAdmin, userId);
    const modelConfig = getModelConfig("social-caption", usageStage);

    let scheduleConstraint = '';
    if (body.posting_preferences && body.posting_preferences.spread_strategy !== 'auto') {
      const assignments = dateAssignments
        .filter(a => a.target_date)
        .map((a, i) => `Deliverable ${i + 1}: post on ${a.target_date}`)
        .join('\n');
      scheduleConstraint = `\n\nSCHEDULING CONSTRAINTS:\n${assignments}\nUse the platform-optimal time of day for each date. Spread window: ${body.posting_preferences.spread_window_days} days.`;
    }

    const systemPrompt = `You are Donny, a social media strategist for DragonCandy. Generate captions for a multi-post content plan.

Campaign: "${campaign.title}"
${campaign.description ? `Description: ${campaign.description}` : ""}
${campaign.key_messages?.length ? `Key messages: ${campaign.key_messages.join("; ")}` : ""}
${platformHandles ? `Social handles: ${platformHandles}` : ""}

Write platform-native captions optimized for each platform:
- Instagram: engaging, visual storytelling, emojis OK, 10-15 hashtags
- TikTok: short punchy hook, 3-5 hashtags, trending style
- YouTube: SEO-friendly description, 5-8 hashtags
- Facebook: community-focused, warm, 3-5 hashtags
- X/Twitter: concise and witty, 1-2 hashtags

${hashtagNote}

Each caption should feel authentic and specific to the campaign, not generic. Reference the actual content purpose.

Respond ONLY with valid JSON:
{
  "posts": [
    {
      "caption": "<platform-native caption text WITHOUT hashtags>",
      "hashtags": ["#tag1", "#tag2"],
      "ai_reasoning": "<one sentence: why this time/format works>"
    }
  ],
  "strategy_summary": "<one sentence overview of the posting plan>"
}

Generate exactly ${planSlots.length} posts in the same order as listed below.${scheduleConstraint}`;

    const userMessage = `Generate captions for this posting plan:\n\n${postDescriptions}`;

    console.log(`[content-posting-plan] Calling Anthropic: model=${modelConfig.model}, posts=${planSlots.length}`);

    const response = await anthropicFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelConfig.model,
        max_tokens: modelConfig.maxTokens,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    }, 0);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[content-posting-plan] Anthropic failed: ${response.status} ${errText.slice(0, 300)}`);
      throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 300)}`);
    }

    const aiData = await response.json();
    const rawContent = aiData.content?.[0]?.text ?? "{}";
    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    await logCost(supabaseAdmin, {
      userId: userId,
      edgeFunction: "content-posting-plan",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: aiData.usage?.input_tokens ?? 0,
      outputTokens: aiData.usage?.output_tokens ?? 0,
    });
    await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);

    const planGroupId = crypto.randomUUID();
    const baseDate = new Date();
    const aiPosts: Array<{ caption: string; hashtags: string[]; ai_reasoning: string }> = parsed.posts ?? [];

    // Two-pass: compute collision-free times, then build post objects
    const candidates = planSlots.map((slot, i) => ({
      index: i,
      time: pickScheduledTime(slot.platform, slot.content_type, slot.day_offset, baseDate, timezone),
    }));
    candidates.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const occupiedDays = new Set<string>();
    for (const candidate of candidates) {
      const candidateDay = new Date(candidate.time).toDateString();
      if (occupiedDays.has(candidateDay)) {
        candidate.time = findNextAvailableDay(
          planSlots[candidate.index].platform,
          planSlots[candidate.index].content_type,
          new Date(candidate.time),
          occupiedDays,
          timezone,
        );
      }
      occupiedDays.add(new Date(candidate.time).toDateString());
    }

    const spreadTimes = new Array<string>(planSlots.length);
    for (const c of candidates) spreadTimes[c.index] = c.time;

    const posts: PlannedPost[] = planSlots.map((slot, i) => {
      const aiPost = aiPosts[i] ?? { caption: campaign.title, hashtags: ["#DragonDashed"], ai_reasoning: "Default caption" };
      const hashtags = aiPost.hashtags ?? ["#DragonDashed"];
      if (!hashtags.some((h: string) => h.toLowerCase().includes("dragondashed"))) {
        hashtags.push("#DragonDashed");
      }

      return {
        content_type: slot.content_type,
        platform: slot.platform,
        caption: aiPost.caption ?? "",
        hashtags,
        media_urls: slot.media_urls,
        scheduled_at: spreadTimes[i],
        ai_reasoning: aiPost.ai_reasoning ?? "",
        plan_order: i + 1,
        purpose: slot.purpose,
        deliverable_id: dateAssignments[i]?.deliverable_id ?? null,
      };
    });

    // Re-sort by final scheduled_at and reassign plan_order
    posts.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    posts.forEach((p, i) => { p.plan_order = i + 1; });

    return new Response(
      JSON.stringify({
        plan_id: planGroupId,
        posts,
        strategy_summary: parsed.strategy_summary ?? `${posts.length} posts planned across ${new Set(posts.map(p => p.platform)).size} platform(s)`,
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[content-posting-plan] Error:", err.message ?? err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
