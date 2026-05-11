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
} from 'lucide-react';
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
  const safeRevisionCount = revisionCount ?? 0;

  const { data: files } = useFileUploads(campaignId, 'deliverable');

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
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
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
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Request Failed', description: err.message });
    },
  });

  if (contentStatus !== 'submitted') return null;

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

      {/* File thumbnails */}
      {files && files.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {files.slice(0, 6).map(file => {
            const isImage = file.mime_type?.startsWith('image/');
            return (
              <div
                key={file.id}
                className="w-14 h-14 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center"
              >
                {isImage ? (
                  <img
                    src={supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl}
                    alt={file.original_filename}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="text-xs text-gray-500 text-center px-1 truncate">
                    {file.original_filename.split('.').pop()?.toUpperCase()}
                  </span>
                )}
              </div>
            );
          })}
          {files.length > 6 && (
            <div className="w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
              <span className="text-xs text-gray-500">+{files.length - 6}</span>
            </div>
          )}
        </div>
      )}

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
