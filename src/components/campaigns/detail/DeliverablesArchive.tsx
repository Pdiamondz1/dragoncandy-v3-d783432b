import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useFileUploads } from '@/hooks/useFileQuery';
import { formatFileSize, getVideoThumbnailUrl } from '@/lib/fileUtils';
import { downloadBlob } from '@/lib/downloadUtils';
import { WatermarkedLightbox } from '@/components/content/WatermarkedLightbox';
import { VideoFrameThumbnail } from '@/components/content/VideoFrameThumbnail';
import { SocialPostPrompt } from '@/components/outstand/SocialPostPrompt';
import { SponsorshipAmplificationPrompt } from '@/components/outstand/SponsorshipAmplificationPrompt';
import { PostingPlanReview } from '@/components/outstand/PostingPlanReview';
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { AppCard } from '@/components/app/AppCard';

interface DeliverablesArchiveProps {
  campaignId: string;
  collaborationId: string;
  campaignTitle?: string;
  campaignDescription?: string;
  creatorName?: string;
  restaurantName?: string;
  userRole?: 'business' | 'creator' | 'brand';
}

export const DeliverablesArchive: React.FC<DeliverablesArchiveProps> = ({
  campaignId,
  collaborationId,
  campaignTitle,
  campaignDescription,
  creatorName,
  restaurantName,
  userRole,
}) => {
  const { toast } = useToast();
  const { data: files, isLoading } = useFileUploads(campaignId, 'deliverable');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [hasContentStrategy, setHasContentStrategy] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('campaigns')
      .select('ai_analysis')
      .eq('id', campaignId)
      .single()
      .then(({ data }) => {
        if (!cancelled) {
          setHasContentStrategy(!!data?.ai_analysis?.content_strategy);
        }
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  const downloadFile = async (file: {
    id: string;
    bucket_name: string;
    file_path: string;
    original_filename: string;
  }) => {
    setDownloadingId(file.id);
    let signedUrl: string | null = null;
    try {
      const response = await supabase.functions.invoke('get-watermarked-preview', {
        body: {
          file_path: file.file_path,
          bucket_name: file.bucket_name,
          collaboration_id: collaborationId,
        },
      });

      if (!response.data?.can_download) {
        toast({ variant: 'destructive', title: 'Download Unavailable', description: 'Content must be approved before downloading.' });
        return;
      }

      signedUrl = response.data.signed_url;
      if (!signedUrl) {
        toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not generate download URL.' });
        return;
      }

      await downloadBlob(signedUrl, file.original_filename);
    } catch {
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      } else {
        toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not download file.' });
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadAll = async () => {
    if (!files || files.length === 0) return;
    setDownloadingAll(true);
    try {
      for (const file of files) {
        await downloadFile(file);
        await new Promise(r => setTimeout(r, 500));
      }
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <AppCard className="space-y-3">
      <h3 className="font-bold text-gray-900 text-sm">Deliverables</h3>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading files…
        </div>
      )}

      {!isLoading && (!files || files.length === 0) && (
        <div className="text-center py-4">
          <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">No deliverables uploaded yet.</p>
        </div>
      )}

      {files && files.length > 0 && (
        <>
          {/* File grid */}
          <div className="grid grid-cols-3 gap-2">
            {files.map((file, index) => {
              const isImage = file.mime_type?.startsWith('image/');
              const isVideo = file.mime_type?.startsWith('video/');
              const imageUrl = isImage
                ? supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl
                : null;

              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFileIndex(index)}
                  disabled={downloadingId === file.id}
                  className="aspect-square rounded-xl border border-dc-teal/15 overflow-hidden bg-dc-teal/[0.04] flex items-center justify-center relative group hover:border-teal-400 transition-colors"
                  title={file.original_filename}
                >
                  {downloadingId === file.id && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
                    </div>
                  )}
                  {isVideo ? (
                    <VideoFrameThumbnail
                      fileId={file.id}
                      videoUrl={supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl}
                      storedThumbnailUrl={getVideoThumbnailUrl(file.bucket_name, file.metadata as Record<string, unknown>)}
                      mimeType={file.mime_type}
                      filename={file.original_filename}
                    />
                  ) : imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={file.original_filename}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="text-center p-1">
                      <FileText className="h-6 w-6 text-gray-400 mx-auto" />
                      <p className="text-xs text-gray-400 mt-1 truncate w-full px-1">
                        {file.original_filename.split('.').pop()?.toUpperCase()}
                      </p>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                    {formatFileSize(file.file_size)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={downloadAll}
              disabled={downloadingAll}
              className="flex-1 rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold"
            >
              {downloadingAll ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Downloading…</>
              ) : (
                <><Download className="h-4 w-4 mr-2" />Download All ({files.length})</>
              )}
            </Button>
            <Button
              onClick={() => setShowShareModal(true)}
              variant="outline"
              className="flex-1 rounded-full border-dc-pink-accent text-dc-pink-accent hover:bg-pink-50 font-semibold"
            >
              <Share2 className="h-4 w-4 mr-2" />Share
            </Button>
          </div>

          {/* Protected lightbox */}
          <WatermarkedLightbox
            files={files}
            initialIndex={selectedFileIndex ?? 0}
            collaborationId={collaborationId}
            isOpen={selectedFileIndex !== null}
            onClose={() => setSelectedFileIndex(null)}
          />

          {showShareModal && (
            <DragonCandyOutstandProvider>
              {userRole === 'brand' ? (
                <SponsorshipAmplificationPrompt
                  open={showShareModal}
                  onOpenChange={setShowShareModal}
                  campaignId={campaignId}
                  campaignTitle={campaignTitle ?? ''}
                  restaurantName={restaurantName ?? ''}
                  creatorName={creatorName ?? null}
                  mediaUrls={files
                    .filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/'))
                    .map(f => supabase.storage.from(f.bucket_name).getPublicUrl(f.file_path).data.publicUrl)}
                  originalCaption={campaignDescription ?? ''}
                />
              ) : hasContentStrategy ? (
                <PostingPlanReview
                  open={showShareModal}
                  onOpenChange={setShowShareModal}
                  campaignId={campaignId}
                  campaignTitle={campaignTitle ?? ''}
                  campaignDescription={campaignDescription}
                  mediaItems={files
                    .filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/'))
                    .map(f => ({
                      url: supabase.storage.from(f.bucket_name).getPublicUrl(f.file_path).data.publicUrl,
                      fileId: f.id,
                      mimeType: f.mime_type ?? undefined,
                      filename: f.original_filename ?? undefined,
                      storedThumbnailUrl: getVideoThumbnailUrl(f.bucket_name, f.metadata as Record<string, unknown>) ?? undefined,
                    }))}
                  userRole={userRole === 'business' ? 'restaurant' : userRole ?? 'creator'}
                />
              ) : (
                <SocialPostPrompt
                  open={showShareModal}
                  onOpenChange={setShowShareModal}
                  campaignId={campaignId}
                  campaignTitle={campaignTitle ?? ''}
                  creatorName={creatorName ?? ''}
                  restaurantName={restaurantName ?? ''}
                  mediaUrls={files
                    .filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/'))
                    .map(f => supabase.storage.from(f.bucket_name).getPublicUrl(f.file_path).data.publicUrl)}
                  mediaItems={files
                    .filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/'))
                    .map(f => ({
                      url: supabase.storage.from(f.bucket_name).getPublicUrl(f.file_path).data.publicUrl,
                      fileId: f.id,
                      mimeType: f.mime_type ?? undefined,
                      filename: f.original_filename ?? undefined,
                      storedThumbnailUrl: getVideoThumbnailUrl(f.bucket_name, f.metadata as Record<string, unknown>) ?? undefined,
                    }))}
                  originalCaption={campaignTitle ?? ''}
                  userRole={userRole === 'business' ? 'restaurant' : userRole ?? 'creator'}
                />
              )}
            </DragonCandyOutstandProvider>
          )}
        </>
      )}
    </AppCard>
  );
};
