import type { Json } from '@/integrations/supabase/types';

export type UserRole = 'business_client' | 'content_creator' | 'brand';

/**
 * ONLY non-derivable "did the user look at this once" events live here.
 * Everything with a row to derive from — payments, portfolio, campaigns,
 * applications, sponsorships — is now a derived requirement in
 * src/lib/accountReadiness. Two writers for one fact is the drift class this
 * project has already been bitten by twice.
 *
 * The column is NOT dropped and legacy blobs keep parsing: removed keys are
 * simply ignored.
 */
export interface RestaurantMissions {
  browse_inspiration: boolean;
  completed_at?: string;
}

export interface CreatorMissions {
  view_campaigns: boolean;
  completed_at?: string;
}

export interface BrandMissions {
  select_style: boolean;
  browse_creators: boolean;
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
        return obj as unknown as RestaurantMissions;
      }
      break;
    case 'content_creator':
      if ('view_campaigns' in obj) {
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
      return { browse_inspiration: false };
    case 'content_creator':
      return { view_campaigns: false };
    case 'brand':
      return { select_style: false, browse_creators: false };
  }
}

export function areMissionsComplete(missions: RoleMissions): boolean {
  if ('completed_at' in missions && missions.completed_at) return true;
  const { completed_at: _completed_at, ...flags } = missions as unknown as Record<string, unknown>;
  // Legacy blobs carry keys that are now derived; a stale `false` on one of them
  // must not keep a user in first-run forever.
  const live = Object.entries(flags).filter(([k]) =>
    ['browse_inspiration', 'view_campaigns', 'select_style', 'browse_creators'].includes(k),
  );
  return live.length > 0 && live.every(([, v]) => v === true);
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
