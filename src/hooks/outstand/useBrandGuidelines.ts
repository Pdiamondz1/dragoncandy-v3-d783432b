import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface BrandSocialGuidelines {
  voice_tone: string;
  required_hashtags: string[];
  mandatory_disclosures: string[];
  prohibited_words: string[];
  default_cta: string;
}

const EMPTY_GUIDELINES: BrandSocialGuidelines = {
  voice_tone: '',
  required_hashtags: [],
  mandatory_disclosures: [],
  prohibited_words: [],
  default_cta: '',
};

export function useBrandGuidelines() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['brand-guidelines', user?.id],
    queryFn: async (): Promise<BrandSocialGuidelines> => {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('brand_social_guidelines')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return (data?.brand_social_guidelines as BrandSocialGuidelines) ?? EMPTY_GUIDELINES;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (guidelines: BrandSocialGuidelines) => {
      const { error } = await supabase
        .from('business_profiles')
        .update({ brand_social_guidelines: guidelines as unknown as Record<string, unknown> })
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-guidelines', user?.id] });
      toast.success('Brand guidelines saved');
    },
    onError: (err: Error) => {
      toast.error(`Failed to save guidelines: ${err.message}`);
    },
  });

  return {
    guidelines: query.data ?? EMPTY_GUIDELINES,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
