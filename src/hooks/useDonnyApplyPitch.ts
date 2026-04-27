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

      const fallback: DonnyPitchResult = {
        pitch: CLIENT_FALLBACK_PITCH,
        suggested_rate: budgetMin ?? 100,
        suggested_portfolio_piece_url: null,
        pitch_source: 'template',
      };

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Donny pitch timeout')), 5000)
        );

        const result = await Promise.race([
          supabase.functions.invoke('donny-apply-pitch', {
            body: { creator_id: user.id, campaign_id: campaignId },
          }),
          timeoutPromise,
        ]);

        const { data, error } = result as { data: DonnyPitchResult | null; error: Error | null };

        if (error || !data) return fallback;
        return data;
      } catch {
        return fallback;
      }
    },
  });
};
