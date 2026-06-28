// Pure helpers for the get_recent_milestones read tool (Dezzy milestone-celebration playbook).
// NO Deno/https/supabase imports at module scope so vitest loads it directly (see reactivation.ts).
// index.ts does the bounded service-role `admin` fetches; this file shapes rows — PUBLIC profiles only.
import { pickHandle, type Handle } from "./reactivation.ts";

export const MILESTONE_CAP = 15;
export const MILESTONE_WINDOW_DAYS = 30;

// Friendly labels for the common celebration events; fallback humanizes the suffix.
const MILESTONE_LABELS: Record<string, string> = {
  "creator.first_campaign": "Completed their first campaign",
  "creator.first_boost": "Earned their first boost",
  "creator.first_post_bonus": "Submitted their first post",
  "creator.first_application": "Sent their first application",
  "creator.first_social": "Connected their first social account",
  "business.first_campaign": "Completed their first campaign", // DRE emits this on status='completed' (creation = first_campaign_created)
  "business.first_campaign_created": "Created their first campaign",
  "business.first_boost_bonus": "Gave their first boost",
  "business.first_social": "Connected their first social account",
};

export function friendlyMilestone(eventType: string): string {
  if (MILESTONE_LABELS[eventType]) return MILESTONE_LABELS[eventType];
  const m = eventType.match(/milestone_campaigns_(\d+)/);
  if (m) return `Reached ${m[1]} completed campaigns`;
  const tail = eventType.includes(".") ? eventType.split(".").slice(1).join(".") : eventType;
  return tail.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Tier display labels — KEEP IN SYNC with src/lib/dragonTiers.ts (edge fns can't import the frontend
// module). Returns the current label, or null if the key is unknown / absent. NEVER default to the
// egg/"Rising" floor (getDragonTier does) — asserting an unreached tier in a public post is wrong.
const TIER_LABELS: Record<string, string> = {
  egg: "Rising",
  scout: "Established",
  knight: "Pro",
  master: "Elite",
  legend: "Icon",
};

export function tierLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return TIER_LABELS[key] ?? null;
}

export interface RawMilestoneEvent { user_id: string; event_type: string; occurred_at: string }
export interface RawMilestoneCreator {
  user_id: string; creator_name: string | null;
  instagram_url?: string | null; tiktok_url?: string | null; youtube_url?: string | null; website_url?: string | null;
}
export interface RawMilestoneBusiness {
  user_id: string; business_name: string | null;
  instagram_url?: string | null; website_url?: string | null;
}
export interface RawBalance { user_id: string; tier: string | null }

export interface MilestoneItem {
  name: string;
  role: "creator" | "business";
  handle: Handle | null;
  milestone: string;
  event_type: string;
  occurred_at: string;
  tier_label: string | null;
}
export interface MilestoneResult {
  generated_at: string;
  milestones: { items: MilestoneItem[]; total: number };
}

export function buildRecentMilestones(input: {
  nowIso: string;
  events: RawMilestoneEvent[];
  creators: RawMilestoneCreator[];
  businesses: RawMilestoneBusiness[];
  balances: RawBalance[];
}): MilestoneResult {
  const creatorById = new Map(input.creators.map((c) => [c.user_id, c]));
  const businessById = new Map(input.businesses.map((b) => [b.user_id, b]));
  const tierById = new Map(input.balances.map((b) => [b.user_id, b.tier]));

  const items: MilestoneItem[] = [];
  for (const e of input.events) {
    // Resolve the profile by the event_type ROLE PREFIX (creator.* / business.*), NOT creator-first:
    // a user can have BOTH a creator and a business profile, and a business.* milestone must use the
    // business identity (and vice-versa). Privacy keystone: the maps contain ONLY
    // profile_visibility='public' rows (filtered in index.ts), so if the RELEVANT role's public
    // profile is absent we SKIP — we never surface a non-public achiever, and never borrow the other
    // role's identity for a milestone that isn't theirs.
    let role: "creator" | "business" | null = null;
    let name: string | null = null;
    let handle: Handle | null = null;
    if (e.event_type.startsWith("business.")) {
      const b = businessById.get(e.user_id);
      if (b) { role = "business"; name = b.business_name ?? "(unnamed business)"; handle = pickHandle(b); }
    } else if (e.event_type.startsWith("creator.")) {
      const c = creatorById.get(e.user_id);
      if (c) { role = "creator"; name = c.creator_name ?? "(unnamed creator)"; handle = pickHandle(c); }
    } else {
      // Unknown/unprefixed event (defensive — the query only matches creator./business. events):
      // prefer a public creator, then a public business.
      const c = creatorById.get(e.user_id);
      const b = businessById.get(e.user_id);
      if (c) { role = "creator"; name = c.creator_name ?? "(unnamed creator)"; handle = pickHandle(c); }
      else if (b) { role = "business"; name = b.business_name ?? "(unnamed business)"; handle = pickHandle(b); }
    }
    if (!role) continue;
    items.push({
      name: name as string,
      role,
      handle,
      milestone: friendlyMilestone(e.event_type),
      event_type: e.event_type,
      occurred_at: e.occurred_at,
      tier_label: tierLabel(tierById.get(e.user_id)),
    });
  }
  // total = post-skip (public-only) count, mirroring reactivation.ts cap().
  return {
    generated_at: input.nowIso,
    milestones: { items: items.slice(0, MILESTONE_CAP), total: items.length },
  };
}
