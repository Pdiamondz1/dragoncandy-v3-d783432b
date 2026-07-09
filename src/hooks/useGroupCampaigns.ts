import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hydrateCampaignFromAnalysis } from '@/hooks/useCampaignQueries';
import { getCoverImageUrl } from '@/lib/campaignUtils';
import { toExcludedCampaignIds, buildExcludedIdsFilter } from '@/hooks/campaignAvailability';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';

/** A private group ("crew") campaign — free collab, visible only to active members. */
export interface GroupCampaign extends PublicCampaign {
  group_id: string;
  /** Display name of the crew this campaign was posted to. */
  crew_name?: string | null;
}

/**
 * The member's private "My Crews" campaign feed. Mirrors `usePublicCampaigns` but
 * queries `group_id IS NOT NULL` published campaigns — RLS ("Users can view
 * accessible campaigns") already restricts rows to crews the current creator is an
 * active member of, so no client-side membership filter is needed. `group_id` is
 * included in the select (unlike `usePublicCampaigns`) so downstream UI can key on it
 * for the "Free collab" label and counter-offer suppression.
 */
export const useGroupCampaigns = (userId?: string) => {
  return useQuery({
    queryKey: ['group-campaigns', userId],
    queryFn: async () => {
      // Exclude campaigns already taken (accepted app / active-completed collaboration),
      // computed server-side via SECURITY DEFINER RPC — same rationale as usePublicCampaigns.
      const { data: unavailable, error: unavailableError } = await supabase
        .rpc('get_unavailable_campaign_ids');

      if (unavailableError) {
        console.error('Error fetching unavailable campaigns:', unavailableError);
        throw unavailableError;
      }

      const uniqueAssignedIds = toExcludedCampaignIds(unavailable);

      let query = supabase
        .from('campaigns')
        .select('id, user_id, group_id, title, description, goals, deliverables, platforms, budget_min, budget_max, deadline, status, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, escrow_status, escrow_payment_intent_id, ai_analysis, ai_preview_status, created_at, updated_at')
        .eq('status', 'published')
        .not('group_id', 'is', null);

      const excludeFilter = buildExcludedIdsFilter(uniqueAssignedIds);
      if (excludeFilter) {
        query = query.not('id', 'in', excludeFilter);
      }

      const { data: campaigns, error: campaignsError } = await query
        .order('created_at', { ascending: false });

      if (campaignsError) {
        console.error('Error fetching group campaigns:', campaignsError);
        throw campaignsError;
      }

      if (!campaigns || campaigns.length === 0) {
        return [];
      }

      const visibleCampaigns = campaigns;

      // Business profiles for the campaign owners
      const userIds = [...new Set(visibleCampaigns.map((c) => c.user_id))];
      const { data: businessProfiles, error: profilesError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, postal_code, city, country, location, profile_slug')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error fetching business profiles:', profilesError);
        throw profilesError;
      }

      const businessProfileMap = new Map(
        (businessProfiles || []).map((profile) => [profile.user_id, profile])
      );

      // Crew names (batched) — RLS on creator_groups allows active members to read the row.
      const groupIds = [
        ...new Set(visibleCampaigns.map((c) => c.group_id).filter((g): g is string => !!g)),
      ];
      const crewNameMap = new Map<string, string>();
      if (groupIds.length > 0) {
        const { data: groups } = await supabase
          .from('creator_groups')
          .select('id, name')
          .in('id', groupIds);
        for (const g of groups || []) crewNameMap.set(g.id, g.name);
      }

      // Cover images
      const campaignIds = visibleCampaigns.map((c) => c.id);
      const { data: allMedia } = await supabase
        .from('campaign_media')
        .select('campaign_id, media_type, file_url')
        .in('campaign_id', campaignIds)
        .in('media_type', ['reference_image', 'ai_preview'])
        .order('sort_order', { ascending: true });

      const mediaMap = new Map<string, Array<{ media_type: string; file_url: string }>>();
      for (const item of allMedia || []) {
        const list = mediaMap.get(item.campaign_id) || [];
        list.push(item);
        mediaMap.set(item.campaign_id, list);
      }

      // Deliverable counts + content types
      const { data: allDeliverables } = await supabase
        .from('campaign_deliverables')
        .select('campaign_id, content_type')
        .in('campaign_id', campaignIds);

      const deliverableCountMap = new Map<string, number>();
      const contentTypeMap = new Map<string, string[]>();
      for (const d of allDeliverables || []) {
        deliverableCountMap.set(d.campaign_id, (deliverableCountMap.get(d.campaign_id) || 0) + 1);
        const types = contentTypeMap.get(d.campaign_id) || [];
        if (!types.includes(d.content_type)) types.push(d.content_type);
        contentTypeMap.set(d.campaign_id, types);
      }

      const enrichedCampaigns = await Promise.all(
        visibleCampaigns.map(async (campaign) => {
          const { count } = await supabase
            .from('campaign_applications')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id);

          let userApplied = false;
          let applicationStatus: 'pending' | 'accepted' | 'rejected' | undefined = undefined;

          if (userId) {
            const { data: userApplication } = await supabase
              .from('campaign_applications')
              .select('id, status')
              .eq('campaign_id', campaign.id)
              .eq('creator_id', userId)
              .maybeSingle();

            userApplied = !!userApplication;
            applicationStatus = userApplication?.status as 'pending' | 'accepted' | 'rejected' | undefined;
          }

          const businessProfile = businessProfileMap.get(campaign.user_id);

          return {
            ...campaign,
            business_profile: businessProfile ? {
              business_name: businessProfile.business_name,
              logo_url: businessProfile.logo_url,
              postal_code: businessProfile.postal_code,
              city: businessProfile.city,
              country: businessProfile.country,
              location: businessProfile.location,
              profile_slug: businessProfile.profile_slug,
            } : undefined,
            application_count: count || 0,
            user_applied: userApplied,
            application_status: applicationStatus,
            crew_name: campaign.group_id ? crewNameMap.get(campaign.group_id) ?? null : null,
            ...(() => {
              const campaignMedia = mediaMap.get(campaign.id);
              const coverImage = getCoverImageUrl(
                campaignMedia,
                campaign.ai_preview_status,
                businessProfile?.logo_url
              );
              return {
                cover_image_url: coverImage.url ?? undefined,
                cover_image_type: coverImage.type,
              };
            })(),
            deliverable_count: deliverableCountMap.get(campaign.id)
              || campaign.deliverables?.length
              || 0,
            content_types: contentTypeMap.get(campaign.id) || [],
          };
        })
      );

      return enrichedCampaigns.map(hydrateCampaignFromAnalysis) as unknown as GroupCampaign[];
    },
    enabled: !!userId,
  });
};
