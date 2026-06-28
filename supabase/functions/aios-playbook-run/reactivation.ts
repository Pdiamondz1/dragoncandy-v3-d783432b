// Pure helpers for the get_reactivation_targets read tool. NO Deno/https/supabase
// imports at module scope so vitest loads it directly (see history.ts, doc-edits.ts).
// The index.ts case does the bounded DB fetches; this file shapes the rows.
// SCALE: fetches whole small tables + set logic in JS — fine pre-launch; revisit at scale.

export const TARGET_CAP = 15;
export const STALLED_MIN_DAYS = 14;
export const DORMANT_DAYS = 21;
export const MIN_ACCOUNT_DAYS = 7;

export interface Handle { channel: string; handle: string }

export function daysBetween(fromIso: string | null | undefined, nowIso: string): number {
  if (!fromIso) return Infinity;
  return Math.floor((new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export function pickHandle(p: {
  instagram_url?: string | null; tiktok_url?: string | null;
  youtube_url?: string | null; website_url?: string | null;
}): Handle | null {
  if (p.instagram_url) return { channel: "instagram", handle: p.instagram_url };
  if (p.tiktok_url) return { channel: "tiktok", handle: p.tiktok_url };
  if (p.youtube_url) return { channel: "youtube", handle: p.youtube_url };
  if (p.website_url) return { channel: "website", handle: p.website_url };
  return null;
}

export interface RawCampaign { id: string; title: string | null; user_id: string; created_at: string; updated_at: string | null }
export interface RawCollab { campaign_id: string; creator_id: string | null; status: string | null; content_status: string | null; updated_at: string | null; completed_at: string | null }
export interface RawBusiness { user_id: string; business_name: string | null; instagram_url?: string | null; website_url?: string | null; created_at?: string }
export interface RawCreator { user_id: string; creator_name: string | null; instagram_url?: string | null; tiktok_url?: string | null; youtube_url?: string | null; created_at: string; skills?: string[] | null }
export interface RawRestaurant extends RawBusiness { created_at: string }

export interface StalledTarget {
  campaign_id: string; title: string; days_stalled: number;
  business_name: string | null; business_handle: Handle | null;
  creator_name: string | null; creator_handle: Handle | null; blocker: string;
}
export interface DormantTarget { creator_name: string; handle: Handle | null; days_since_activity: number | null; skills: string[] }
export interface LapsedTarget { business_name: string; handle: Handle | null; days_since_signup: number; reason: string }

export function computeStalledCampaigns(input: {
  campaigns: RawCampaign[]; collaborations: RawCollab[];
  businessByUserId: Record<string, RawBusiness>; creatorByUserId: Record<string, RawCreator>; nowIso: string;
}): StalledTarget[] {
  const { campaigns, collaborations, businessByUserId, creatorByUserId, nowIso } = input;
  const byCampaign = new Map<string, RawCollab[]>();
  for (const c of collaborations) {
    const arr = byCampaign.get(c.campaign_id) ?? [];
    arr.push(c); byCampaign.set(c.campaign_id, arr);
  }
  const out: StalledTarget[] = [];
  for (const cam of campaigns) {
    // Stalled by CAMPAIGN AGE (created_at). No publish_at column exists; created_at matches the
    // tool contract ("published/active >14d") and — unlike updated_at — is NOT reset by routine
    // edits, so an edited-but-stuck campaign is still surfaced. Report-only, so we err toward
    // surfacing (a rare just-published-very-old-draft over-flag is harmless; the founder skips it).
    if (daysBetween(cam.created_at, nowIso) < STALLED_MIN_DAYS) continue;
    const collabs = byCampaign.get(cam.id) ?? [];
    if (collabs.some((c) => c.status === "completed")) continue;
    // Only an 'active' collaboration means a creator is mid-work; 'cancelled' rows don't count
    // (else we'd nudge a creator whose collaboration was already cancelled).
    const activeCollab = collabs.find((c) => c.status === "active");
    const biz = businessByUserId[cam.user_id] ?? null;
    let creator: RawCreator | null = null;
    let blocker: string;
    if (!activeCollab) {
      blocker = "No creator engaged yet — nudge the business to refresh or invite creators.";
    } else {
      creator = activeCollab.creator_id ? creatorByUserId[activeCollab.creator_id] ?? null : null;
      blocker = "Collaboration started but content not delivered — nudge business + creator to finish.";
    }
    out.push({
      campaign_id: cam.id,
      title: cam.title ?? "(untitled campaign)",
      days_stalled: daysBetween(cam.created_at, nowIso),
      business_name: biz?.business_name ?? null,
      business_handle: biz ? pickHandle(biz) : null,
      creator_name: creator?.creator_name ?? null,
      creator_handle: creator ? pickHandle(creator) : null,
      blocker,
    });
  }
  return out;
}

export function computeDormantCreators(input: {
  creators: RawCreator[]; lastActivityByUserId: Record<string, string>; nowIso: string;
}): DormantTarget[] {
  const { creators, lastActivityByUserId, nowIso } = input;
  const out: DormantTarget[] = [];
  for (const c of creators) {
    const last = lastActivityByUserId[c.user_id];
    const daysSince = last ? daysBetween(last, nowIso) : null;
    // Inactivity clock: days since last activity, or account age if they never acted.
    // A never-active creator counts as dormant only once the account is >= DORMANT_DAYS old.
    const inactiveDays = daysSince ?? daysBetween(c.created_at, nowIso);
    if (inactiveDays < DORMANT_DAYS) continue;
    out.push({
      creator_name: c.creator_name ?? "(unnamed creator)",
      handle: pickHandle(c),
      days_since_activity: daysSince,
      skills: c.skills ?? [],
    });
  }
  return out;
}

export function computeLapsedRestaurants(input: {
  restaurants: RawRestaurant[]; campaignOwnerIds: string[]; boosterIds: string[]; nowIso: string;
}): LapsedTarget[] {
  const { restaurants, nowIso } = input;
  const owners = new Set(input.campaignOwnerIds);
  const boosters = new Set(input.boosterIds);
  const out: LapsedTarget[] = [];
  for (const r of restaurants) {
    if (daysBetween(r.created_at, nowIso) < MIN_ACCOUNT_DAYS) continue;
    const launched = owners.has(r.user_id);
    const boosted = boosters.has(r.user_id);
    if (launched && boosted) continue;
    const reason = !launched && !boosted
      ? "Signed up but never launched a campaign or boosted content."
      : !launched
        ? "Has boosted but never launched a campaign."
        : "Has launched a campaign but never boosted creator content.";
    out.push({
      business_name: r.business_name ?? "(unnamed restaurant)",
      handle: pickHandle(r),
      days_since_signup: daysBetween(r.created_at, nowIso),
      reason,
    });
  }
  return out;
}

export interface Segment<T> { items: T[]; total: number }
export interface ReactivationResult {
  generated_at: string;
  stalled_campaigns: Segment<StalledTarget>;
  dormant_creators: Segment<DormantTarget>;
  lapsed_restaurants: Segment<LapsedTarget>;
}
function cap<T>(arr: T[]): Segment<T> { return { items: arr.slice(0, TARGET_CAP), total: arr.length }; }

export function buildReactivationTargets(input: {
  nowIso: string;
  campaigns: RawCampaign[]; collaborations: RawCollab[];
  businessByUserId: Record<string, RawBusiness>; creatorByUserId: Record<string, RawCreator>;
  creators: RawCreator[]; lastActivityByUserId: Record<string, string>;
  restaurants: RawRestaurant[]; campaignOwnerIds: string[]; boosterIds: string[];
}): ReactivationResult {
  return {
    generated_at: input.nowIso,
    stalled_campaigns: cap(computeStalledCampaigns(input)),
    dormant_creators: cap(computeDormantCreators({ creators: input.creators, lastActivityByUserId: input.lastActivityByUserId, nowIso: input.nowIso })),
    lapsed_restaurants: cap(computeLapsedRestaurants({ restaurants: input.restaurants, campaignOwnerIds: input.campaignOwnerIds, boosterIds: input.boosterIds, nowIso: input.nowIso })),
  };
}
