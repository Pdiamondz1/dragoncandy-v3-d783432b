import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  XCircle,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface QuickApprovalCardProps {
  collaborationId: string;
  campaignId: string;
  creatorId: string;
  creatorName: string;
  contentStatus: string | null;
  revisionCount: number;
}

const MAX_REVISIONS = 2;

export const QuickApprovalCard: React.FC<QuickApprovalCardProps> = ({
  collaborationId,
  campaignId,
  creatorId,
  creatorName,
  contentStatus,
  revisionCount,
}) => {
  const queryClient = useQueryClient();
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState('');

  const approveContent = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('release-creator-payout', {
        body: { collaborationId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Content approved! Payment released to creator.');
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
      queryClient.invalidateQueries({ queryKey: ['creator-projects'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const requestRevision = useMutation({
    mutationFn: async (revisionFeedback: string) => {
      const { error: updateError } = await supabase
        .from('campaign_collaborations')
        .update({
          content_status: 'revision_requested',
          revision_count: (revisionCount || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', collaborationId);

      if (updateError) throw updateError;

      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          sender_id: (await supabase.auth.getUser()).data.user?.id,
          recipient_id: creatorId,
          campaign_id: campaignId,
          content: `📝 **Revision Requested**\n\n${revisionFeedback}`,
          category: 'revision_request',
        });

      if (messageError) throw messageError;

      // Fire-and-forget: write payment event for revision_requested
      supabase.rpc('insert_payment_event' as any, {
        p_event_type: 'revision_requested',
        p_entity_type: 'collaboration',
        p_entity_id: collaborationId,
        p_campaign_id: campaignId,
        p_metadata: { notes: revisionFeedback, revision_number: (revisionCount || 0) + 1 },
      }).then(() => {}).catch(() => {});
    },
    onSuccess: () => {
      toast.success('Revision request sent to creator');
      setFeedback('');
      setShowRevisionInput(false);
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to request revision: ${error.message}`);
    },
  });

  if (contentStatus !== 'submitted') return null;

  const canRequestRevision = revisionCount < MAX_REVISIONS;

  return (
    <div className="mt-3 p-3 rounded-lg border-2 border-green-300 bg-green-50/50 dark:bg-green-950/20 dark:border-green-700">
      <div className="flex items-center gap-2 mb-3">
        <FileCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">
          Content ready for review from {creatorName}
        </span>
        {revisionCount > 0 && (
          <Badge variant="outline" className="text-xs">
            {revisionCount}/{MAX_REVISIONS} revisions used
          </Badge>
        )}
      </div>

      {!showRevisionInput ? (
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={approveContent.isPending}
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {approveContent.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Approve & Pay
                  </>
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
                  className="bg-green-600 hover:bg-green-700"
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
              onClick={() => setShowRevisionInput(true)}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Request Revision
            </Button>
          )}

          {!canRequestRevision && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              Max revisions reached
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-600 text-xs"
            onClick={() => window.location.href = `/dashboard/project/${collaborationId}`}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            placeholder="Describe the changes you need..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => requestRevision.mutate(feedback)}
              disabled={!feedback.trim() || requestRevision.isPending}
              size="sm"
            >
              {requestRevision.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-3 w-3 mr-1" />
                  Send
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowRevisionInput(false);
                setFeedback('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickApprovalCard;
