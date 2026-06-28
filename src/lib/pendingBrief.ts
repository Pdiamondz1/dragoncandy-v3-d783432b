// Honors the landing "Save this brief — sign up free" promise. A guest's brief is
// stashed in localStorage['pendingBrief'] by BriefGeneratorPreview, then read here at
// new-user onboarding completion to drop the user into the campaign builder pre-filled
// (via its existing ?brief= mechanism). Always clears the key once seen.

const KEY = 'pendingBrief';

export type ConsumableRole = 'business_client' | 'content_creator' | 'brand';

interface StoredBrief {
  campaign_name?: string;
  campaign_description?: string;
  target_audience?: string;
  content_suggestions?: string[];
  // Alternate shape BriefGeneratorPreview also accepts (title/description fallbacks).
  title?: string;
  description?: string;
}

/** Concise prompt summary fed to the campaign builder's ?brief= pre-fill. */
export function briefToText(brief: StoredBrief): string {
  const parts: string[] = [];
  const name = brief.campaign_name || brief.title;
  const desc = brief.campaign_description || brief.description;
  if (name) parts.push(name);
  if (desc) parts.push(desc);
  if (brief.target_audience) parts.push(`Target audience: ${brief.target_audience}`);
  const ideas = (brief.content_suggestions ?? []).filter(Boolean);
  if (ideas.length) parts.push(`Content ideas: ${ideas.join('; ')}`);
  return parts.join('. ');
}

// Only campaign-creating roles have a builder to drop into. content_creator has none.
const CREATE_ROUTE: Partial<Record<ConsumableRole, string>> = {
  business_client: '/dashboard/business/campaigns/create',
  brand: '/dashboard/brand/campaigns/create',
};

/**
 * Read + ALWAYS clear pendingBrief. Returns a campaign-builder redirect (brief
 * pre-filled via ?brief=) for a campaign-creating role; null otherwise
 * (creator, malformed JSON, empty, or absent). Never throws.
 */
export function consumePendingBrief(role: ConsumableRole): { redirectTo: string } | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null; // localStorage unavailable (private mode, etc.)
  }
  if (!raw) return null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }

  const base = CREATE_ROUTE[role];
  if (!base) return null; // creator: no builder

  let brief: StoredBrief;
  try { brief = JSON.parse(raw); } catch { return null; } // malformed — already cleared
  const text = briefToText(brief);
  if (!text) return null;
  return { redirectTo: `${base}?brief=${encodeURIComponent(text)}` };
}
