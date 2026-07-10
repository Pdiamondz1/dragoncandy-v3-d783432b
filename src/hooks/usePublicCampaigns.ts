
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Campaign, hydrateCampaignFromAnalysis } from '@/hooks/useCampaignQueries';
import { getCoverImageUrl } from '@/lib/campaignUtils';
import { toExcludedCampaignIds, buildExcludedIdsFilter } from '@/hooks/campaignAvailability';

export interface PublicCampaign extends Campaign {
  business_profile?: {
    business_name: string;
    logo_url?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    location?: string; // Legacy location field for fallback filtering
    profile_slug?: string;
  };
  application_count?: number;
  user_applied?: boolean;
  application_status?: 'pending' | 'accepted' | 'rejected';
  cover_image_url?: string;
  cover_image_type?: 'reference' | 'ai_preview' | 'logo' | 'gradient';
  deliverable_count?: number;
  content_types?: string[];
}

export const usePublicCampaigns = (userId?: string) => {
  return useQuery({
    queryKey: ['public-campaigns', userId],
    queryFn: async () => {
      // Get campaign IDs that are already taken (accepted application or
      // active/completed collaboration). This runs server-side via a
      // SECURITY DEFINER RPC because RLS on campaign_collaborations /
      // campaign_applications hides other creators' rows — computing the
      // exclusion list client-side would let taken campaigns leak through.
      const { data: unavailable, error: unavailableError } = await supabase
        .rpc('get_unavailable_campaign_ids');

      if (unavailableError) {
        console.error('Error fetching unavailable campaigns:', unavailableError);
        throw unavailableError;
      }

      const uniqueAssignedIds = toExcludedCampaignIds(unavailable);
      // Get published campaigns excluding assigned ones
      let query = supabase
        .from('campaigns')
        .select('id, user_id, title, description, goals, deliverables, platforms, budget_min, budget_max, deadline, status, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, escrow_status, escrow_payment_intent_id, ai_analysis, ai_preview_status, created_at, updated_at')
        .eq('status', 'published')
        // Never surface private group ("crew") campaigns in the public marketplace (and
        // transitively Donny Picks, which ranks over this array) — a group-campaign leak vector.
        .is('group_id', null);

      // Only add the not.in filter if there are campaigns to exclude
      const excludeFilter = buildExcludedIdsFilter(uniqueAssignedIds);
      if (excludeFilter) {
        query = query.not('id', 'in', excludeFilter);
      }

      const { data: campaigns, error: campaignsError } = await query
        .order('created_at', { ascending: false });

      if (campaignsError) {
        console.error('Error fetching campaigns:', campaignsError);
        throw campaignsError;
      }

      if (!campaigns || campaigns.length === 0) {
        return [];
      }

      // All published campaigns are visible — escrow is paid after hire, not before listing
      const visibleCampaigns = campaigns;

      // Get unique user IDs from visible campaigns
      const userIds = [...new Set(visibleCampaigns.map(campaign => campaign.user_id))];

      // Fetch business profiles for these users
      const { data: businessProfiles, error: profilesError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, postal_code, city, country, location, profile_slug')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error fetching business profiles:', profilesError);
        throw profilesError;
      }

      // Create a map of user_id to business profile for quick lookup
      const businessProfileMap = new Map(
        (businessProfiles || []).map(profile => [profile.user_id, profile])
      );

      // Batch fetch cover images: first reference_image or ai_preview per campaign
      const campaignIds = visibleCampaigns.map(c => c.id);

      const { data: allMedia } = await supabase
        .from('campaign_media')
        .select('campaign_id, media_type, file_url')
        .in('campaign_id', campaignIds)
        .in('media_type', ['reference_image', 'ai_preview'])
        .order('sort_order', { ascending: true });

      // Build a map of campaign_id -> media items
      const mediaMap = new Map<string, Array<{ media_type: string; file_url: string }>>();
      for (const item of allMedia || []) {
        const list = mediaMap.get(item.campaign_id) || [];
        list.push(item);
        mediaMap.set(item.campaign_id, list);
      }

      // Batch fetch deliverable counts and content types
      const { data: allDeliverables } = await supabase
        .from('campaign_deliverables')
        .select('campaign_id, content_type')
        .in('campaign_id', campaignIds);

      // Build maps for deliverable data
      const deliverableCountMap = new Map<string, number>();
      const contentTypeMap = new Map<string, string[]>();
      for (const d of allDeliverables || []) {
        deliverableCountMap.set(d.campaign_id, (deliverableCountMap.get(d.campaign_id) || 0) + 1);
        const types = contentTypeMap.get(d.campaign_id) || [];
        if (!types.includes(d.content_type)) types.push(d.content_type);
        contentTypeMap.set(d.campaign_id, types);
      }

      // Get application counts and user application status if user is provided
      const enrichedCampaigns = await Promise.all(
        visibleCampaigns.map(async (campaign) => {
          // Get application count
          const { count } = await supabase
            .from('campaign_applications')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id);

          // Check if user has applied and get application status (only if userId provided)
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

          // Get business profile for this campaign
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
            // Cover image from campaign media
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
            // Deliverable data
            deliverable_count: deliverableCountMap.get(campaign.id)
              || campaign.deliverables?.length
              || 0,
            content_types: contentTypeMap.get(campaign.id) || [],
          };
        })
      );

      return enrichedCampaigns.map(hydrateCampaignFromAnalysis) as unknown as PublicCampaign[];
    },
    enabled: true,
  });
};
