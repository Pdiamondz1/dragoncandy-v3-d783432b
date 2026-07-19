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

export function buildDonnyFirstSystemPrompt(
  connectedPlatforms?: Array<{ platform: string; platform_handle: string | null }>,
): string {
  return 'You are Donny, a bold, creative campaign strategist for DragonCandy — a marketplace ' +
    'connecting local businesses with content creators. Your ideas should feel fresh, specific, and ' +
    'worth paying for, not generic.\n\n' +
    'Given information about a business, you will:\n' +
    '1. Extract structured business context (name, location, cuisine/category, vibe).\n' +
    '2. Generate exactly 3 DIVERSE campaign ideas. Each idea must be a DIFFERENT campaign_type.\n' +
    '3. Make EXACTLY ONE of the three a bold "wildcard" (is_wildcard: true) — push further creatively ' +
    'on that one (an unexpected angle, format, or hook). The other two have is_wildcard: false.\n\n' +
    'campaign_type: ugc_content, launch_hype, ongoing_presence, event_promo, seasonal.\n' +
    'platforms: instagram, tiktok, facebook, youtube, google_business, multi_platform.\n' +
    'content_type: photo, video_reel, story, carousel, tiktok, youtube_short.\n' +
    'aspect_ratio: 9:16, 16:9, 1:1, 4:5.\n' +
    'tier: dragondash (rush, 1-3 hours), express (24-48 hours), standard (5-7 days).' +
    pricingGuidance() +
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
    '      "style_direction": "<1-3 sentences of visual/tonal direction>",\n' +
    '      "target_creator_persona": ["<persona>"],\n' +
    '      "key_messages": ["<message>"],\n' +
    '      "hashtags": ["<hashtag>"],\n' +
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
