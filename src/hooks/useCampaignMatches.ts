
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface CreatorMatch {
  id: string;
  campaign_id: string;
  creator_id: string;
  match_score: number;
  match_reasons: {
    reasons: string[];
    concerns: string[];
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
          creator_profile:creator_profiles!creator_id (
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
        `)
        .eq('campaign_id', campaignId)
        .order('match_score', { ascending: false });

      if (error) {
        console.error('Error fetching campaign matches:', error);
        throw error;
      }

      console.log('Fetched campaign matches:', data);
      return data as CreatorMatch[];
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
