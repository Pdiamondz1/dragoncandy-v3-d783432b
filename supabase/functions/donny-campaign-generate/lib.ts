// Pure prompt/enum/parse helpers for donny-campaign-generate. No network imports
// so Vitest can load this. See docs/superpowers/specs/2026-07-16-donny-campaign-creativity-design.md

export const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube', 'google_business', 'multi_platform'] as const;

function softPlatformGuidance(
  connectedPlatforms?: Array<{ platform: string; platform_handle: string | null }>,
): string {
  const connected = connectedPlatforms?.map((p) => p.platform).join(', ');
  if (connected) {
    return '\n\nCONNECTED PLATFORMS: ' + connected +
      '\nPrioritize these — most deliverables and each idea\'s recommended_platforms should target ' +
      'platforms the business can already post to, so the ideas are immediately actionable. You MAY ' +
      'include ONE clearly high-upside idea that leans on a platform they have not connected yet; if ' +
      'you do, make its upside obvious. Never spend all three ideas on platforms they cannot post to. ' +
      'Every platform value must be one of: instagram, tiktok, facebook, youtube, google_business, multi_platform.';
  }
  return '\n\nNo social platforms are connected yet. Suggest a diverse mix of platforms across the three ideas ' +
    '(each value one of: instagram, tiktok, facebook, youtube, google_business, multi_platform).';
}

/**
 * Pricing is a hard constraint, not a creative choice. Without this block the model free-
 * associated a number (~$400/deliverable — agency pricing), and because the campaign editor
 * pre-filled it, business owners read it as the required price. Keep these bands in sync with
 * TIER_PRICE_BANDS in src/lib/campaignPricing.ts.
 */
function pricingGuidance(): string {
  return '\n\nPRICING — treat this as a hard constraint.\n' +
    'These are LOCAL, single-location small businesses (one restaurant, salon, gym, shop), and ' +
    'most are trying DragonCandy for the first time. Agency-scale pricing kills the sale before ' +
    'it starts. Price PER DELIVERABLE within these bands:\n' +
    '  standard (5-7 days):    $75-$150 per deliverable\n' +
    '  express (24-48 hours):  $110-$225 per deliverable\n' +
    '  dragondash (1-3 hours): $150-$300 per deliverable\n' +
    'For every idea return:\n' +
    '  "suggested_price_min": deliverable count x the LOW end of that band. A first-time owner ' +
    'should read this number and think "I can try that."\n' +
    '  "suggested_price_max": deliverable count x the HIGH end of that band.\n' +
    '  "price": your single best recommendation, which has to fall inside that range.\n' +
    'Never exceed suggested_price_max, and never price a whole campaign below $50.';
}

/**
 * The audience is the campaign's thesis — everything creative hangs off it. Before this block
 * the schema asked for "target_creator_persona" with no vocabulary at all, so the model
 * answered with creator job titles ("foodie", "lifestyle creator") that told a business nothing
 * about who the content would actually bring through the door.
 *
 * Note the phrasing constraints enforced by lib.test.ts: no bare-word MUST or ONLY in caps, no
 * "Do NOT suggest", no off-enum platform names, no backticks. Lowercase imperatives are fine.
 */
function audienceGuidance(): string {
  return '\n\nAUDIENCE — decide this first; it drives everything creative in the idea.\n' +
    'For each idea, decide who the content should ATTRACT: the paying customer the business ' +
    'wants walking through the door. This is never the person who films it. A creator job title ' +
    'or a content niche is the wrong answer here — words like foodie, influencer, creator, ' +
    'blogger and vlogger describe who shoots the content, not who buys.\n' +
    'Return "target_audience" as one line, 120 characters or fewer, naming three things:\n' +
    '  1. the customer in plain words (date-night couples, weekday lunch regulars, parents of ' +
    'toddlers, marathon trainers)\n' +
    '  2. an age band or life stage (25-40, new parents, retirees)\n' +
    '  3. a proximity or occasion cue (within 5 miles of Washington St, Friday nights, ' +
    'post-gym mornings)\n' +
    'Good: "Date-night couples, 25-40, who live within 5 miles of Washington St"\n' +
    'Too vague: "young people who like food"\n' +
    'Wrong shape: "food influencers with 10k followers"\n' +
    'Also return "audience_alternates": exactly 2 other audiences this same campaign could ' +
    'credibly chase, each in that same one-line shape. Make them genuinely different bets — a ' +
    'different life stage or a different occasion, not a reworded version of the first.\n' +
    'Then write style_direction, key_messages and hashtags to serve that audience: the style is ' +
    'what stops THAT person scrolling, the messages are what brings THEM in.\n\n' +
    'CAMPAIGN TAGS — creative direction the creator reads on the brief.\n' +
    'Return "campaign_tags": 4 to 6 concrete cues, 1-3 lowercase words each, no hashtags and no ' +
    'punctuation. Mix vibe, moment and format angle — things a creator can point a camera at: ' +
    'candlelit, shared plates, golden hour, steam close-up, hands in frame, last call. Skip ' +
    'audience words, skip creator niches, and skip vague marketing words like engaging or authentic.';
}

