
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
      const { data: matchRows, error: matchError } = await supabase
        .from('campaign_matches')
        .select('id, campaign_id, creator_id, match_score, match_reasons, ai_analysis, created_at')
        .eq('campaign_id', campaignId)
        .order('match_score', { ascending: false });

      if (matchError) {
        console.error('Error fetching campaign matches:', matchError);
        throw matchError;
      }

      if (!matchRows?.length) return [] as CreatorMatch[];

      const creatorIds = matchRows.map(m => m.creator_id);
      const { data: profiles, error: profileError } = await supabase
        .from('creator_profiles')
        .select('id, user_id, creator_name, avatar_url, bio, skills, location, base_rate_per_hour, portfolio_urls, instagram_url, tiktok_url, youtube_url')
        .in('user_id', creatorIds);

      if (profileError) {
        console.error('Error fetching creator profiles for matches:', profileError);
      }

      const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));

      return matchRows.map((match) => {
        const matchReasons = (match.match_reasons ?? {}) as Record<string, unknown>;
        const profile = profileMap.get(match.creator_id);
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
            id: profile?.id || '',
            creator_name: profile?.creator_name || '',
            avatar_url: profile?.avatar_url || null,
            bio: profile?.bio || null,
            skills: profile?.skills || [],
            location: profile?.location || null,
            base_rate_per_hour: profile?.base_rate_per_hour || null,
            portfolio_urls: profile?.portfolio_urls || null,
            instagram_url: profile?.instagram_url || null,
            tiktok_url: profile?.tiktok_url || null,
            youtube_url: profile?.youtube_url || null,
          },
        };
      }) as CreatorMatch[];
    },
    enabled: !!campaignId,
  });
};

export const useGenerateMatches = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('match-creators', {
        body: { campaignId }
      });

      if (error) {
        console.error('Error generating matches:', error);
        throw error;
      }

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
