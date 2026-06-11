// Pure, dependency-free logic for the content-brief recommender. Imported by both
// the Deno edge function (index.ts) and the Vitest test — no Deno/Supabase/I/O.

export const MIN_POSTS_FOR_SIGNAL = 3;

export interface PerfRow {
  platform: string | null;
  post_type: string | null;
  engagement_rate: number | null;
  is_settled: boolean | null;
}

export interface PerfAggregate {
  hasSignal: boolean;
  summary: string | null;
}

/** Aggregate a creator's OWN settled content_performance into a short signal summary. */
export function aggregateCreatorPerformance(rows: PerfRow[]): PerfAggregate {
  const settled = rows.filter((r) => r.is_settled === true);
  if (settled.length < MIN_POSTS_FOR_SIGNAL) return { hasSignal: false, summary: null };

  const groups = new Map<string, { total: number; count: number; platform: string; post_type: string }>();
  for (const r of settled) {
    const platform = r.platform ?? 'unknown';
    const post_type = r.post_type ?? 'unknown';
    const key = `${platform}|${post_type}`;
    const g = groups.get(key) ?? { total: 0, count: 0, platform, post_type };
    g.total += Number(r.engagement_rate) || 0;
    g.count += 1;
    groups.set(key, g);
  }
  let best: { avg: number; platform: string; post_type: string; count: number } | null = null;
  for (const g of groups.values()) {
    const avg = g.count > 0 ? g.total / g.count : 0;
    if (!best || avg > best.avg) best = { avg, platform: g.platform, post_type: g.post_type, count: g.count };
  }
  if (!best) return { hasSignal: false, summary: null };
  return {
    hasSignal: true,
    summary: `Top: ${best.platform} ${best.post_type} (avg engagement ${best.avg.toFixed(1)}%) across ${best.count} posts`,
  };
}

export interface ContentBrief {
  recommended_format: string;
  platform: string;
  hook: string;
  angles: string[];
  sample_caption: string;
  hashtags: string[];
  best_time: string;
  rationale: string;
}

const REQUIRED_STRINGS = ['recommended_format', 'platform', 'hook', 'sample_caption', 'best_time', 'rationale'] as const;

/** Parse + validate the model's strict-JSON brief. Throws on anything malformed. */
export function parseBrief(raw: string): ContentBrief {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const obj = JSON.parse(cleaned) as Record<string, unknown>;

  for (const k of REQUIRED_STRINGS) {
    if (typeof obj[k] !== 'string' || !(obj[k] as string).trim()) {
      throw new Error(`brief missing/invalid field: ${k}`);
    }
  }
  if (!Array.isArray(obj.angles) || obj.angles.length === 0) throw new Error('brief missing angles');
  if (!Array.isArray(obj.hashtags)) throw new Error('brief missing hashtags');

  const angles = (obj.angles as unknown[]).map(String).slice(0, 3);
  while (angles.length < 3) angles.push(angles[angles.length - 1] ?? '');

  return {
    recommended_format: obj.recommended_format as string,
    platform: obj.platform as string,
    hook: obj.hook as string,
    angles,
    sample_caption: obj.sample_caption as string,
    hashtags: (obj.hashtags as unknown[]).map(String),
    best_time: obj.best_time as string,
    rationale: obj.rationale as string,
  };
}

export interface PromptInputs {
  businessName: string;
  businessContext: string;
  connectedPlatforms: string[];
  creatorSummary: string;
  perfSummary: string | null;
  ragChunks: string[];
}

/** Build the system + user prompts. Pure (string assembly only). */
export function buildPrompt(inp: PromptInputs): { system: string; user: string } {
  const platformLine = inp.connectedPlatforms.length
    ? `The business posts on: ${inp.connectedPlatforms.join(', ')}. Prefer one of these for "platform".`
    : `The business has no connected platforms; pick the best-fit platform for the content.`;
  const perfLine = inp.perfSummary
    ? `\n\nThis creator's own past performance — ground the recommendation in it: ${inp.perfSummary}`
    : '';
  const ragLine = inp.ragChunks.length ? `\n\nRelevant content best-practices:\n- ${inp.ragChunks.join('\n- ')}` : '';

  const system = `You are Donny, DragonCandy's content strategist. A creator wants to make short-form social content FOR a specific restaurant. Produce ONE concrete, actionable content brief the creator can shoot today. ${platformLine}
Respond ONLY with valid JSON (no markdown fences) matching exactly:
{
  "recommended_format": "<Reel|Short|Carousel|Photo|...>",
  "platform": "<platform>",
  "hook": "<the first 3 seconds / opening line>",
  "angles": ["<angle 1>", "<angle 2>", "<angle 3>"],
  "sample_caption": "<ready-to-post caption>",
  "hashtags": ["<#tag>", "..."],
  "best_time": "<human-readable best posting window>",
  "rationale": "<one or two sentences grounded in the context provided>"
}`;

  const user = `Restaurant: ${inp.businessName}
Restaurant context:
${inp.businessContext}

Creator: ${inp.creatorSummary}${perfLine}${ragLine}

Generate the content brief now.`;

  return { system, user };
}
