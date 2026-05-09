import type { ContentType, Platform, AspectRatio, DeliveryTier, Deliverable } from './campaignMedia';
import type { InspirationRef } from '@/types/firstRun';

export interface BusinessContext {
  source_url: string;
  source_type: 'google_business' | 'instagram' | 'website' | 'yelp' | 'photo' | 'manual';
  business_name: string;
  cuisine_type?: string | null;
  location: { city: string; state?: string | null; country: string };
  rating?: number | null;
  review_count?: number | null;
  price_range?: '$' | '$$' | '$$$' | '$$$$' | null;
  photos: string[];
  vibe_tags: string[];
  hours?: Record<string, string> | null;
  social_links?: { instagram?: string | null; tiktok?: string | null; website?: string | null } | null;
  review_highlights: string[];
}

export interface IdeaDeliverable {
  description: string;
  content_type: ContentType;
  platform: Platform;
  aspect_ratio: AspectRatio;
  estimated_duration?: number | null;
}

export type CampaignType = 'ugc_content' | 'launch_hype' | 'ongoing_presence' | 'event_promo' | 'seasonal';

export interface CampaignIdea {
  id: string;
  emoji: string;
  title: string;
  description: string;
  tagline?: string;
  campaign_type: CampaignType;
  recommended_platforms: Platform[];
  deliverables: IdeaDeliverable[];
  budget_range: { min: number; max: number };
  timeline_days: number;
  tier: DeliveryTier;
  tier_reasoning: string;
  style_direction: string;
  target_creator_persona: string[];
  key_messages: string[];
  hashtags: string[];
}

export interface EditableCampaign {
  title: string;
  description: string;
  tagline: string;
  campaign_type: CampaignType;
  platforms: Platform[];
  deliverables: Deliverable[];
  budget_min: number;
  budget_max: number;
  per_creator_cap: number;
  usage_rights_days: number;
  exclusivity_days: number;
  deadline: string;
  delivery_type: 'standard' | 'expedited' | 'dragonrush';
  geographic_scope: 'city' | 'region' | 'national';
  target_creator_count: number;
  style_direction: string;
  target_creator_persona: string[];
  key_messages: string[];
  hashtags: string[];
  tier_reasoning: string;
  emoji: string;
  original_idea_id: string;
}

export interface BrandFields {
  budget_pool: number;
  per_creator_cap: number;
  usage_rights_days: number;
  exclusivity_days: number;
  geographic_scope: 'city' | 'region' | 'national';
  target_creator_count: number;
  tagline?: string;
}

export interface DonnyGenerateRequest {
  source_url?: string;
  source_type: BusinessContext['source_type'];
  photo_url?: string;
  manual_text?: string;
  role: 'business_client' | 'brand' | null;
  inspiration_refs?: InspirationRef[];
}

export interface DonnyGenerateResponse {
  business_context: BusinessContext;
  campaign_ideas: CampaignIdea[];
}
