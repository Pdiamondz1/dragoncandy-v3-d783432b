import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Clock,
  FileCheck,
  AlertCircle,
  Loader2,
  Send,
  XCircle
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ReviewCountdownTimer } from './ReviewCountdownTimer';
import { RejectContentModal } from './RejectContentModal';
import { DisputeStatusBanner } from './DisputeStatusBanner';

interface ContentApprovalPanelProps {
  collaborationId: string;
  campaignId: string;
  contentStatus: string | null;
  revisionCount: number;
  creatorId: string;
  creatorName: string;
  submittedAt: string | null;
  reviewExtended: boolean;
  deliveryType: string;
  disputeReason: string | null;
  disputeOutcome: string | null;
  onApproved?: () => void;
}

const MAX_REVISIONS = 2;

export const ContentApprovalPanel: React.FC<ContentApprovalPanelProps> = ({
  collaborationId,
  campaignId,
  contentStatus,
  revisionCount,
  creatorId,
  creatorName,
  submittedAt,
  reviewExtended,
  deliveryType,
  disputeReason,
  disputeOutcome,
  onApproved
}) => {
  const queryClient = useQueryClient();
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const getStatusConfig = (status: string | null) => {
    switch (status) {
      case 'pending':
        return { 
          label: 'Pending', 
          variant: 'secondary' as const, 
          icon: Clock, 
          description: 'Waiting for creator to start' 
        };
      case 'in_progress':
        return { 
          label: 'In Progress', 
          variant: 'default' as const, 
          icon: Clock, 
          description: 'Creator is working on content' 
        };
      case 'submitted':
        return { 
          label: 'Submitted for Review', 
          variant: 'destructive' as const, 
          icon: FileCheck, 
          description: 'Content ready for your review' 
        };
      case 'revision_requested':
        return { 
          label: 'Revision Requested', 
          variant: 'outline' as const, 
          icon: RotateCcw, 
          description: 'Waiting for creator to make changes' 
        };
      case 'approved':
        return {
          label: 'Approved',
          variant: 'default' as const,
          icon: CheckCircle2,
          description: 'Content has been approved'
        };
      case 'rejected':
        return {
          label: 'Rejected',
          variant: 'destructive' as const,
          icon: XCircle,
          description: 'Content was rejected. Refund initiated.'
        };
      case 'auto_approved':
        return {
          label: 'Auto-Approved',
          variant: 'default' as const,
          icon: CheckCircle2,
          description: 'Content was auto-approved after review window expired'
        };
      case 'disputed':
        return {
          label: 'Disputed',
          variant: 'destructive' as const,
          icon: AlertCircle,
          description: 'Content is under dispute'
        };
      case 'resolved':
        return {
          label: 'Resolved',
          variant: 'secondary' as const,
          icon: CheckCircle2,
          description: 'Dispute has been resolved'
        };
      default:
        return { 
          label: 'Unknown', 
          variant: 'outline' as const, 
          icon: AlertCircle, 
          description: 'Status unknown' 
        };
    }
  };

  const approveContent = useMutation({
    mutationFn: async () => {
      // Call the release-creator-payout edge function
      const { data, error } = await supabase.functions.invoke('release-creator-payout', {
        body: { collaborationId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Content approved! Payment released to creator.');
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
      queryClient.invalidateQueries({ queryKey: ['creator-projects'] });
      onApproved?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve content: ${error.message}`);
    }
  });

  const requestRevision = useMutation({
    mutationFn: async (feedback: string) => {
      // Transition via state machine RPC
      const { error: transitionError } = await supabase.rpc('transition_content_status', {
        p_collaboration_id: collaborationId,
        p_new_status: 'revision_requested',
      });

      if (transitionError) throw transitionError;

      // Send a message with the revision feedback
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          sender_id: (await supabase.auth.getUser()).data.user?.id,
          recipient_id: creatorId,
          campaign_id: campaignId,
          content: `📝 **Revision Requested**\n\n${feedback}`,
          category: 'revision_request'
        });

      if (messageError) throw messageError;

      // Fire-and-forget: write payment event for revision_requested
      supabase.rpc('insert_payment_event', {
        p_event_type: 'revision_requested',
        p_entity_type: 'collaboration',
        p_entity_id: collaborationId,
        p_campaign_id: campaignId,
        p_metadata: { notes: feedback, revision_number: (revisionCount || 0) + 1 },
      }).then(() => {}, () => {});
    },
    onSuccess: () => {
      toast.success('Revision request sent to creator');
      setRevisionFeedback('');
      setShowRevisionForm(false);
      queryClient.invalidateQueries({ queryKey: ['business-projects'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to request revision: ${error.message}`);
    }
  });

  const statusConfig = getStatusConfig(contentStatus);
  const StatusIcon = statusConfig.icon;
  const canRequestRevision = revisionCount < MAX_REVISIONS;
  const isSubmitted = contentStatus === 'submitted';
  const isApproved = contentStatus === 'approved';

  if (isApproved) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-6 w-6" />
            <div>
              <p className="font-semibold">Content Approved</p>
              <p className="text-sm opacity-80">Payment has been released to the creator</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isSubmitted ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <StatusIcon className="h-5 w-5" />
              Content Review
            </CardTitle>
            <CardDescription>{statusConfig.description}</CardDescription>
          </div>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DisputeStatusBanner
          contentStatus={contentStatus}
          disputeReason={disputeReason}
          disputeOutcome={disputeOutcome}
          viewerRole="business"
        />

        {/* Revision Counter */}
        {revisionCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RotateCcw className="h-4 w-4" />
            <span>Revisions used: {revisionCount} / {MAX_REVISIONS}</span>
          </div>
        )}

        {/* Auto-approval countdown timer */}
        {contentStatus === 'submitted' && (
          <ReviewCountdownTimer
            collaborationId={collaborationId}
            submittedAt={submittedAt}
            reviewExtended={reviewExtended}
            deliveryType={deliveryType}
            contentStatus={contentStatus}
          />
        )}

        {/* Action Buttons - Only show when content is submitted */}
        {isSubmitted && (
          <>
            {!showRevisionForm ? (
              <div className="flex gap-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={approveContent.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {approveContent.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve & Release Payment
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Approve Content & Release Payment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will release payment to the creator immediately. This action cannot be undone. Make sure you're satisfied with the delivered content.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => approveContent.mutate()}
                        disabled={approveContent.isPending}
                      >
                        Yes, Approve & Pay
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                {canRequestRevision && (
                  <Button
                    variant="outline"
                    onClick={() => setShowRevisionForm(true)}
                    className="flex-1"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Request Revision
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  placeholder="Describe the changes you'd like the creator to make..."
                  value={revisionFeedback}
                  onChange={(e) => setRevisionFeedback(e.target.value)}
                  rows={4}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => requestRevision.mutate(revisionFeedback)}
                    disabled={!revisionFeedback.trim() || requestRevision.isPending}
                    size="sm"
                  >
                    {requestRevision.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Revision Request
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowRevisionForm(false);
                      setRevisionFeedback('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!canRequestRevision && isSubmitted && (
              <Button
                variant="destructive"
                className="w-full rounded-full"
                onClick={() => setRejectModalOpen(true)}
              >
                Reject Content
              </Button>
            )}

            <RejectContentModal
              open={rejectModalOpen}
              onOpenChange={setRejectModalOpen}
              collaborationId={collaborationId}
            />
          </>
        )}

        {/* Waiting states */}
        {contentStatus === 'pending' && (
          <p className="text-sm text-muted-foreground">
            The creator hasn't started working on the content yet.
          </p>
        )}

        {contentStatus === 'in_progress' && (
          <p className="text-sm text-muted-foreground">
            {creatorName} is currently creating your content. You'll be notified when it's ready for review.
          </p>
        )}

        {contentStatus === 'revision_requested' && (
          <p className="text-sm text-muted-foreground">
            Waiting for {creatorName} to submit revised content.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

