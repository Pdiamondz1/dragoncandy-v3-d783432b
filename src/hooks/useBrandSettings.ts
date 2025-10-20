import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface BrandSettingsFormData {
  business_name: string;
  brand_category: string;
  description: string;
  sponsorship_budget: number | null;
  marketing_objectives: string;
}

export const useBrandSettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const updateSettings = useMutation({
    mutationFn: async (formData: BrandSettingsFormData) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('business_profiles')
        .update({
          business_name: formData.business_name,
          brand_category: formData.brand_category,
          description: formData.description,
          sponsorship_budget: formData.sponsorship_budget,
          marketing_objectives: formData.marketing_objectives,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business_profile'] });
      toast({
        title: 'Settings updated',
        description: 'Your brand profile has been updated successfully.',
      });
    },
    onError: (error) => {
      console.error('Failed to update settings:', error);
      toast({
        title: 'Update failed',
        description: 'Failed to update your brand profile. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (formData: BrandSettingsFormData) => {
    setLoading(true);
    try {
      await updateSettings.mutateAsync(formData);
    } finally {
      setLoading(false);
    }
  };

  return {
    updateSettings: handleSubmit,
    loading,
  };
};
