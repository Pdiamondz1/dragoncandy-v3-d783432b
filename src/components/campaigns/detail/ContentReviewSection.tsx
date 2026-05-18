import React, { useEffect, useState } from 'react';
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
  Download,
  Eye,
  MessageSquare,
  Play,
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
import { useDraftPosts } from '@/hooks/useDraftPosts';
import { SocialPostStatus } from '@/components/campaigns/SocialPostStatus';

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
  const [lightboxFile, setLightboxFile] = useState<{ isVideo: boolean; filename: string } | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const safeRevisionCount = revisionCount ?? 0;

  const navigate = useNavigate();
  const { draftCount } = useDraftPosts();

  const { data: files, isLoading: filesLoading } = useFileUploads(campaignId, 'deliverable', creatorId);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!files?.length) return;
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      await Promise.all(
        files.map(async (file) => {
          const { data } = await supabase.storage
            .from(file.bucket_name)
            .createSignedUrl(file.file_path, 3600);
          if (data?.signedUrl) urls[file.id] = data.signedUrl;
        }),
      );
      if (!cancelled) setSignedUrls(urls);
    })();
    return () => { cancelled = true; };
  }, [files]);

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

      try {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', creatorId)
          .single();

        if (creatorProfile?.email) {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: creatorProfile.email,
              recipientName: creatorProfile.full_name,
              type: 'content_approved',
              data: { campaignId, creatorName: creatorName },
            },
          });
        }
      } catch (e) {
        console.error('Failed to send content approval email:', e);
      }

      // Trigger social hook to auto-draft scheduled posts for all parties
      try {
        await supabase.functions.invoke('fire-campaign-social-hook', {
          body: { campaign_id: campaignId, stage: 4 },
        });
      } catch (e) {
        console.error('Failed to trigger social hook:', e);
      }
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
    onSuccess: async () => {
      toast({ title: 'Revision request sent to creator.' });
      setFeedback('');
      setShowRevisionInput(false);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-project', campaignId] });

      try {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', creatorId)
          .single();

        if (creatorProfile?.email) {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: creatorProfile.email,
              recipientName: creatorProfile.full_name,
              type: 'revision_requested',
              data: { campaignId, creatorName: creatorName },
            },
          });
        }
      } catch (e) {
        console.error('Failed to send revision request email:', e);
      }
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Request Failed', description: err.message });
    },
  });

  const isSubmitted = contentStatus === 'submitted';
  const isApproved = contentStatus === 'approved';
  const hasFiles = files && files.length > 0;

  if (!isSubmitted && !isApproved && !hasFiles && !filesLoading) return null;

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
    <div className={`bg-white border-2 ${isSubmitted ? 'border-pink-400' : 'border-dc-teal'} rounded-2xl p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <FileCheck className={`h-4 w-4 ${isSubmitted ? 'text-pink-500' : 'text-dc-teal'}`} />
        <span className="text-sm font-semibold text-gray-900">
          {isSubmitted ? `Content ready for review from ${creatorName}` : `Content uploaded by ${creatorName}`}
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
            const fileUrl = signedUrls[file.id] || supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl;
            return (
              <div
                key={file.id}
                className="relative aspect-video rounded-xl border border-gray-200 overflow-hidden bg-gray-50 group"
              >
                {isImage ? (
                  <>
                    <img
                      src={fileUrl}
                      alt={file.original_filename}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      onClick={() => {
                        setLightboxUrl(fileUrl);
                        setLightboxFile({ isVideo: false, filename: file.original_filename });
                      }}
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"
                    >
                      <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </>
                ) : isVideo ? (
                  <button
                    onClick={() => {
                      setLightboxUrl(fileUrl);
                      setLightboxFile({ isVideo: true, filename: file.original_filename });
                      setVideoError(false);
                    }}
                    className="w-full h-full flex flex-col items-center justify-center gap-1 group-hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-dc-teal/10 flex items-center justify-center">
                      <span className="text-dc-teal text-lg">&#9654;</span>
                    </div>
                    <span className="text-xs text-gray-500 truncate max-w-[90%] px-2">
                      {file.original_filename}
                    </span>
                  </button>
                ) : (
                  <a
                    href={fileUrl}
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
      <Dialog open={!!lightboxUrl} onOpenChange={() => { setLightboxUrl(null); setLightboxFile(null); setVideoError(false); }}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Content preview</DialogTitle>
          {lightboxUrl && lightboxFile?.isVideo && !videoError && (
            <video
              src={lightboxUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-auto rounded-lg max-h-[80vh]"
              onError={() => setVideoError(true)}
            />
          )}
          {lightboxUrl && lightboxFile?.isVideo && videoError && (
            <div className="flex flex-col items-center gap-4 py-10 px-4">
              <div className="w-16 h-16 rounded-full bg-dc-teal/10 flex items-center justify-center">
                <Play className="h-8 w-8 text-dc-teal" />
              </div>
              <p className="text-dc-text font-semibold text-center">{lightboxFile.filename}</p>
              <p className="text-sm text-dc-text-muted text-center">
                This video format can't be previewed in the browser. Download it to watch in your video player.
              </p>
              <Button
                className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold px-8"
                disabled={downloading}
                onClick={async () => {
                  if (!lightboxUrl) return;
                  setDownloading(true);
                  try {
                    const resp = await fetch(lightboxUrl);
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = lightboxFile.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch {
                    window.open(lightboxUrl, '_blank');
                  }
                  setDownloading(false);
                }}
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Download Video
              </Button>
            </div>
          )}
          {lightboxUrl && !lightboxFile?.isVideo && (
            <img src={lightboxUrl} alt="Full size preview" className="w-full h-auto rounded-lg" />
          )}
          {lightboxUrl && !lightboxFile?.isVideo && (
            <a
              href={lightboxUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-sm text-dc-teal hover:underline py-1"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          )}
        </DialogContent>
      </Dialog>

      {/* Approved state — actionable card to review/schedule social drafts */}
      {isApproved && (
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

      {isApproved && (
        <SocialPostStatus
          campaignId={campaignId}
          socialManagerPath="/dashboard/business/social"
        />
      )}

      {/* Actions — show for both pre-submitted (uploaded) and submitted states */}
      {!isApproved && hasFiles && (
        <>
          {!isSubmitted && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs text-gray-600">
                Files uploaded but not yet formally submitted for review. You can preview them above and provide early feedback.
              </p>
            </div>
          )}

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
                      {!isSubmitted
                        ? 'This content has not been formally submitted yet. Approving now will release payment immediately. This cannot be undone.'
                        : 'This will approve the content and release payment immediately. This cannot be undone.'}
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
        </>
      )}
    </div>
  );
};
