
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CampaignAnalysis, StyleDirection } from '@/types/campaign';

export function hydrateCampaignFromAnalysis<T extends Campaign>(campaign: T): T {
  const ai = campaign.ai_analysis as Record<string, unknown> | null;
  if (!ai) return campaign;
  return {
    ...campaign,
    tagline: campaign.tagline || (ai.tagline as string) || undefined,
    campaign_type: campaign.campaign_type || (ai.campaign_type as string) || undefined,
    per_creator_cap: campaign.per_creator_cap ?? (ai.per_creator_cap as number) ?? undefined,
    usage_rights_days: campaign.usage_rights_days ?? (ai.usage_rights_days as number) ?? undefined,
    exclusivity_days: campaign.exclusivity_days ?? (ai.exclusivity_days as number) ?? undefined,
    geographic_scope: campaign.geographic_scope || (ai.geographic_scope as Campaign['geographic_scope']) || undefined,
    creator_count: campaign.creator_count ?? (ai.creator_count as number) ?? undefined,
    target_creator_personas: campaign.target_creator_personas?.length
      ? campaign.target_creator_personas
      : (ai.target_creator_personas as string[]) || (ai.target_creator_persona as string[]) || undefined,
    hashtag_requirements: campaign.hashtag_requirements
      || (Array.isArray(ai.hashtags) ? (ai.hashtags as string[]).join(' ') : (ai.hashtag_requirements as string))
      || undefined,
    key_messages: campaign.key_messages?.length
      ? campaign.key_messages
      : (ai.key_messages as string[]) || undefined,
    style_direction: campaign.style_direction || (ai.style_direction as StyleDirection) || undefined,
    tier_reasoning: campaign.tier_reasoning || (ai.tier_reasoning as string) || undefined,
    delivery_fee: campaign.delivery_fee ?? (ai.delivery_fee as number) ?? undefined,
  };
}

export interface Campaign {
  id: string;
  user_id: string;
  org_unit_id?: string | null;
  title: string;
  description?: string;
  goals?: string;
  deliverables?: string[];
  platforms?: string[];
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  style?: string;
  tone?: string;
  open_for_sponsorship?: boolean;
  // DragonDash fields
  delivery_type?: 'standard' | 'expedited' | 'dragonrush';
  delivery_fee?: number;
  pricing_type?: 'fixed' | 'bid_range';
  fixed_price?: number;
  escrow_status?: 'none' | 'pending' | 'held' | 'released' | 'refunded';
  escrow_payment_intent_id?: string;
  // Campaign detail fields
  tagline?: string;
  campaign_type?: string;
  per_creator_cap?: number;
  usage_rights_days?: number;
  exclusivity_days?: number;
  geographic_scope?: 'city' | 'region' | 'national';
  creator_count?: number;
  target_creator_personas?: string[];
  hashtag_requirements?: string;
  // AI-generated campaign analysis
  ai_analysis?: CampaignAnalysis | null;
  ai_preview_status?: string | null;
  // Hydrated from ai_analysis (not DB columns)
  key_messages?: string[];
  style_direction?: string | StyleDirection;
  tier_reasoning?: string;
  created_at: string;
  updated_at: string;
}

export const useCampaignsList = (filterByOwnership: boolean = true, orgUnitId?: string | null) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaigns', user?.id, filterByOwnership, orgUnitId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('campaigns')
        .select('id, user_id, org_unit_id, title, description, goals, deliverables, platforms, budget_min, budget_max, deadline, status, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, escrow_status, escrow_payment_intent_id, ai_analysis, ai_preview_status, created_at, updated_at');

      // If filtering by ownership, only return user's own campaigns
      if (filterByOwnership && user?.id) {
        query = query.eq('user_id', user.id);
      }

      if (orgUnitId) {
        query = query.eq('org_unit_id', orgUnitId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching campaigns:', error);
        throw error;
      }

      return (data as unknown as Campaign[]).map(hydrateCampaignFromAnalysis);
    },
    enabled: !!user,
  });
};

export const useCampaignById = (id: string) => {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, user_id, org_unit_id, title, description, goals, deliverables, platforms, budget_min, budget_max, deadline, status, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, escrow_status, escrow_payment_intent_id, ai_analysis, ai_preview_status, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching campaign:', error);
        throw error;
      }

      return hydrateCampaignFromAnalysis(data as unknown as Campaign);
    },
    enabled: !!id,
  });
};
