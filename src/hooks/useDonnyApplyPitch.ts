// src/hooks/useDonnyApplyPitch.ts

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface DonnyPitchResult {
  pitch: string;
  suggested_rate: number;
  suggested_portfolio_piece_url: string | null;
  pitch_source: 'claude' | 'template';
}

const CLIENT_FALLBACK_PITCH = "I'd love to work on this campaign — happy to chat about specifics.";

export const useDonnyApplyPitch = () => {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      campaignId,
      budgetMin,
      budgetMax,
    }: {
      campaignId: string;
      budgetMin?: number | null;
      budgetMax?: number | null;
    }): Promise<DonnyPitchResult> => {
      if (!user?.id) throw new Error('Not authenticated');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const { data, error } = await supabase.functions.invoke(
          'donny-apply-pitch',
          {
            body: { creator_id: user.id, campaign_id: campaignId },
          }
        );

        clearTimeout(timeout);

        if (error || !data) {
          return {
            pitch: CLIENT_FALLBACK_PITCH,
            suggested_rate: budgetMin ?? 100,
            suggested_portfolio_piece_url: null,
            pitch_source: 'template',
          };
        }

        return data as DonnyPitchResult;
      } catch {
        clearTimeout(timeout);
        return {
          pitch: CLIENT_FALLBACK_PITCH,
          suggested_rate: budgetMin ?? 100,
          suggested_portfolio_piece_url: null,
          pitch_source: 'template',
        };
      }
    },
  });
};
