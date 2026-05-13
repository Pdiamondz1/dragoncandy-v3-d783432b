import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  uploadProfileAsset,
  UploadError,
} from '@/lib/storage/uploadProfileAsset';
import type { LocationProfileFormData } from './useLocationProfileForm';

export function useLocationProfileSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const submitProfile = async (
    orgUnitId: string,
    formData: LocationProfileFormData,
    logoFile: File | null,
    userId: string,
  ) => {
    setIsSubmitting(true);

    try {
      let logoUrl = formData.logo_url;

      if (logoFile) {
        const result = await uploadProfileAsset({
          file: logoFile,
          userId,
          kind: 'logo',
        });
        logoUrl = result.path;
      }

      const { error } = await supabase
        .from('org_units')
        .update({
          name: formData.name,
          description: formData.description || null,
          brand_category: formData.brand_category || null,
          logo_url: logoUrl || null,
          sample_content_urls: formData.sample_content_urls,
          show_parent_brand: formData.show_parent_brand,
          instagram_url: formData.instagram_url || null,
          tiktok_url: formData.tiktok_url || null,
          youtube_url: formData.youtube_url || null,
          facebook_url: formData.facebook_url || null,
          linkedin_url: formData.linkedin_url || null,
          x_url: formData.x_url || null,
          other_social_url: formData.other_social_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgUnitId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['location-profile', orgUnitId] });
      queryClient.invalidateQueries({ queryKey: ['org-units'] });

      return true;
    } catch (error: unknown) {
      console.error('Error updating location profile:', error);
      const msg = error instanceof UploadError
        ? `Upload failed: ${error.message}`
        : error instanceof Error ? error.message : 'Please try again.';
      toast.error(msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitProfile, isSubmitting };
}
