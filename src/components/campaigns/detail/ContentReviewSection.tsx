import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Eye,
  MessageSquare,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { recordCrewActivity } from '@/lib/crews/recordCrewActivity';
import { useToast } from '@/hooks/use-toast';
import { useFileUploads } from '@/hooks/useFileQuery';
import { useDraftPosts } from '@/hooks/useDraftPosts';
import { SocialPostStatus } from '@/components/campaigns/SocialPostStatus';
import { WatermarkedLightbox } from '@/components/content/WatermarkedLightbox';
import { VideoFrameThumbnail } from '@/components/content/VideoFrameThumbnail';
import { getVideoThumbnailUrl } from '@/lib/fileUtils';
import { PostApprovalScheduleCTA } from '@/components/schedule/PostApprovalScheduleCTA';
import { ScheduleReviewScreen } from '@/components/schedule/ScheduleReviewScreen';

interface RevisionPayload {
  items: Record<string, string>;
  general?: string;
}

interface ContentReviewSectionProps {
  collaborationId: string;
  campaignId: string;
  creatorId: string;
  creatorName: string;
  campaignTitle: string;
  contentStatus: string | null;
  revisionCount: number | null;
  escrowStatus: string | null;
  postingScheduleStatus?: string | null;
}

const MAX_REVISIONS = 2;

