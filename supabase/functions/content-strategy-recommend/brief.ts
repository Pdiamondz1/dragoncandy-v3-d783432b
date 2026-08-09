// Pure, dependency-free logic for the content-brief recommender. Imported by both
// the Deno edge function (index.ts) and the Vitest test — no Deno/Supabase/I/O.

import { MIN_POSTS_FOR_SIGNAL } from '../_shared/social-signal.ts';

// Re-exported so this module's existing importers and tests keep their import
// path. The VALUE now has exactly one definition, in _shared/social-signal.ts.
export { MIN_POSTS_FOR_SIGNAL };

export interface PerfRow {
  outstand_post_id: string | null;
  platform: string | null;
  post_type: string | null;
  engagement_rate: number | null;
  is_settled: boolean | null;
}

export interface PerfAggregate {
  hasSignal: boolean;
  summary: string | null;
}

/**
 * Aggregate a creator's OWN settled content_performance into a short signal
 * summary.
 *
 * `content_performance` is one row per PLATFORM PLACEMENT, not per post
 * (Task 11's per-platform grain) — a single post fanned out to Instagram +
 * YouTube + Facebook settles as 3 rows sharing one `outstand_post_id`.
 * `MIN_POSTS_FOR_SIGNAL` is a sample-size safeguard against claiming
 * evidence from too few POSTS (the spec for this sub-project names it as
 * the precedent to preserve); gating and the "across N posts" wording both
 * count DISTINCT `outstand_post_id`s among the settled rows, not row count
 * — otherwise a single fanned-out post alone would trip the threshold and
 * `usedPerformanceData`/the persisted brief would claim "your top-performing
 * posts" evidence from n=1 (fix round 2, coordinator review). Rows with no
 * `outstand_post_id` (should not occur — the column is NOT NULL in prod)
 * don't count toward the distinct-post total in either direction: they
 * neither collapse together as one post nor each inflate the count as a
 * separate one.
 */
export function aggregateCreatorPerformance(rows: PerfRow[]): PerfAggregate {
  const settled = rows.filter((r) => r.is_settled === true);

  const distinctPostCount = new Set(
    settled.map((r) => r.outstand_post_id).filter((id): id is string => !!id),
  ).size;
  if (distinctPostCount < MIN_POSTS_FOR_SIGNAL) return { hasSignal: false, summary: null };

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
  let best: { avg: number; platform: string; post_type: string } | null = null;
  for (const g of groups.values()) {
    const avg = g.count > 0 ? g.total / g.count : 0;
    if (!best || avg > best.avg) best = { avg, platform: g.platform, post_type: g.post_type };
  }
  if (!best) return { hasSignal: false, summary: null };
  // Use the SAME distinct-post count as the gate above -- not the winning
  // group's row count -- so the wording ("posts") and the number always agree.
  return {
    hasSignal: true,
    summary: `Top: ${best.platform} ${best.post_type} (avg engagement ${best.avg.toFixed(1)}%) across ${distinctPostCount} posts`,
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
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Fallback: the model wrapped the JSON in prose or stray fences — grab the {...} span.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('brief is not JSON');
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  }

  for (const k of REQUIRED_STRINGS) {
    if (typeof obj[k] !== 'string' || !(obj[k] as string).trim()) {
      throw new Error(`brief missing/invalid field: ${k}`);
    }
  }
  if (!Array.isArray(obj.hashtags)) throw new Error('brief missing hashtags');

  // Keep only real, non-empty string angles (drop null/non-string/blank), then pad to
  // exactly 3 by repeating the last real angle. Never emits the literal "null".
  const rawAngles = Array.isArray(obj.angles) ? (obj.angles as unknown[]) : [];
  const angles = rawAngles
    .map((a) => (typeof a === 'string' ? a.trim() : ''))
    .filter((a) => a.length > 0)
    .slice(0, 3);
  if (angles.length === 0) throw new Error('brief has no usable angles');
  while (angles.length < 3) angles.push(angles[angles.length - 1]);

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
