import { useMemo } from 'react';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCreatorMatchProfile } from '@/hooks/useCreatorMatchProfile';
import { computeMatchScore, type MatchResult } from '@/lib/donnyMatching';

export interface DonnyPick {
  campaign: PublicCampaign;
  score: number;
  matchReasons: string[];
}

const MIN_SCORE = 40;
const MAX_PICKS = 3;

export const useDonnyMatches = (campaigns: PublicCampaign[]): DonnyPick[] => {
  const { data: profile } = useCreatorMatchProfile();

  return useMemo(() => {
    if (!profile) return [];
    if (campaigns.length === 0) return [];

    const scored: DonnyPick[] = campaigns.map((campaign) => {
      const result: MatchResult = computeMatchScore(
        {
          skills: profile.skills,
          city: profile.city,
          country: profile.country,
          averageRating: profile.averageRating,
          activeCount: profile.activeCollabCount,
          maxProjects: profile.maxProjects,
        },
        {
          contentTypes: campaign.content_types ?? [],
          businessCity: campaign.business_profile?.city ?? null,
          businessCountry: campaign.business_profile?.country ?? null,
        },
      );

      return {
        campaign,
        score: result.score,
        matchReasons: result.matchReasons,
      };
    });

    return scored
      .filter((p) => p.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PICKS);
  }, [profile, campaigns]);
};