export const ContentReviewSection: React.FC<ContentReviewSectionProps> = ({
  collaborationId,
  campaignId,
  creatorId,
  creatorName,
  campaignTitle,
  contentStatus,
  revisionCount,
  escrowStatus,
  postingScheduleStatus,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
  const [perItemFeedback, setPerItemFeedback] = useState<Record<string, string>>({});
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const safeRevisionCount = revisionCount ?? 0;
  const [isPayingEscrow, setIsPayingEscrow] = useState(false);
  const [scheduleReviewOpen, setScheduleReviewOpen] = useState(false);
  const needsEscrowPayment = escrowStatus !== 'held';

  // Clean up stale autoApproveAfterPayment flags (older than 1 hour)
  React.useEffect(() => {
    const stored = localStorage.getItem('autoApproveAfterPayment');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const timestamp = parsed.timestamp;
        if (!timestamp || Date.now() - timestamp > 3600000) {
          localStorage.removeItem('autoApproveAfterPayment');
        }
      } catch {
        localStorage.removeItem('autoApproveAfterPayment');
      }
    }
  }, []);

  const navigate = useNavigate();
  const { draftCount } = useDraftPosts();

  const { data: files, isLoading: filesLoading } = useFileUploads(campaignId, 'deliverable', creatorId);

  const approveContent = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('release-creator-payout', {
        body: { collaborationId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast({ title: 'Content approved!', description: 'Payment released to creator.' });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-project', campaignId] });

      supabase.functions.invoke('create-notification', {
        body: {
          recipientId: creatorId,
          type: 'content_approved',
          category: 'content',
          title: 'Content Approved!',
          body: `Your content for "${campaignTitle}" was approved`,
          actionUrl: `/dashboard/creator/my-campaigns`,
          icon: 'content',
          data: { campaign_id: campaignId, collaboration_id: collaborationId },
          emailData: { campaignId, campaignTitle, creatorName },
        },
      }).catch((err: unknown) => console.error('Failed to send notification:', err));

      // Crew activity (inert for non-crew via the RPC no-op).
      void recordCrewActivity(campaignId, 'content_approved', collaborationId);

      // Trigger social hook with one retry + visible failure toast
      let socialHookOk = false;
      for (let attempt = 0; attempt < 2 && !socialHookOk; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
          const { error: hookErr } = await supabase.functions.invoke('fire-campaign-social-hook', {
            body: { campaign_id: campaignId, stage: 4 },
          });
          if (hookErr) throw hookErr;
          socialHookOk = true;
        } catch (e) {
          console.error(`Social hook attempt ${attempt + 1} failed (campaign=${campaignId}):`, e);
        }
      }
      if (!socialHookOk) {
        toast({
          variant: 'destructive',
          title: 'Auto-drafting skipped',
          description: 'Social post drafts could not be created automatically. You can draft posts manually from the Social tab.',
        });
      }
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Approval Failed', description: err.message });
    },
  });

  const handlePayAndApprove = async () => {
    setIsPayingEscrow(true);
    const checkoutWindow = window.open('about:blank', '_blank');
    try {
      const { data, error } = await supabase.functions.invoke('create-campaign-escrow', {
        body: { campaignId },
      });
      if (error) throw error;
      if (data?.alreadyPaid) {
        checkoutWindow?.close();
        approveContent.mutate();
        return;
      }
      if (data?.url && checkoutWindow) {
        localStorage.setItem('autoApproveAfterPayment', JSON.stringify({ collaborationId, campaignId, timestamp: Date.now() }));
        checkoutWindow.location.href = data.url;
        toast({ title: 'Complete Payment', description: 'Finish payment in the new tab. Content will be auto-approved.' });
      } else if (data?.url) {
        checkoutWindow?.close();
        localStorage.setItem('autoApproveAfterPayment', JSON.stringify({ collaborationId, campaignId, timestamp: Date.now() }));
        toast({
          title: 'Popup Blocked',
          description: 'Click below to open payment.',
          action: (
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-dc-teal underline text-sm">
              Open Payment
            </a>
          ),
        });
      }
    } catch {
      checkoutWindow?.close();
      localStorage.removeItem('autoApproveAfterPayment');
      toast({ variant: 'destructive', title: 'Payment Setup Failed', description: 'Could not initiate payment. Try again.' });
    } finally {
      setIsPayingEscrow(false);
    }
  };

  const requestRevision = useMutation({
    mutationFn: async (payload: RevisionPayload) => {
      const { error: updateError } = await supabase
        .from('campaign_collaborations')
        .update({
          content_status: 'revision_requested',
          revision_count: safeRevisionCount + 1,
          revision_feedback: payload.items,
          updated_at: new Date().toISOString(),
        })
        .eq('id', collaborationId);
      if (updateError) throw updateError;

      // Build structured message
      const itemLines = Object.entries(payload.items)
        .filter(([key]) => key !== 'general')
        .map(([key, text]) => {
          const file = files?.find(
            (f) => (f.metadata as Record<string, unknown>)?.deliverable_id === key || f.id === key
          );
          const label = file?.original_filename ?? key;
          return `• **${label}:** ${text}`;
        })
        .join('\n');
      const generalLine = payload.general ? `\n\n**General notes:** ${payload.general}` : '';
      const messageContent = `📝 **Revision Requested**\n\n${itemLines}${generalLine}`;

      const { data: authData } = await supabase.auth.getUser();
      const { error: messageError } = await supabase.from('messages').insert({
        sender_id: authData.user?.id,
        recipient_id: creatorId,
        campaign_id: campaignId,
        content: messageContent,
        category: 'revision_request',
      });
      if (messageError) throw messageError;

      supabase.rpc('insert_payment_event', {
        p_event_type: 'revision_requested',
        p_entity_type: 'collaboration',
        p_entity_id: collaborationId,
        p_campaign_id: campaignId,
        p_metadata: { notes: messageContent, revision_number: safeRevisionCount + 1, items: payload.items },
      }).then(() => {}, () => {});
    },
    onSuccess: async () => {
      toast({ title: 'Revision request sent to creator.' });
      setFeedback('');
      setCheckedFiles(new Set());
      setPerItemFeedback({});
      setShowRevisionInput(false);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-project', campaignId] });

      supabase.functions.invoke('create-notification', {
        body: {
          recipientId: creatorId,
          type: 'revision_requested',
          category: 'content',
          title: 'Revision Requested',
          body: `A revision was requested for "${campaignTitle}"`,
          actionUrl: `/dashboard/creator/my-campaigns`,
          icon: 'content',
          data: { campaign_id: campaignId, collaboration_id: collaborationId },
          emailData: { campaignId, campaignTitle, creatorName, message: feedback },
        },
      }).catch((err: unknown) => console.error('Failed to send notification:', err));

      // Crew activity (inert for non-crew via the RPC no-op).
      void recordCrewActivity(campaignId, 'revision_requested', collaborationId);
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Request Failed', description: err.message });
    },
  });

  const isSubmitted = contentStatus === 'submitted';
  const isApproved = contentStatus === 'approved';
  const isRevisionRequested = contentStatus === 'revision_requested';
  const hasFiles = files && files.length > 0;

  if (!isSubmitted && !isApproved && !isRevisionRequested && !hasFiles && !filesLoading) return null;

  if (!hasFiles && !filesLoading) {
    return (
      <div className="bg-white border-2 border-dc-teal rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-dc-teal" />
          <span className="text-sm text-gray-600">
            {contentStatus === 'in_progress'
              ? `${creatorName} is working on content`
              : `Waiting for ${creatorName} to upload content`}
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
    <div className={`bg-white border-2 ${isSubmitted ? 'border-pink-400' : isRevisionRequested ? 'border-amber-300' : 'border-dc-teal'} rounded-2xl p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <FileCheck className={`h-4 w-4 ${isSubmitted ? 'text-pink-500' : isRevisionRequested ? 'text-amber-500' : 'text-dc-teal'}`} />
        <span className="text-sm font-semibold text-gray-900">
          {isSubmitted ? `Content ready for review from ${creatorName}` : isRevisionRequested ? `Content under revision from ${creatorName}` : `Content uploaded by ${creatorName}`}
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
          {files!.slice(0, 6).map((file, index) => {
            const isImage = file.mime_type?.startsWith('image/');
            const isVideo = file.mime_type?.startsWith('video/');
            const thumbnailUrl = isImage
              ? supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl
              : isVideo ? getVideoThumbnailUrl(file.bucket_name, file.metadata as Record<string, unknown>) : null;
            return (
              <div
                key={file.id}
                className="relative aspect-video rounded-xl border border-gray-200 overflow-hidden bg-gray-50 group"
              >
                {isImage ? (
                  <>
                    <img
                      src={thumbnailUrl!}
                      alt={file.original_filename}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      onClick={() => setSelectedFileIndex(index)}
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"
                    >
                      <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </>
                ) : isVideo ? (
                  <button
                    onClick={() => setSelectedFileIndex(index)}
                    className="w-full h-full cursor-pointer relative"
                  >
                    <VideoFrameThumbnail
                      fileId={file.id}
                      videoUrl={supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl}
                      storedThumbnailUrl={thumbnailUrl}
                      mimeType={file.mime_type}
                      filename={file.original_filename}
                    />
                  </button>
                ) : (
                  <button
                    onClick={() => setSelectedFileIndex(index)}
                    className="w-full h-full flex flex-col items-center justify-center gap-1 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <Eye className="h-5 w-5 text-gray-400" />
                    <span className="text-xs text-gray-500 truncate max-w-[90%] px-2">
                      {file.original_filename}
                    </span>
                  </button>
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

      {hasFiles && (
        <WatermarkedLightbox
          files={files!}
          initialIndex={selectedFileIndex ?? 0}
          collaborationId={collaborationId}
          isOpen={selectedFileIndex !== null}
          onClose={() => setSelectedFileIndex(null)}
        />
      )}

      {/* Approved state — actionable card to review/schedule social drafts */}
      {isApproved && (
        <>
          {postingScheduleStatus === 'pending_review' ? (
            <>
              <PostApprovalScheduleCTA
                campaignId={campaignId}
                campaignTitle={campaignTitle}
                postingScheduleStatus={postingScheduleStatus}
                onReviewSchedule={() => setScheduleReviewOpen(true)}
              />
              <ScheduleReviewScreen
                open={scheduleReviewOpen}
                onOpenChange={setScheduleReviewOpen}
                campaignId={campaignId}
                campaignTitle={campaignTitle}
                connectedPlatformCount={3}
              />
            </>
          ) : (
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <p className="font-semibold text-dc-text">Content Approved!</p>
              </div>
              {draftCount > 0 && (
                <p className="text-sm text-dc-text-muted">
                  Donny prepared {draftCount} draft {draftCount === 1 ? 'post' : 'posts'} for you
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold text-sm"
                  onClick={() => navigate('/dashboard/business/social?tab=drafts')}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Review &amp; Schedule
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 rounded-full border-dc-teal text-dc-teal font-semibold text-sm"
                  onClick={() => {/* no-op dismiss */}}
                >
                  Skip for Now
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {isApproved && (
        <SocialPostStatus
          campaignId={campaignId}
          socialManagerPath="/dashboard/business/social"
        />
      )}

      {/* Actions — show for both pre-submitted (uploaded) and submitted states */}
      {!isApproved && hasFiles && (
        <>
          {isRevisionRequested ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">Revision Requested</span>
                <Badge variant="outline" className="text-xs rounded-full border-amber-300 text-amber-700">
                  {safeRevisionCount}/{MAX_REVISIONS} revisions used
                </Badge>
              </div>
              <p className="text-xs text-amber-700">
                Waiting for {creatorName} to update and resubmit revised content.
              </p>
            </div>
          ) : !isSubmitted ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs text-gray-600">
                Files uploaded but not yet formally submitted for review. You can preview them above and provide early feedback.
              </p>
            </div>
          ) : null}

          {isRevisionRequested ? null : !showRevisionInput ? (
            <div className="flex gap-2 flex-wrap">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={approveContent.isPending || isPayingEscrow}
                    size="sm"
                    className="rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold"
                  >
                    {(approveContent.isPending || isPayingEscrow) ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{isPayingEscrow ? 'Setting up payment…' : 'Approving…'}</>
                    ) : (
                      <><CheckCircle2 className="h-3 w-3 mr-1" />Approve & Pay</>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {needsEscrowPayment ? 'Pay escrow & approve content?' : 'Release payment to creator?'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {needsEscrowPayment
                        ? 'You\'ll be taken to Stripe to complete payment. Once paid, the content will be automatically approved and the creator will be paid.'
                        : !isSubmitted
                          ? 'This content has not been formally submitted yet. Approving now will release payment immediately. This cannot be undone.'
                          : 'This will approve the content and release payment immediately. This cannot be undone.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-teal-400 hover:bg-teal-500"
                      onClick={() => needsEscrowPayment ? handlePayAndApprove() : approveContent.mutate()}
                    >
                      Approve &amp; Pay
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

              {!isSubmitted && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-dc-teal text-dc-teal"
                  onClick={() => navigate(`/messages/${campaignId}`)}
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Message Creator
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700">Select items that need revision:</p>

              {/* Per-file checkboxes */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {files?.map((file) => {
                  const fileKey = (file.metadata as Record<string, unknown>)?.deliverable_id as string ?? file.id;
                  const isChecked = checkedFiles.has(fileKey);
                  const isImage = file.mime_type?.startsWith('image/');
                  const isVideo = file.mime_type?.startsWith('video/');
                  const thumbUrl = isImage
                    ? supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl
                    : null;
                  return (
                    <div key={file.id} className="space-y-1">
                      <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setCheckedFiles((prev) => {
                              const next = new Set(prev);
                              if (next.has(fileKey)) next.delete(fileKey);
                              else next.add(fileKey);
                              return next;
                            });
                          }}
                          className="rounded border-gray-300 text-dc-teal focus:ring-dc-teal"
                        />
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" className="w-10 h-10 rounded object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                            {isVideo ? <Eye className="h-4 w-4 text-gray-400" /> : <FileCheck className="h-4 w-4 text-gray-400" />}
                          </div>
                        )}
                        <span className="text-sm text-gray-700 truncate flex-1">{file.original_filename}</span>
                      </label>
                      {isChecked && (
                        <Textarea
                          placeholder="What needs to change?"
                          value={perItemFeedback[fileKey] ?? ''}
                          onChange={(e) => setPerItemFeedback((prev) => ({ ...prev, [fileKey]: e.target.value }))}
                          rows={1}
                          className="text-xs rounded-lg ml-8"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* General notes */}
              <Textarea
                placeholder="General notes (optional)"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                className="text-sm rounded-xl"
              />

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    const items: Record<string, string> = {};
                    checkedFiles.forEach((key) => {
                      items[key] = perItemFeedback[key]?.trim() || 'Revision needed';
                    });
                    if (feedback.trim()) items['general'] = feedback.trim();
                    requestRevision.mutate({ items, general: feedback.trim() || undefined });
                  }}
                  disabled={checkedFiles.size === 0 || requestRevision.isPending}
                  size="sm"
                  className="rounded-full bg-teal-400 hover:bg-teal-500 text-white"
                >
                  {requestRevision.isPending ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending…</>
                  ) : (
                    <><Send className="h-3 w-3 mr-1" />Send Revision Request</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setShowRevisionInput(false);
                    setFeedback('');
                    setCheckedFiles(new Set());
                    setPerItemFeedback({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
