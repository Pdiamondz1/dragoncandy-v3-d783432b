import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Download, User, Mail, Phone, Clock, CheckCircle, XCircle, Loader2, Film, Image } from 'lucide-react';
import { format } from 'date-fns';
import { PromotionSubmission } from '@/hooks/usePromotions';
import { useVideoUrl } from '@/hooks/useVideoUrl';
import { toast } from '@/hooks/use-toast';

const isImageUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  return !!ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext);
};

interface VideoCardProps {
  submission: PromotionSubmission;
}

const VideoCard: React.FC<VideoCardProps> = ({ submission }) => {
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { resolvedUrl, isLoading: isLoadingUrl } = useVideoUrl(submission.video_url);

  const handleDownload = async () => {
    if (!resolvedUrl) return;
    
    setIsDownloading(true);
    try {
      const response = await fetch(resolvedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = submission.video_url?.split('.').pop()?.split('?')[0] || 'mp4';
      const prefix = isImageUrl(submission.video_url) ? 'photo' : 'video';
      a.download = `${prefix}-${submission.customer_name.replace(/\s+/g, '-')}-${format(new Date(submission.created_at), 'yyyy-MM-dd')}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      toast({ title: "Failed to download video", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const isApproved = submission.status === 'approved';

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-4 w-4 shrink-0" />
                <span className="truncate">{submission.customer_name}</span>
              </CardTitle>
              <CardDescription className="mt-1 line-clamp-2">
                {submission.promotion?.title}
              </CardDescription>
            </div>
            <Badge variant={isApproved ? "default" : "destructive"} className="flex items-center gap-1 shrink-0">
              {isApproved ? (
                <>
                  <CheckCircle className="h-3 w-3" />
                  Approved
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3" />
                  Rejected
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 shrink-0" />
              <span className="truncate">{submission.customer_email}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 shrink-0" />
              <span>{submission.customer_phone}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground col-span-1 sm:col-span-2">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Submitted {format(new Date(submission.created_at), 'MMM d, yyyy')}</span>
            </div>
            {submission.reviewed_at && (
              <div className="flex items-center gap-2 text-muted-foreground col-span-1 sm:col-span-2">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Reviewed {format(new Date(submission.reviewed_at), 'MMM d, yyyy')}</span>
              </div>
            )}
          </div>

          {/* Rejection reason if rejected */}
          {!isApproved && submission.rejection_reason && (
            <div className="text-sm bg-destructive/10 text-destructive p-3 rounded-md">
              <strong>Reason:</strong> {submission.rejection_reason}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full min-w-0 justify-center px-3"
              onClick={() => setShowVideoPreview(true)}
            >
              {isImageUrl(submission.video_url) ? (
                <Image className="h-4 w-4 shrink-0" />
              ) : (
                <Play className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{isImageUrl(submission.video_url) ? 'View' : 'Watch'}</span>
            </Button>
            {isApproved && (
              <Button
                size="sm"
                className="w-full min-w-0 justify-center px-3"
                onClick={handleDownload}
                disabled={isDownloading || !resolvedUrl}
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">Download</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Media Preview Dialog */}
      <Dialog open={showVideoPreview} onOpenChange={setShowVideoPreview}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{isImageUrl(submission.video_url) ? 'Photo' : 'Video'} from {submission.customer_name}</DialogTitle>
            <DialogDescription>
              {submission.promotion?.title} • {format(new Date(submission.created_at), 'MMM d, yyyy')}
            </DialogDescription>
          </DialogHeader>
          <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            {isLoadingUrl ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : resolvedUrl ? (
              isImageUrl(submission.video_url) ? (
                <img src={resolvedUrl} alt={`Submission by ${submission.customer_name}`} className="w-full h-full object-contain" loading="lazy" />
              ) : (
                <video src={resolvedUrl} controls playsInline preload="metadata" aria-label="Approved video submission" className="w-full h-full object-contain" />
              )
            ) : (
              <p className="text-muted-foreground">Unable to load media</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

interface ApprovedVideosTabProps {
  approvedSubmissions: PromotionSubmission[];
  rejectedSubmissions: PromotionSubmission[];
  isLoading?: boolean;
}

export const ApprovedVideosTab: React.FC<ApprovedVideosTabProps> = ({
  approvedSubmissions,
  rejectedSubmissions,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalVideos = approvedSubmissions.length + rejectedSubmissions.length;

  if (totalVideos === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Film className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Reviewed Videos Yet</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Reviewed customer video submissions will appear here. Approved videos can be downloaded for your marketing use.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="approved" className="space-y-4">
        <TabsList>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Approved ({approvedSubmissions.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Rejected ({rejectedSubmissions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approved">
          {approvedSubmissions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Approved Videos</h3>
                <p className="text-muted-foreground text-center">
                  Approved videos will appear here for download.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {approvedSubmissions.map((submission) => (
                <VideoCard key={submission.id} submission={submission} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rejected">
          {rejectedSubmissions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Rejected Videos</h3>
                <p className="text-muted-foreground text-center">
                  Rejected video submissions will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rejectedSubmissions.map((submission) => (
                <VideoCard key={submission.id} submission={submission} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
