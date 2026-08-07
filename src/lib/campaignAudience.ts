/**
 * Coercion for the campaign's target audience and creative-direction tags.
 *
 * These live in `ai_analysis` and reach the UI down two paths, and only ONE of them
 * goes through Zod: generation results are parsed by `campaignIdeaSchema`, but a draft
 * restored from localStorage is a bare `JSON.parse` (see `campaignCreatorDraft.ts`).
 * So the coercion has to live here, where both paths can call it, rather than in the
 * schema — otherwise a pre-change draft reaches the editor with `campaign_tags`
 * undefined and `.map` throws on first render.
 */

/** Tags past this are noise on a brief, not direction. */
export const MAX_CAMPAIGN_TAGS = 8;

/**
 * Deliberately looser than the 120 chars the prompt asks for. The legacy campaign wizard
 * stores its whole `generate-campaign-analysis` result as `ai_analysis`
 * (`useCampaignWizard.ts:156`, `useBrandCampaignWizard.ts:137`), and that edge function asks
 * the model for a free-text `"target_audience"` (`generate-campaign-analysis/index.ts:67`) —
 * prose, not a short line. Those campaigns read back through this same key, so truncating on
 * read would be a silent edit of existing data. Write short, read tolerant: this clamp applies
 * at the generation boundary, never to a round-trip of an already-stored audience.
 */
export const MAX_AUDIENCE_CHARS = 160;

/** Primary + at most this many alternates make up the swap options. */
const MAX_AUDIENCE_ALTERNATES = 2;

export function normalizeAudienceLine(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, MAX_AUDIENCE_CHARS);
}

export function normalizeCampaignTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tags = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const tag = entry.trim().toLowerCase();
    if (tag) tags.add(tag);
    if (tags.size >= MAX_CAMPAIGN_TAGS) break;
  }
  return [...tags];
}

/**
 * Every audience the business can pick from for this idea, primary first.
 * The caller filters out whichever one is currently selected, so swapping back to a
 * previous choice needs no extra state — the option set never changes.
 */
export function audienceSwapOptions(idea: {
  target_audience?: unknown;
  audience_alternates?: unknown;
}): string[] {
  const alternates = Array.isArray(idea.audience_alternates) ? idea.audience_alternates : [];
  const options = [idea.target_audience, ...alternates].map(normalizeAudienceLine).filter(Boolean);
  return [...new Set(options)].slice(0, MAX_AUDIENCE_ALTERNATES + 1);
}
