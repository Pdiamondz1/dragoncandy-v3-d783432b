
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export const useFilePermissions = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const grantPermission = useMutation({
    mutationFn: async (permissionData: {
      file_upload_id: string;
      user_id: string;
      permission_type: 'view' | 'download' | 'edit' | 'delete' | 'share';
      expires_at?: string;
    }) => {
      const { data, error } = await supabase
        .from('file_permissions')
        .insert({
          ...permissionData,
          granted_by: user!.id
        })
        .select('id, file_upload_id, user_id, permission_type, granted_by, expires_at, created_at')
        .single();

      if (error) {
        console.error('Error granting permission:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      toast({
        title: 'Permission granted',
        description: 'File access has been granted successfully.',
      });
    },
    onError: () => {
      toast({ title: 'Failed to grant permission', variant: 'destructive' });
    },
  });

  const revokePermission = useMutation({
    mutationFn: async (permissionId: string) => {
      const { error } = await supabase
        .from('file_permissions')
        .delete()
        .eq('id', permissionId);

      if (error) {
        console.error('Error revoking permission:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      toast({
        title: 'Permission revoked',
        description: 'File access has been revoked successfully.',
      });
    },
    onError: () => {
      toast({ title: 'Failed to revoke permission', variant: 'destructive' });
    },
  });

  return { grantPermission, revokePermission };
};
