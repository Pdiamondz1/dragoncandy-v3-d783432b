import type { Json } from '@/integrations/supabase/types';

export type UserRole = 'business_client' | 'content_creator' | 'brand';

export interface RestaurantMissions {
  browse_inspiration: boolean;
  create_campaign: boolean;
  launch_campaign: boolean;
  setup_payments: boolean;
  completed_at?: string;
}

export interface CreatorMissions {
  view_campaigns: boolean;
  add_portfolio: boolean;
  apply_campaign: boolean;
  setup_payouts: boolean;
  completed_at?: string;
}

export interface BrandMissions {
  select_style: boolean;
  browse_creators: boolean;
  create_sponsorship: boolean;
  completed_at?: string;
}

export type RoleMissions = RestaurantMissions | CreatorMissions | BrandMissions;

export interface InspirationRef {
  media_url: string;
  creator_name: string;
  content_label: string;
  media_type: 'image' | 'video';
}

export function parseFirstRunMissions(
  json: Json | null,
  role: UserRole
): RoleMissions | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  if (obj.completed_at) return obj as unknown as RoleMissions;

  switch (role) {
    case 'business_client':
      if ('browse_inspiration' in obj) {
        if (!('setup_payments' in obj)) (obj as Record<string, unknown>).setup_payments = false;
        return obj as unknown as RestaurantMissions;
      }
      break;
    case 'content_creator':
      if ('view_campaigns' in obj) {
        if (!('setup_payouts' in obj)) (obj as Record<string, unknown>).setup_payouts = false;
        return obj as unknown as CreatorMissions;
      }
      break;
    case 'brand':
      if ('select_style' in obj) return obj as unknown as BrandMissions;
      break;
  }
  return null;
}

export function getInitialMissions(role: UserRole): RoleMissions {
  switch (role) {
    case 'business_client':
      return { browse_inspiration: false, create_campaign: false, launch_campaign: false, setup_payments: false };
    case 'content_creator':
      return { view_campaigns: false, add_portfolio: false, apply_campaign: false, setup_payouts: false };
    case 'brand':
      return { select_style: false, browse_creators: false, create_sponsorship: false };
  }
}

export function areMissionsComplete(missions: RoleMissions): boolean {
  if ('completed_at' in missions && missions.completed_at) return true;
  const { completed_at, ...flags } = missions as Record<string, unknown>;
  return Object.values(flags).every((v) => v === true);
}

export const BRAND_CONTENT_STYLES = [
  'UGC Reels',
  'Flat-lay Product',
  'Behind the Scenes',
  'Event Coverage',
  'Food Photography',
  'Lifestyle',
  'Testimonial',
  'Unboxing',
] as const;
