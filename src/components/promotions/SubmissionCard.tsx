import React, { useState } from 'react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Check, X, Play, User, Mail, Phone, Clock, Loader2, Image } from 'lucide-react';
import { format } from 'date-fns';
import { PromotionSubmission } from '@/hooks/usePromotions';
import { useVideoUrl } from '@/hooks/useVideoUrl';
import { SocialHandleChips } from '@/features/promotions/review/SubmissionRow';

const isImageUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  return !!ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext);
};

interface SubmissionCardProps {
  submission: PromotionSubmission;
  onApprove: () => void;
  onReject: (reason: string) => void;
  isLoading?: boolean;
}

export const SubmissionCard: React.FC<SubmissionCardProps> = ({
  submission,
  onApprove,
  onReject,
  isLoading,
}) => {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const { resolvedUrl, isLoading: isLoadingUrl } = useVideoUrl(submission.video_url);

  const handleReject = () => {
    onReject(rejectionReason);
    setShowRejectDialog(false);
    setRejectionReason('');
  };

  return (
    <>
      <AppCard className="p-0 hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                {submission.customer_name}
              </CardTitle>
              <CardDescription className="mt-1">
                {submission.promotion?.title}
              </CardDescription>
            </div>
            <AppStatusBadge tone="amber">Pending Review</AppStatusBadge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span className="truncate">{submission.customer_email}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{submission.customer_phone}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <Clock className="h-4 w-4" />
              <span>Submitted {format(new Date(submission.created_at), 'MMM d, yyyy h:mm a')}</span>
            </div>
          </div>

          {/* Social Handle Chips */}
          <SocialHandleChips socialHandles={submission.social_handles} />

          {/* Media Preview Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowVideoPreview(true)}
          >
            {isImageUrl(submission.video_url) ? (
              <Image className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isImageUrl(submission.video_url) ? 'Preview Photo' : 'Preview Video'}
          </Button>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={onApprove}
              disabled={isLoading}
            >
              <Check className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button 
              variant="destructive" 
              className="flex-1"
              onClick={() => setShowRejectDialog(true)}
              disabled={isLoading}
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        </CardContent>
      </AppCard>

      {/* Media Preview Dialog */}
      <Dialog open={showVideoPreview} onOpenChange={setShowVideoPreview}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{isImageUrl(submission.video_url) ? 'Photo' : 'Video'} Preview</DialogTitle>
            <DialogDescription>
              Submitted by {submission.customer_name}
            </DialogDescription>
          </DialogHeader>
          <div className="aspect-video bg-dc-teal/5 rounded-lg overflow-hidden flex items-center justify-center">
            {isLoadingUrl ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : resolvedUrl ? (
              isImageUrl(submission.video_url) ? (
                <img src={resolvedUrl} alt={`Submission by ${submission.customer_name}`} className="w-full h-full object-contain" loading="lazy" />
              ) : (
                <video
                  src={resolvedUrl}
                  controls
                  aria-label="Content submission video"
                  className="w-full h-full object-contain"
                />
              )
            ) : (
              <p className="text-muted-foreground">Unable to load media</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this video submission.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Reject Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
