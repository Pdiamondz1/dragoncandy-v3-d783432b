export interface Organization {
  id: string;
  name: string;
  org_type: 'restaurant' | 'brand';
  slug: string | null;
  logo_url: string | null;
  billing_email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_tier: 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';
  take_rate: number;
  active_campaign_limit: number;
  seat_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  hard_purge_at: string | null;
}

export interface OrgUnit {
  id: string;
  org_id: string;
  unit_type: 'location' | 'product';
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  website_url: string | null;
  logo_url: string | null;
  is_primary: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'standard';
  invited_by: string | null;
  invitation_status: 'invited' | 'active' | 'suspended';
  invited_at: string | null;
  joined_at: string | null;
  last_active_at: string | null;
  full_name?: string | null;
  email?: string;
  avatar_url?: string | null;
}

export interface AccountDeletionRequest {
  id: string;
  requested_by: string;
  target_type: 'org' | 'org_unit' | 'member' | 'user_self';
  target_id: string;
  status: 'pending' | 'soft_deleted' | 'hard_purged' | 'restored' | 'rejected';
  reason_code: string | null;
  soft_deleted_at: string | null;
  hard_purge_scheduled_at: string | null;
  hard_purged_at: string | null;
  restored_at: string | null;
  notes: string | null;
  created_at: string;
}

export type OrgRole = 'owner' | 'admin' | 'standard';

export const SEAT_LIMITS: Record<string, { included: number; maxAdditional: number | null; additionalPriceMonthly: number }> = {
  free: { included: 1, maxAdditional: 0, additionalPriceMonthly: 0 },
  starter: { included: 1, maxAdditional: 3, additionalPriceMonthly: 29 },
  growth: { included: 5, maxAdditional: 15, additionalPriceMonthly: 39 },
  pro: { included: 15, maxAdditional: null, additionalPriceMonthly: 49 },
  enterprise: { included: 999, maxAdditional: null, additionalPriceMonthly: 0 },
};
