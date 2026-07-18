import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, CheckSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCampaignContentGallery, type GalleryFile } from '@/hooks/useCampaignContentGallery';
import { ContentTile } from './ContentTile';
import { ProtectedFilePreview } from '@/components/projects/ProtectedFilePreview';
import { AppChip } from '@/components/app/AppChip';

interface CampaignContentGalleryProps {
  campaignId: string;
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'revision_requested', label: 'Revision Requested' },
] as const;

export function CampaignContentGallery({ campaignId }: CampaignContentGalleryProps) {
  const [filter, setFilter] = useState('all');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<GalleryFile | null>(null);
  const queryClient = useQueryClient();

  const { data: files, isLoading, isError } = useCampaignContentGallery(campaignId, filter);

  const approvedCount = files?.filter(f => f.status === 'approved').length ?? 0;
  const pendingCount = files?.filter(f => f.status === 'submitted').length ?? 0;
  const totalFiles = files?.filter(f => f.fileId !== null).length ?? 0;

  const toggleSelect = useCallback((fileId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const approveMutation = useMutation({
    mutationFn: async (file: GalleryFile) => {
      const { data: collab, error: fetchError } = await supabase
        .from('campaign_collaborations')
        .select('deliverables_status')
        .eq('id', file.collaborationId)
        .single();
      if (fetchError) throw fetchError;

      const ds = (collab.deliverables_status as Record<string, string>) ?? {};
      const keys = Object.keys(ds);
      const keyToApprove = keys.find(k => ds[k] === 'submitted');
      if (keyToApprove) {
        ds[keyToApprove] = 'approved';
      }

      const allApproved = Object.values(ds).every(s => s === 'approved' || s === 'auto_approved');

      const { error: updateError } = await supabase
        .from('campaign_collaborations')
        .update({
          deliverables_status: ds,
          content_status: allApproved ? 'approved' : 'submitted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', file.collaborationId);
      if (updateError) throw updateError;

      if (allApproved) {
        const { error: payoutError } = await supabase.functions.invoke('release-creator-payout', {
          body: { collaborationId: file.collaborationId },
        });
        if (payoutError) throw payoutError;
      }
    },
    onSuccess: () => {
      toast.success('Deliverable approved!');
      queryClient.invalidateQueries({ queryKey: ['campaign-content-gallery', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-content-summary', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
    },
    onError: (err: Error) => toast.error(`Approve failed: ${err.message}`),
  });

  const revisionMutation = useMutation({
    mutationFn: async ({ file, feedback }: { file: GalleryFile; feedback: string }) => {
      const { data: collab, error: fetchError } = await supabase
        .from('campaign_collaborations')
        .select('deliverables_status, revision_count')
        .eq('id', file.collaborationId)
        .single();
      if (fetchError) throw fetchError;

      const ds = (collab.deliverables_status as Record<string, string>) ?? {};
      const keyToRevise = Object.keys(ds).find(k => ds[k] === 'submitted');
      if (keyToRevise) {
        ds[keyToRevise] = 'revision_requested';
      }

      const { error: updateError } = await supabase
        .from('campaign_collaborations')
        .update({
          deliverables_status: ds,
          content_status: 'revision_requested',
          revision_count: (collab.revision_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', file.collaborationId);
      if (updateError) throw updateError;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('messages').insert({
          sender_id: user.id,
          recipient_id: file.creatorId,
          campaign_id: campaignId,
          content: `📝 **Revision Requested**\n\n${feedback}`,
          category: 'revision_request',
        });
      }

      supabase.rpc('insert_payment_event', {
        p_event_type: 'revision_requested',
        p_entity_type: 'collaboration',
        p_entity_id: file.collaborationId,
        p_campaign_id: campaignId,
        p_metadata: { notes: feedback, revision_number: (collab.revision_count ?? 0) + 1 },
      }).then(() => {}, () => {});
    },
    onSuccess: () => {
      toast.success('Revision request sent');
      queryClient.invalidateQueries({ queryKey: ['campaign-content-gallery', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-content-summary', campaignId] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  const handleDownload = useCallback(async (file: GalleryFile) => {
    const { data } = await supabase.functions.invoke('get-watermarked-preview', {
      body: { file_path: file.filePath, bucket_name: file.bucketName, collaboration_id: file.collaborationId },
    });
    if (data?.signed_url && data?.can_download) {
      const link = document.createElement('a');
      link.href = data.signed_url;
      link.download = file.originalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      toast.error('Download not available');
    }
  }, []);

  const handleBulkDownload = useCallback(async () => {
    const fileIds = selected.size > 0
      ? Array.from(selected)
      : (files ?? []).filter(f => f.status === 'approved' && f.fileId).map(f => f.fileId!);

    if (fileIds.length === 0) {
      toast.error('No files to download');
      return;
    }

    toast.info('Preparing download...');
    const { data, error } = await supabase.functions.invoke('bulk-download-campaign-content', {
      body: { campaign_id: campaignId, file_ids: fileIds },
    });

    if (error || (!data?.download_url && !data?.download_urls)) {
      toast.error('Download failed');
      return;
    }

    if (data.download_url) {
      const link = document.createElement('a');
      link.href = data.download_url;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (data.download_urls) {
      for (const item of data.download_urls) {
        const link = document.createElement('a');
        link.href = item.url;
        link.download = item.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      toast.success(`Downloading ${data.download_urls.length} files`);
    }
  }, [selected, files, campaignId]);

  const handlePreview = useCallback((file: GalleryFile) => {
    setPreviewFile(file);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-[200px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-center text-gray-500 py-8">Couldn't load content — try refreshing.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold text-gray-900">{totalFiles} files</span>
        {approvedCount > 0 && (
          <span className="text-emerald-500 font-medium">{approvedCount} approved</span>
        )}
        {pendingCount > 0 && (
          <span className="text-yellow-500 font-medium">{pendingCount} pending</span>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          className="rounded-full bg-dc-teal-btn text-white text-xs"
          disabled={approvedCount === 0}
          onClick={handleBulkDownload}
        >
          <Download className="h-3 w-3 mr-1" />
          {selected.size > 0 ? `Download ${selected.size} selected` : 'Download All Approved'}
        </Button>
        <Button
          size="sm"
          variant={isSelecting ? 'default' : 'outline'}
          className="rounded-full text-xs"
          onClick={() => {
            setIsSelecting(!isSelecting);
            if (isSelecting) setSelected(new Set());
          }}
        >
          <CheckSquare className="h-3 w-3 mr-1" />
          {isSelecting ? 'Cancel' : 'Select'}
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map(f => (
          <AppChip
            key={f.value}
            active={filter === f.value}
            onClick={() => setFilter(f.value)}
            className="text-xs px-3 whitespace-nowrap"
          >
            {f.label}
          </AppChip>
        ))}
      </div>

      {/* Content grid */}
      {(!files || files.length === 0) ? (
        <p className="text-center text-gray-400 py-8 text-sm">
          {filter === 'all' ? 'No content yet' : `No ${FILTERS.find(f => f.value === filter)?.label.toLowerCase()} content`}
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {files.map((file, i) => (
            <ContentTile
              key={file.fileId ?? `placeholder-${i}`}
              file={file}
              isSelecting={isSelecting}
              isSelected={file.fileId ? selected.has(file.fileId) : false}
              onToggleSelect={toggleSelect}
              onApprove={(f) => approveMutation.mutate(f)}
              onRequestRevision={(f, fb) => revisionMutation.mutate({ file: f, feedback: fb })}
              onDownload={handleDownload}
              onPreview={handlePreview}
            />
          ))}
        </div>
      )}

      {/* Floating selection bar */}
      {isSelecting && selected.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-full px-6 py-3 shadow-lg flex items-center gap-3 z-50">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            className="rounded-full bg-dc-teal-btn text-white text-xs"
            onClick={handleBulkDownload}
          >
            <Download className="h-3 w-3 mr-1" /> Download
          </Button>
        </div>
      )}

      {/* File preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-lg p-0">
          {previewFile?.fileId && (
            <ProtectedFilePreview
              file={{
                id: previewFile.fileId,
                original_filename: previewFile.originalFilename,
                file_size: previewFile.fileSize,
                mime_type: previewFile.mimeType,
                file_path: previewFile.filePath,
                bucket_name: previewFile.bucketName,
              }}
              contentStatus={previewFile.status}
              isBusinessClient={true}
              collaborationId={previewFile.collaborationId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
