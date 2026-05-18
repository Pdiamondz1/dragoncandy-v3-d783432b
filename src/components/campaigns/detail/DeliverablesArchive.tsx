import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useFileUploads } from '@/hooks/useFileQuery';
import { formatFileSize, getVideoThumbnailUrl } from '@/lib/fileUtils';
import { downloadBlob } from '@/lib/downloadUtils';
import { WatermarkedLightbox } from '@/components/content/WatermarkedLightbox';

interface DeliverablesArchiveProps {
  campaignId: string;
  collaborationId: string;
}

export const DeliverablesArchive: React.FC<DeliverablesArchiveProps> = ({
  campaignId,
  collaborationId,
}) => {
  const { toast } = useToast();
  const { data: files, isLoading } = useFileUploads(campaignId, 'deliverable');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);

  const downloadFile = async (file: {
    id: string;
    bucket_name: string;
    file_path: string;
    original_filename: string;
  }) => {
    setDownloadingId(file.id);
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

      const signedUrl = response.data.signed_url;
      if (!signedUrl) {
        toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not generate download URL.' });
        return;
      }

      await downloadBlob(signedUrl, file.original_filename);
    } catch {
      toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not download file.' });
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadAll = async () => {
    if (!files || files.length === 0) return;
    setDownloadingAll(true);
    try {
      await Promise.allSettled(files.map(downloadFile));
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
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
              const publicUrl = isImage
                ? supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl
                : isVideo ? getVideoThumbnailUrl(file.bucket_name, file.metadata as Record<string, unknown>) : null;

              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFileIndex(index)}
                  disabled={downloadingId === file.id}
                  className="aspect-square rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center relative group hover:border-teal-400 transition-colors"
                  title={file.original_filename}
                >
                  {downloadingId === file.id && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
                    </div>
                  )}
                  {publicUrl ? (
                    <>
                      <img
                        src={publicUrl}
                        alt={file.original_filename}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                            <Play className="h-4 w-4 text-white ml-0.5" />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center p-1">
                      {isVideo
                        ? <Play className="h-6 w-6 text-gray-400 mx-auto" />
                        : <FileText className="h-6 w-6 text-gray-400 mx-auto" />
                      }
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

          {/* Download All */}
          <Button
            onClick={downloadAll}
            disabled={downloadingAll}
            className="w-full rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold"
          >
            {downloadingAll ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Downloading…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Download All ({files.length})</>
            )}
          </Button>

          {/* Protected lightbox */}
          <WatermarkedLightbox
            files={files}
            initialIndex={selectedFileIndex ?? 0}
            collaborationId={collaborationId}
            isOpen={selectedFileIndex !== null}
            onClose={() => setSelectedFileIndex(null)}
          />
        </>
      )}
    </div>
  );
};
