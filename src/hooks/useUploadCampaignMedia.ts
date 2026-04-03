import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { StagedFile, MediaType } from '@/types/campaignMedia';

interface UploadParams {
  campaignId: string;
  mediaType: MediaType;
  files: StagedFile[];
}

export const useUploadCampaignMedia = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, mediaType, files }: UploadParams) => {
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const staged = files[i];
        const filePath = `campaigns/${campaignId}/media/${mediaType}/${Date.now()}_${staged.name}`;

        const { error: uploadError } = await supabase.storage
          .from('campaign-assets')
          .upload(filePath, staged.file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('campaign-assets')
          .getPublicUrl(filePath);

        // @ts-ignore — campaign_media not in generated types yet
        const { data, error } = await supabase
          .from('campaign_media')
          .insert({
            campaign_id: campaignId,
            uploaded_by: user!.id,
            media_type: mediaType,
            file_url: urlData.publicUrl,
            file_name: staged.name,
            file_size_bytes: staged.size,
            mime_type: staged.type,
            duration_seconds: staged.duration || null,
            sort_order: i,
          })
          .select()
          .single();
        if (error) throw error;
        results.push(data);
      }
      return results;
    },
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign_media', campaignId] });
    },
    onError: (error: Error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });
};
