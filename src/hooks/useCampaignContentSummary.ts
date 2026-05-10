import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContentSummary {
  totalDeliverables: number;
  submitted: number;
  approved: number;
  pendingReview: number;
  revisionRequested: number;
  thumbnailUrls: string[];
}

export function useCampaignContentSummary(
  campaignId: string,
  collaborationId?: string
) {
  return useQuery({
    queryKey: ['campaign-content-summary', campaignId, collaborationId],
    queryFn: async (): Promise<ContentSummary> => {
      let collabQuery = supabase
        .from('campaign_collaborations')
        .select('id, creator_id, deliverables_status, content_status')
        .eq('campaign_id', campaignId)
        .in('status', ['active', 'completed']);

      if (collaborationId) {
        collabQuery = collabQuery.eq('id', collaborationId);
      }

      const { data: collabs, error: collabError } = await collabQuery;
      if (collabError) throw collabError;
      if (!collabs?.length) {
        return { totalDeliverables: 0, submitted: 0, approved: 0, pendingReview: 0, revisionRequested: 0, thumbnailUrls: [] };
      }

      let total = 0;
      let approved = 0;
      let pendingReview = 0;
      let revisionRequested = 0;

      for (const collab of collabs) {
        const ds = collab.deliverables_status as Record<string, string> | null;
        if (!ds) continue;
        const values = Object.values(ds);
        total += values.length;
        for (const status of values) {
          if (status === 'approved' || status === 'auto_approved') approved++;
          else if (status === 'submitted') pendingReview++;
          else if (status === 'revision_requested') revisionRequested++;
        }
      }

      const submitted = approved + pendingReview + revisionRequested;

      let fileQuery = supabase
        .from('file_uploads')
        .select('id, file_path, bucket_name, mime_type, uploaded_by')
        .eq('campaign_id', campaignId)
        .eq('file_category', 'deliverable')
        .order('created_at', { ascending: false })
        .limit(3);

      if (collaborationId) {
        const creatorIds = collabs.map(c => c.creator_id);
        fileQuery = fileQuery.in('uploaded_by', creatorIds);
      }

      const { data: files } = await fileQuery;

      const collabByCreator = new Map(collabs.map(c => [c.creator_id, c.id]));
      const thumbnailPromises = (files ?? [])
        .filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/'))
        .map(async (file) => {
          const collabId = collabByCreator.get(file.uploaded_by);
          if (!collabId) return null;
          const { data } = await supabase.functions.invoke('get-watermarked-preview', {
            body: { file_path: file.file_path, bucket_name: file.bucket_name, collaboration_id: collabId },
          });
          return data?.signed_url ?? null;
        });
      const thumbnailResults = await Promise.all(thumbnailPromises);
      const thumbnailUrls = thumbnailResults.filter((url): url is string => url !== null);

      return { totalDeliverables: total, submitted, approved, pendingReview, revisionRequested, thumbnailUrls };
    },
    staleTime: 30_000,
    enabled: !!campaignId,
  });
}
