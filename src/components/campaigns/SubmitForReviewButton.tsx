import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { recordCrewActivity } from '@/lib/crews/recordCrewActivity';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SubmitForReviewButtonProps {
  collaborationId: string;
  campaignId: string;
  uploadedCount: number;
  totalCount: number;
  contentStatus: string;
  disabled?: boolean;
}

export function SubmitForReviewButton({
  collaborationId,
  campaignId,
  uploadedCount,
  totalCount,
  contentStatus,
  disabled,
}: SubmitForReviewButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('campaign_collaborations')
        .update({
          content_status: 'submitted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', collaborationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Content submitted for review!');
      queryClient.invalidateQueries({ queryKey: ['collaboration', collaborationId] });
      queryClient.invalidateQueries({ queryKey: ['file-uploads', campaignId] });

      // Crew activity — THE gap event: fires the owner "new content submitted"
      // notification (nobody is notified today). Inert for non-crew campaigns.
      void recordCrewActivity(campaignId, 'content_submitted');
    },
    onError: (err: Error) => toast.error(`Submit failed: ${err.message}`),
  });

  const alreadySubmitted = contentStatus === 'submitted' || contentStatus === 'approved';
  const isRevision = contentStatus === 'revision_requested';
  const noFiles = uploadedCount === 0;
  const isPartial = uploadedCount > 0 && uploadedCount < totalCount;

  if (alreadySubmitted) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-center">
        <p className="text-sm font-medium text-teal-700">
          {contentStatus === 'submitted' ? 'Submitted — waiting for review' : 'Content approved!'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <p className="text-xs text-dc-text-muted text-center">
          {uploadedCount} of {totalCount} deliverables uploaded
        </p>
        <Button
          className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold"
          disabled={noFiles || disabled || submitMutation.isPending}
          onClick={() => {
            if (isPartial) {
              setShowConfirm(true);
            } else {
              submitMutation.mutate();
            }
          }}
        >
          <Send className="h-4 w-4 mr-2" />
          {submitMutation.isPending ? 'Submitting...' : isRevision ? 'Resubmit for Review' : 'Submit for Review'}
        </Button>
        {noFiles && (
          <p className="text-xs text-dc-text-muted text-center">
            Upload your deliverables above, then submit for review
          </p>
        )}
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Not all deliverables uploaded
            </AlertDialogTitle>
            <AlertDialogDescription>
              You've uploaded {uploadedCount} of {totalCount} deliverables.
              Submit anyway? You can upload more later if the client requests revisions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white"
              onClick={() => submitMutation.mutate()}
            >
              Submit Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