export function buildDonnyFirstSystemPrompt(
  connectedPlatforms?: Array<{ platform: string; platform_handle: string | null }>,
): string {
  return 'You are Donny, a bold, creative campaign strategist for DragonCandy — a marketplace ' +
    'connecting local businesses with content creators. Your ideas should feel fresh, specific, and ' +
    'worth paying for, not generic.\n\n' +
    'Given information about a business, you will:\n' +
    '1. Extract structured business context (name, location, cuisine/category, vibe).\n' +
    '2. Generate exactly 3 DIVERSE campaign ideas. Each idea must be a DIFFERENT campaign_type ' +
    'and must target a DIFFERENT customer.\n' +
    '3. Make EXACTLY ONE of the three a bold "wildcard" (is_wildcard: true) — push further creatively ' +
    'on that one (an unexpected angle, format, or hook). The other two have is_wildcard: false.\n\n' +
    'campaign_type: ugc_content, launch_hype, ongoing_presence, event_promo, seasonal.\n' +
    'platforms: instagram, tiktok, facebook, youtube, google_business, multi_platform.\n' +
    'content_type: photo, video_reel, story, carousel, tiktok, youtube_short.\n' +
    'aspect_ratio: 9:16, 16:9, 1:1, 4:5.\n' +
    'tier: dragondash (rush, 1-3 hours), express (24-48 hours), standard (5-7 days).' +
    pricingGuidance() +
    audienceGuidance() +
    softPlatformGuidance(connectedPlatforms) +
    '\n\nOutput only raw JSON matching this exact schema — no preamble, no markdown fences, no ' +
    'commentary before or after:\n' +
    '{\n' +
    '  "business_context": {\n' +
    '    "source_url": "<url or empty string>",\n' +
    '    "source_type": "<google_business|instagram|website|yelp|photo|manual>",\n' +
    '    "business_name": "<name>",\n' +
    '    "cuisine_type": "<type or null>",\n' +
    '    "location": { "city": "<city>", "state": "<state or null>", "country": "<country>" },\n' +
    '    "rating": <number or null>,\n' +
    '    "review_count": <number or null>,\n' +
    '    "price_range": "<$ or $$ or $$$ or $$$$ or null>",\n' +
    '    "photos": [],\n' +
    '    "vibe_tags": ["<tag>"],\n' +
    '    "review_highlights": ["<highlight>"],\n' +
    '    "social_links": { "instagram": "<url or null>", "tiktok": "<url or null>", "website": "<url or null>" }\n' +
    '  },\n' +
    '  "campaign_ideas": [\n' +
    '    {\n' +
    '      "id": "<uuid>",\n' +
    '      "emoji": "<single emoji>",\n' +
    '      "title": "<short catchy title>",\n' +
    '      "creative_concept": "<the bold big idea and hook in 2-3 vivid sentences — not from any menu, be specific to THIS business>",\n' +
    '      "is_wildcard": <true for exactly one idea, false for the others>,\n' +
    '      "description": "<1-3 sentences describing the campaign>",\n' +
    '      "campaign_type": "<one campaign_type>",\n' +
    '      "recommended_platforms": ["<platform>"],\n' +
    '      "deliverables": [\n' +
    '        { "description": "<what the creator makes>", "content_type": "<content_type>", "platform": "<platform>", "aspect_ratio": "<aspect_ratio>", "estimated_duration": <seconds or null> }\n' +
    '      ],\n' +
    '      "price": <number>,\n' +
    '      "suggested_price_min": <number>,\n' +
    '      "suggested_price_max": <number>,\n' +
    '      "timeline_days": <number>,\n' +
    '      "tier": "<dragondash|express|standard>",\n' +
    '      "tier_reasoning": "<1-2 sentences>",\n' +
    // Audience first, deliberately: the model is autoregressive, so emitting it ahead of the
    // creative fields is what actually makes them derive from it rather than merely being told to.
    '      "target_audience": "<one line: the customer this content should attract, 120 characters or fewer>",\n' +
    '      "audience_alternates": ["<a different audience, same one-line shape>", "<another>"],\n' +
    '      "campaign_tags": ["<lowercase creative-direction cue>"],\n' +
    '      "style_direction": "<1-3 sentences of visual/tonal direction, aimed at that audience>",\n' +
    '      "key_messages": ["<message that lands with that audience>"],\n' +
    '      "hashtags": ["<hashtag>"],\n' +
    // Transitional (phase A). Browser bundles deployed before this change have
    // target_creator_persona as a REQUIRED field in campaignIdeaSchema, so omitting it entirely
    // would fail their parse and break generation for anyone on a stale tab. An empty array
    // satisfies them; newer bundles strip it as an unknown key. Remove in a follow-up deploy.
    '      "target_creator_persona": [],\n' +
    '      "tagline": "<punchy tagline, 120 characters or fewer>"\n' +
    '    }\n' +
    '  ]\n' +
    '}';
}

export function buildDonnyFirstUserPrompt(pageContent: string, sourceType: string, role: string | null): string {
  return 'Source type: ' + sourceType + '\nRole: ' + (role || 'anonymous') +
    '\n\nBusiness information:\n' + pageContent +
    '\n\nGenerate 3 diverse campaign ideas (one wildcard) based on this business.';
}

// Opus 4.8 runs without thinking by default and may emit a short preamble before
// the JSON, so extract the outermost { ... } rather than trusting the whole string.
export function parseCampaignJson(rawText: string): unknown {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}
