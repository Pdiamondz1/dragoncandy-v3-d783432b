
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ScoreBreakdown {
  platform_overlap: number;
  budget_fit: number;
  skills_match: number;
  geographic: number;
  availability: number;
  ai_quality: number;
}

export interface CreatorMatch {
  id: string;
  campaign_id: string;
  creator_id: string;
  match_score: number;
  match_reasons: {
    reasons: string[];
    concerns: string[];
    score_breakdown?: ScoreBreakdown;
    weights?: Record<string, number>;
  };
  ai_analysis: string;
  created_at: string;
  creator_profile: {
    id: string;
    creator_name: string;
    avatar_url: string | null;
    bio: string | null;
    skills: string[];
    location: string | null;
    base_rate_per_hour: number | null;
    portfolio_urls: string[] | null;
    instagram_url: string | null;
    tiktok_url: string | null;
    youtube_url: string | null;
  };
}

export const useCampaignMatches = (campaignId: string) => {
  return useQuery({
    queryKey: ['campaign-matches', campaignId],
    queryFn: async () => {
      console.log('Fetching matches for campaign:', campaignId);
      const { data, error } = await supabase
        .from('campaign_matches')
        .select(`
          *,
          creator_profile:profiles!creator_id (
            creator_profiles!user_id (
              id,
              creator_name,
              avatar_url,
              bio,
              skills,
              location,
              base_rate_per_hour,
              portfolio_urls,
              instagram_url,
              tiktok_url,
              youtube_url
            )
          )
        `)
        .eq('campaign_id', campaignId)
        .order('match_score', { ascending: false });

      if (error) {
        console.error('Error fetching campaign matches:', error);
        throw error;
      }

      console.log('Raw campaign matches data:', data);

      // Transform the data to match our interface
      const transformedData = data?.map((match: any) => {
        const matchReasons = match.match_reasons as any || {};
        return {
          id: match.id,
          campaign_id: match.campaign_id,
          creator_id: match.creator_id,
          match_score: match.match_score,
          match_reasons: {
            reasons: Array.isArray(matchReasons.reasons) ? matchReasons.reasons : [],
            concerns: Array.isArray(matchReasons.concerns) ? matchReasons.concerns : [],
            score_breakdown: matchReasons.score_breakdown || undefined,
            weights: matchReasons.weights || undefined,
          },
          ai_analysis: match.ai_analysis || '',
          created_at: match.created_at,
          creator_profile: {
            id: match.creator_profile?.creator_profiles?.id || '',
            creator_name: match.creator_profile?.creator_profiles?.creator_name || '',
            avatar_url: match.creator_profile?.creator_profiles?.avatar_url || null,
            bio: match.creator_profile?.creator_profiles?.bio || null,
            skills: match.creator_profile?.creator_profiles?.skills || [],
            location: match.creator_profile?.creator_profiles?.location || null,
            base_rate_per_hour: match.creator_profile?.creator_profiles?.base_rate_per_hour || null,
            portfolio_urls: match.creator_profile?.creator_profiles?.portfolio_urls || null,
            instagram_url: match.creator_profile?.creator_profiles?.instagram_url || null,
            tiktok_url: match.creator_profile?.creator_profiles?.tiktok_url || null,
            youtube_url: match.creator_profile?.creator_profiles?.youtube_url || null,
          }
        };
      }) || [];

      console.log('Transformed campaign matches:', transformedData);
      return transformedData as CreatorMatch[];
    },
    enabled: !!campaignId,
  });
};

export const useGenerateMatches = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      console.log('Generating matches for campaign:', campaignId);

      const { data, error } = await supabase.functions.invoke('match-creators', {
        body: { campaignId }
      });

      if (error) {
        console.error('Error generating matches:', error);
        throw error;
      }

      console.log('Generated matches:', data);
      return data;
    },
    onSuccess: (data, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-matches', campaignId] });
      toast({
        title: 'Matches generated successfully!',
        description: `Found ${data.matches?.length || 0} potential creators for your campaign.`,
      });
    },
    onError: (error) => {
      console.error('Match generation failed:', error);
      toast({
        title: 'Failed to generate matches',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
