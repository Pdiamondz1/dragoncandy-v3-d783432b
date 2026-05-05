
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { FileTag } from '@/types/files';

export const useFileTags = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['file-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('file_tags')
        .select('id, name, color, created_by, created_at')
        .order('name');

      if (error) {
        console.error('Error fetching file tags:', error);
        throw error;
      }

      return data as FileTag[];
    },
    enabled: !!user,
  });
};

export const useCreateFileTag = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tagData: { name: string; color?: string }) => {
      const { data, error } = await supabase
        .from('file_tags')
        .insert({
          ...tagData,
          created_by: user!.id
        })
        .select('id, name, color, created_by, created_at')
        .single();

      if (error) {
        console.error('Error creating file tag:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-tags'] });
    },
  });
};
