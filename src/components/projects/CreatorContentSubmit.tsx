import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Send, 
  Clock, 
  CheckCircle2, 
  RotateCcw, 
  Loader2,
  AlertCircle,
  FileCheck
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DisputeStatusBanner } from './DisputeStatusBanner';

interface CreatorContentSubmitProps {
  collaborationId: string;
  campaignId: string;
  contentStatus: string | null;
  revisionCount: number;
  businessName: string;
  disputeReason: string | null;
  disputeOutcome: string | null;
}

export const CreatorContentSubmit: React.FC<CreatorContentSubmitProps> = ({
  collaborationId,
  campaignId,
  contentStatus,
  revisionCount,
  businessName,
  disputeReason,
  disputeOutcome
}) => {
  const queryClient = useQueryClient();

  const getStatusConfig = (status: string | null) => {
    switch (status) {
      case 'pending':
        return { 
          label: 'Not Started', 
          variant: 'secondary' as const, 
          icon: Clock, 
          canSubmit: false 
        };
      case 'in_progress':
        return { 
          label: 'In Progress', 
          variant: 'default' as const, 
          icon: Clock, 
          canSubmit: true 
        };
      case 'submitted':
        return { 
          label: 'Submitted', 
          variant: 'outline' as const, 
          icon: FileCheck, 
          canSubmit: false 
        };
      case 'revision_requested':
        return { 
          label: 'Revision Requested', 
          variant: 'destructive' as const, 
          icon: RotateCcw, 
          canSubmit: true 
        };
      case 'approved':
        return {
          label: 'Approved',
          variant: 'default' as const,
          icon: CheckCircle2,
          canSubmit: false
        };
      case 'rejected':
        return {
          label: 'Rejected',
          variant: 'destructive' as const,
          icon: AlertCircle,
          canSubmit: false
        };
      case 'auto_approved':
        return {
          label: 'Auto-Approved',
          variant: 'default' as const,
          icon: CheckCircle2,
          canSubmit: false
        };
      case 'disputed':
        return {
          label: 'Disputed',
          variant: 'destructive' as const,
          icon: AlertCircle,
          canSubmit: false
        };
      case 'resolved':
        return {
          label: 'Resolved',
          variant: 'secondary' as const,
          icon: CheckCircle2,
          canSubmit: false
        };
      default:
        return { 
          label: 'Unknown', 
          variant: 'outline' as const, 
          icon: AlertCircle, 
          canSubmit: false 
        };
    }
  };

  const submitContent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('transition_content_status', {
        p_collaboration_id: collaborationId,
        p_new_status: 'submitted',
      });
      if (error) throw error;

      await supabase
        .from('campaign_collaborations')
        .update({ revision_feedback: null })
        .eq('id', collaborationId);

      const eventType = revisionCount > 0 ? 'content_resubmitted' : 'content_submitted';
      // Fire-and-forget: write payment event
      supabase.rpc('insert_payment_event', {
        p_event_type: eventType,
        p_entity_type: 'collaboration',
        p_entity_id: collaborationId,
        p_campaign_id: campaignId,
        p_metadata: { revision_count: revisionCount },
      }).then(() => {}, () => {});

      // Notify the business
      const { data: collaboration } = await supabase
        .from('campaign_collaborations')
        .select('campaigns!inner(user_id, title)')
        .eq('id', collaborationId)
        .single();

      if (collaboration) {
        const campaigns = collaboration.campaigns as unknown as { user_id: string; title: string }[] | { user_id: string; title: string };
        const campaignData = Array.isArray(campaigns) ? campaigns[0] : campaigns;
        await supabase
          .from('messages')
          .insert({
            sender_id: (await supabase.auth.getUser()).data.user?.id,
            recipient_id: campaignData.user_id,
            campaign_id: campaignId,
            content: `📦 Content has been submitted for review on "${campaignData.title}". Please review and approve or request revisions.`,
            category: 'content_submission'
          });
      }
    },
    onSuccess: () => {
      toast.success('Content submitted for review!');
      queryClient.invalidateQueries({ queryKey: ['creator-projects'] });
      queryClient.invalidateQueries({ queryKey: ['collaboration'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit content: ${error.message}`);
    }
  });

  const statusConfig = getStatusConfig(contentStatus);
  const StatusIcon = statusConfig.icon;

  if (contentStatus === 'approved') {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-6 w-6" />
            <div>
              <p className="font-semibold">Content Approved!</p>
              <p className="text-sm opacity-80">Your payment will be processed shortly</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (contentStatus === 'rejected') {
    return (
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-red-700 dark:text-red-400">
            <AlertCircle className="h-6 w-6" />
            <div>
              <p className="font-semibold">Content Not Accepted</p>
              <p className="text-sm opacity-80">The business did not accept the content. This project has been cancelled.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={contentStatus === 'revision_requested' ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <StatusIcon className="h-5 w-5" />
              Content Submission
            </CardTitle>
            <CardDescription>
              {contentStatus === 'revision_requested' 
                ? 'Please address the requested changes'
                : 'Submit your content for review'
              }
            </CardDescription>
          </div>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DisputeStatusBanner
          contentStatus={contentStatus}
          disputeReason={disputeReason}
          disputeOutcome={disputeOutcome}
          viewerRole="creator"
        />

        {/* Revision Counter */}
        {revisionCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RotateCcw className="h-4 w-4" />
            <span>Revision round: {revisionCount}</span>
          </div>
        )}

        {/* Revision Alert */}
        {contentStatus === 'revision_requested' && (
          <Alert className="border-amber-300">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-300">
              {businessName} has requested revisions. Check your messages for feedback details, then resubmit when ready.
            </AlertDescription>
          </Alert>
        )}

        {/* Submit Button */}
        {statusConfig.canSubmit && (
          <Button
            onClick={() => submitContent.mutate()}
            disabled={submitContent.isPending}
            className="w-full"
          >
            {submitContent.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {contentStatus === 'revision_requested' ? 'Resubmit Content' : 'Submit for Review'}
              </>
            )}
          </Button>
        )}

        {/* Waiting state */}
        {contentStatus === 'submitted' && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Waiting for {businessName} to review your content...
          </p>
        )}

        {contentStatus === 'pending' && (
          <p className="text-sm text-muted-foreground">
            Start working on your content and upload files when ready.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

