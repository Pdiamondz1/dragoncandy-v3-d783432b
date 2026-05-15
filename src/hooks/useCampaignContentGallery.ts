import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GalleryFile {
  fileId: string | null;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  bucketName: string;
  status: 'approved' | 'submitted' | 'revision_requested' | 'not_submitted';
  creatorId: string;
  creatorHandle: string;
  creatorAvatarUrl: string | null;
  collaborationId: string;
  thumbnailUrl: string | null;
  uploadedAt: string | null;
}

export function useCampaignContentGallery(campaignId: string, statusFilter?: string) {
  return useQuery({
    queryKey: ['campaign-content-gallery', campaignId, statusFilter],
    queryFn: async (): Promise<GalleryFile[]> => {
      const { data: collabs, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select('id, creator_id, deliverables_status, content_status, profiles!campaign_collaborations_creator_id_fkey(full_name, avatar_url)')
        .eq('campaign_id', campaignId)
        .in('status', ['active', 'completed', 'pending']);

      if (collabError) throw collabError;

      // Fallback: if no collaborations yet, query file_uploads directly for the campaign owner
      if (!collabs?.length) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: campaign } = await supabase
          .from('campaigns')
          .select('user_id')
          .eq('id', campaignId)
          .single();

        if (!campaign || campaign.user_id !== user.id) return [];

        const { data: directFiles, error: directError } = await supabase
          .from('file_uploads')
          .select('id, filename, original_filename, mime_type, file_size, file_path, bucket_name, uploaded_by, created_at')
          .eq('campaign_id', campaignId)
          .eq('file_category', 'deliverable')
          .order('created_at', { ascending: false });

        if (directError) throw directError;
        if (!directFiles?.length) return [];

        const uploaderIds = [...new Set(directFiles.map(f => f.uploaded_by))];
        const { data: uploaderProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', uploaderIds);

        const profileMap = new Map((uploaderProfiles ?? []).map(p => [p.id, p]));

        return directFiles.map(file => {
          const profile = profileMap.get(file.uploaded_by);
          return {
            fileId: file.id,
            filename: file.filename,
            originalFilename: file.original_filename,
            mimeType: file.mime_type,
            fileSize: file.file_size,
            filePath: file.file_path,
            bucketName: file.bucket_name,
            status: 'submitted' as GalleryFile['status'],
            creatorId: file.uploaded_by,
            creatorHandle: profile?.full_name ?? 'Creator',
            creatorAvatarUrl: profile?.avatar_url ?? null,
            collaborationId: '',
            thumbnailUrl: null,
            uploadedAt: file.created_at,
          };
        });
      }

      const { data: files, error: fileError } = await supabase
        .from('file_uploads')
        .select('id, filename, original_filename, mime_type, file_size, file_path, bucket_name, uploaded_by, created_at')
        .eq('campaign_id', campaignId)
        .eq('file_category', 'deliverable')
        .order('created_at', { ascending: false });

      if (fileError) throw fileError;

      const items: GalleryFile[] = [];

      for (const collab of collabs) {
        const ds = collab.deliverables_status as Record<string, string> | null;
        const profile = collab.profiles as { full_name: string | null; avatar_url: string | null } | null;
        const creatorFiles = (files ?? []).filter(f => f.uploaded_by === collab.creator_id);

        const dsKeys = ds ? Object.keys(ds) : [];

        for (let i = 0; i < creatorFiles.length; i++) {
          const file = creatorFiles[i];
          let fileStatus: string;
          if (i < dsKeys.length && ds) {
            fileStatus = ds[dsKeys[i]];
          } else {
            fileStatus = collab.content_status ?? 'submitted';
          }
          const normalizedStatus = (fileStatus === 'auto_approved') ? 'approved' : fileStatus;

          let thumbnailUrl: string | null = null;
          if (file.mime_type?.startsWith('image/') || file.mime_type?.startsWith('video/')) {
            const { data: previewData } = await supabase.functions.invoke('get-watermarked-preview', {
              body: { file_path: file.file_path, bucket_name: file.bucket_name, collaboration_id: collab.id },
            });
            thumbnailUrl = previewData?.signed_url ?? null;
          }

          items.push({
            fileId: file.id,
            filename: file.filename,
            originalFilename: file.original_filename,
            mimeType: file.mime_type,
            fileSize: file.file_size,
            filePath: file.file_path,
            bucketName: file.bucket_name,
            status: normalizedStatus as GalleryFile['status'],
            creatorId: collab.creator_id,
            creatorHandle: profile?.full_name ?? 'Creator',
            creatorAvatarUrl: profile?.avatar_url ?? null,
            collaborationId: collab.id,
            thumbnailUrl,
            uploadedAt: file.created_at,
          });
        }

        if (ds) {
          const expectedCount = dsKeys.length;
          const missing = expectedCount - creatorFiles.length;
          for (let i = 0; i < missing; i++) {
            items.push({
              fileId: null,
              filename: '',
              originalFilename: `Deliverable ${creatorFiles.length + i + 1}`,
              mimeType: '',
              fileSize: 0,
              filePath: '',
              bucketName: '',
              status: 'not_submitted',
              creatorId: collab.creator_id,
              creatorHandle: profile?.full_name ?? 'Creator',
              creatorAvatarUrl: profile?.avatar_url ?? null,
              collaborationId: collab.id,
              thumbnailUrl: null,
              uploadedAt: null,
            });
          }
        }
      }

      if (statusFilter && statusFilter !== 'all') {
        return items.filter(item => item.status === statusFilter);
      }

      return items;
    },
    staleTime: 30_000,
    enabled: !!campaignId,
  });
}
