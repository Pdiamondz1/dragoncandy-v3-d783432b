import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  CheckCircle2,
  RotateCcw,
  Loader2,
  Send,
  FileCheck,
  AlertCircle,
  Download,
  Eye,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useFileUploads } from '@/hooks/useFileQuery';

interface ContentReviewSectionProps {
  collaborationId: string;
  campaignId: string;
  creatorId: string;
  creatorName: string;
  contentStatus: string | null;
  revisionCount: number | null;
}

const MAX_REVISIONS = 2;

export const ContentReviewSection: React.FC<ContentReviewSectionProps> = ({
  collaborationId,
  campaignId,
  creatorId,
  creatorName,
  contentStatus,
  revisionCount,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const safeRevisionCount = revisionCount ?? 0;

  const { data: files, isLoading: filesLoading } = useFileUploads(campaignId, 'deliverable', creatorId);

  const approveContent = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('release-creator-payout', {
        body: { collaborationId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Content approved!', description: 'Payment released to creator.' });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-project', campaignId] });
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Approval Failed', description: err.message });
    },
  });

  const requestRevision = useMutation({
    mutationFn: async (revisionFeedback: string) => {
      const { error: updateError } = await supabase
        .from('campaign_collaborations')
        .update({
          content_status: 'revision_requested',
          revision_count: safeRevisionCount + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', collaborationId);
      if (updateError) throw updateError;

      const { data: authData } = await supabase.auth.getUser();
      const { error: messageError } = await supabase.from('messages').insert({
        sender_id: authData.user?.id,
        recipient_id: creatorId,
        campaign_id: campaignId,
        content: `📝 **Revision Requested**\n\n${revisionFeedback}`,
        category: 'revision_request',
      });
      if (messageError) throw messageError;

      supabase.rpc('insert_payment_event', {
        p_event_type: 'revision_requested',
        p_entity_type: 'collaboration',
        p_entity_id: collaborationId,
        p_campaign_id: campaignId,
        p_metadata: { notes: revisionFeedback, revision_number: safeRevisionCount + 1 },
      }).then(() => {}, () => {});
    },
    onSuccess: () => {
      toast({ title: 'Revision request sent to creator.' });
      setFeedback('');
      setShowRevisionInput(false);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-project', campaignId] });
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Request Failed', description: err.message });
    },
  });

  if (contentStatus !== 'submitted') return null;

  const hasFiles = files && files.length > 0;

  if (!hasFiles && !filesLoading) {
    return (
      <div className="bg-white border-2 border-dc-teal rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-dc-teal" />
          <span className="text-sm text-gray-600">
            Waiting for {creatorName} to upload content
          </span>
        </div>
      </div>
    );
  }

  if (filesLoading) {
    return (
      <div className="bg-white border-2 border-dc-teal rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-dc-teal animate-spin" />
          <span className="text-sm text-gray-600">Loading content...</span>
        </div>
      </div>
    );
  }

  const canRequestRevision = safeRevisionCount < MAX_REVISIONS;

  return (
    <div className="bg-white border-2 border-pink-400 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <FileCheck className="h-4 w-4 text-pink-500" />
        <span className="text-sm font-semibold text-gray-900">
          Content ready for review from {creatorName}
        </span>
        {safeRevisionCount > 0 && (
          <Badge variant="outline" className="text-xs rounded-full">
            {safeRevisionCount}/{MAX_REVISIONS} revisions used
          </Badge>
        )}
      </div>

      {/* File gallery */}
      {hasFiles && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {files!.slice(0, 6).map(file => {
            const isImage = file.mime_type?.startsWith('image/');
            const isVideo = file.mime_type?.startsWith('video/');
            const publicUrl = supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl;
            return (
              <div
                key={file.id}
                className="relative aspect-video rounded-xl border border-gray-200 overflow-hidden bg-gray-50 group"
              >
                {isImage ? (
                  <>
                    <img
                      src={publicUrl}
                      alt={file.original_filename}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      onClick={() => setLightboxUrl(publicUrl)}
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"
                    >
                      <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </>
                ) : isVideo ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-dc-teal/10 flex items-center justify-center">
                      <span className="text-dc-teal text-lg">&#9654;</span>
                    </div>
                    <span className="text-xs text-gray-500 truncate max-w-[90%] px-2">
                      {file.original_filename}
                    </span>
                  </div>
                ) : (
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-full flex flex-col items-center justify-center gap-1 hover:bg-gray-100 transition-colors"
                  >
                    <Download className="h-5 w-5 text-gray-400" />
                    <span className="text-xs text-gray-500 truncate max-w-[90%] px-2">
                      {file.original_filename}
                    </span>
                  </a>
                )}
              </div>
            );
          })}
          {files!.length > 6 && (
            <div className="aspect-video rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
              <span className="text-sm text-gray-500 font-semibold">+{files!.length - 6} more</span>
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Content preview</DialogTitle>
          {lightboxUrl && (
            <img src={lightboxUrl} alt="Full size preview" className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Actions */}
      {!showRevisionInput ? (
        <div className="flex gap-2 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={approveContent.isPending}
                size="sm"
                className="rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold"
              >
                {approveContent.isPending ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Approving…</>
                ) : (
                  <><CheckCircle2 className="h-3 w-3 mr-1" />Approve & Pay</>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Release payment to creator?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will approve the content and release payment immediately. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-teal-400 hover:bg-teal-500"
                  onClick={() => approveContent.mutate()}
                >
                  Yes, Approve & Pay
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {canRequestRevision && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setShowRevisionInput(true)}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Request Revision
            </Button>
          )}

          {!canRequestRevision && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <AlertCircle className="h-3 w-3" />
              Max revisions reached
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            placeholder="Describe the changes you need…"
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            rows={2}
            className="text-sm rounded-xl"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => requestRevision.mutate(feedback)}
              disabled={!feedback.trim() || requestRevision.isPending}
              size="sm"
              className="rounded-full bg-teal-400 hover:bg-teal-500 text-white"
            >
              {requestRevision.isPending ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending…</>
              ) : (
                <><Send className="h-3 w-3 mr-1" />Send</>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => { setShowRevisionInput(false); setFeedback(''); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
