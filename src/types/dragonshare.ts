export type MonetizationType = 'brand_boost' | 'performance_bounty' | 'affiliate';
export type ContentType = 'photo' | 'video' | 'reel' | 'story' | 'carousel';
export type PostPlatform = 'instagram' | 'tiktok' | 'youtube' | 'x' | 'facebook' | 'other';
export type PostStatus = 'pending_verification' | 'verified' | 'rejected' | 'expired';
export type BoostStatus = 'available' | 'boosted' | 'expired' | 'withdrawn';
export type BoostPaymentStatus = 'pending' | 'captured' | 'transferred' | 'refunded' | 'failed';
export type PayoutStatus = 'pending' | 'succeeded' | 'failed' | 'reversed';
export type BoostTierLabel = '25' | '50' | '100' | '250' | 'custom';

export const BOOST_TIERS = [
  { label: '25' as const, cents: 2500, display: '$25' },
  { label: '50' as const, cents: 5000, display: '$50' },
  { label: '100' as const, cents: 10000, display: '$100' },
  { label: '250' as const, cents: 25000, display: '$250' },
] as const;

export const DRAGONSHARE_FEE_RATE = 0.20;

export interface DragonSharePost {
  id: string;
  creator_id: string;
  target_org_id: string;
  target_org_unit_id: string | null;
  monetization_type: MonetizationType;
  content_type: ContentType;
  platform: PostPlatform;
  post_url: string;
  screenshot_url: string | null;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  status: PostStatus;
  verification_method: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  donny_recommended_tier: number | null;
  donny_score: number | null;
  donny_reach_estimate: number | null;
  boost_status: BoostStatus;
  submitted_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface DragonSharePostWithRelations extends DragonSharePost {
  creator?: { id: string; full_name: string; avatar_url: string | null };
  target_org?: { id: string; name: string; logo_url: string | null };
  boosts?: DragonShareBoost[];
}

export interface DragonShareBoost {
  id: string;
  post_id: string;
  boosting_org_id: string;
  boosting_user_id: string;
  amount_cents: number;
  tier_label: BoostTierLabel;
  platform_fee_cents: number;
  creator_payout_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  status: BoostPaymentStatus;
  boosted_at: string;
  captured_at: string | null;
  transferred_at: string | null;
}

export interface DragonSharePayout {
  id: string;
  boost_id: string;
  creator_id: string;
  amount_cents: number;
  stripe_transfer_id: string | null;
  status: PayoutStatus;
  failure_reason: string | null;
  processed_at: string | null;
}

export interface DonnyScoreResult {
  estimated_reach: number;
  recommended_tier: 25 | 50 | 100 | 250;
  match_quality: number;
  rationale: string;
}
