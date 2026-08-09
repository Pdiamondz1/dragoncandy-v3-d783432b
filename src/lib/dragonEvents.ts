// Presentation only — maps a dragon_point_events.event_type key to human copy.
// MIRRORED, INTENTIONALLY, IN: supabase/functions/_shared/dre-events.ts
// (the frontend cannot import from supabase/functions/). dragonEvents.test.ts
// fails if the two drift. Keep one entry per line, single-quoted, no apostrophes
// in labels — the parity test regex-parses the edge file as text.
export interface DragonEventMeta {
  label: string;
  /** false = one-time award; drives the "already earned" check in the earn catalog. */
  repeatable: boolean;
}

export const DRAGON_EVENTS: Record<string, DragonEventMeta> = {
  'creator.profile_completed': { label: 'Completed your creator profile', repeatable: false },
  'creator.first_social': { label: 'Linked your first social account', repeatable: false },
  'creator.post_submitted': { label: 'Submitted a DragonShare post', repeatable: true },
  'creator.first_post_bonus': { label: 'First DragonShare post bonus', repeatable: false },
  'creator.first_application': { label: 'Applied to your first campaign', repeatable: false },
  'creator.first_campaign': { label: 'Completed your first campaign', repeatable: false },
  'creator.first_boost': { label: 'Received your first boost payout', repeatable: false },
  'creator.five_star': { label: 'Earned a 5-star review', repeatable: true },
  'creator.milestone_campaigns_3': { label: 'Completed 3 campaigns', repeatable: false },
  'creator.milestone_campaigns_10': { label: 'Completed 10 campaigns', repeatable: false },
  'creator.milestone_campaigns_25': { label: 'Completed 25 campaigns', repeatable: false },
  'creator.milestone_campaigns_50': { label: 'Completed 50 campaigns', repeatable: false },
  'business.profile_completed': { label: 'Completed your business profile', repeatable: false },
  'business.first_social': { label: 'Linked your first social account', repeatable: false },
  'business.first_campaign_created': { label: 'Created your first campaign', repeatable: false },
  'business.first_campaign': { label: 'Completed your first campaign', repeatable: false },
  'business.campaign_launched': { label: 'Launched a campaign', repeatable: true },
  'business.boost_given': { label: 'Boosted a creator post', repeatable: true },
  'business.first_boost_bonus': { label: 'First boost bonus', repeatable: false },
  'business.rate_creator': { label: 'Rated a creator', repeatable: true },
  'business.five_star_bonus': { label: 'Gave a 5-star rating', repeatable: true },
  'business.milestone_campaigns_5': { label: 'Completed 5 campaigns', repeatable: false },
  'business.milestone_campaigns_10': { label: 'Completed 10 campaigns', repeatable: false },
  'business.milestone_campaigns_25': { label: 'Completed 25 campaigns', repeatable: false },
  'business.milestone_campaigns_50': { label: 'Completed 50 campaigns', repeatable: false },
};

/** Never throws and never shows a raw key: dre_config can add an event without a deploy. */
export function getDragonEvent(eventType: string): DragonEventMeta {
  const known = DRAGON_EVENTS[eventType];
  if (known) return known;
  const tail = eventType.includes('.') ? eventType.split('.').slice(1).join('.') : eventType;
  const words = tail.replace(/_/g, ' ').trim();
  if (!words) return { label: 'DC Points earned', repeatable: false };
  return { label: words.charAt(0).toUpperCase() + words.slice(1), repeatable: false };
}
