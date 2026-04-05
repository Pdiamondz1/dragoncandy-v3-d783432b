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

interface UploadOptions {
  onProgress?: (filename: string, percent: number) => void;
}

export const useUploadCampaignMedia = (options?: UploadOptions) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const uploadWithProgress = async (
    bucket: string,
    path: string,
    file: File,
    filename: string,
  ): Promise<void> => {
    // Get the user's session token for RLS-compliant auth
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://zocahiffooqdybdhguqv.supabase.co';

    return new Promise((resolve, reject) => {
      const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('x-upsert', 'false');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && options?.onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          options.onProgress(filename, percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(file);
    });
  };

  return useMutation({
    mutationFn: async ({ campaignId, mediaType, files }: UploadParams) => {
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const staged = files[i];
        const filePath = `campaigns/${campaignId}/media/${mediaType}/${Date.now()}_${staged.name}`;

        await uploadWithProgress('campaign-assets', filePath, staged.file, staged.name);

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
