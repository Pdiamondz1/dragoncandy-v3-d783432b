import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Lock,
  Loader2,
  FileText,
  Play,
} from 'lucide-react';
import { useProtectedPreview } from '@/hooks/useProtectedPreview';
import { downloadBlob } from '@/lib/downloadUtils';
import { getVideoThumbnailUrl } from '@/lib/fileUtils';

interface LightboxFile {
  id: string;
  original_filename: string;
  file_path: string;
  bucket_name: string;
  mime_type: string;
  metadata?: Record<string, unknown>;
}

interface WatermarkedLightboxProps {
  files: LightboxFile[];
  initialIndex: number;
  collaborationId: string;
  isOpen: boolean;
  onClose: () => void;
}

const WatermarkOverlay: React.FC<{ opacity?: string }> = ({ opacity = 'opacity-20' }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-10">
    <div className={`absolute inset-0 flex flex-wrap items-center justify-center gap-8 -rotate-30 scale-150 ${opacity}`}>
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="text-2xl font-black tracking-[0.3em] text-white whitespace-nowrap"
        >
          PREVIEW ONLY — DRAGONCANDY
        </span>
      ))}
    </div>
  </div>
);

const LightboxContent: React.FC<{
  file: LightboxFile;
  collaborationId: string;
}> = ({ file, collaborationId }) => {
  const isImage = file.mime_type?.startsWith('image/');
  const isVideo = file.mime_type?.startsWith('video/');
  const [videoError, setVideoError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const posterUrl = isVideo
    ? getVideoThumbnailUrl(file.bucket_name, file.metadata) ?? undefined
    : undefined;

  const { signedUrl, canDownload, message, loading } = useProtectedPreview({
    filePath: file.file_path,
    bucketName: file.bucket_name,
    collaborationId,
  });

  const handleDownload = useCallback(async () => {
    if (!canDownload || !signedUrl) return;
    setDownloading(true);
    try {
      await downloadBlob(signedUrl, file.original_filename);
    } catch {
      if (signedUrl) window.open(signedUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  }, [canDownload, signedUrl, file.original_filename]);

  if (loading || !signedUrl) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 text-dc-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex-1 flex items-center justify-center bg-black relative min-h-[50vh] lg:min-h-[70vh] select-none"
        onContextMenu={(e) => { if (!canDownload) e.preventDefault(); }}
      >
        {isImage && (
          <>
            <img
              src={signedUrl}
              alt={file.original_filename}
              className="max-w-full max-h-[80vh] object-contain"
              draggable={canDownload}
            />
            {!canDownload && <WatermarkOverlay />}
          </>
        )}

        {isVideo && !videoError && (
          <>
            <video
              key={signedUrl}
              src={signedUrl}
              poster={posterUrl}
              controls
              autoPlay
              playsInline
              controlsList={!canDownload ? 'nodownload' : undefined}
              disablePictureInPicture={!canDownload}
              className="max-w-full max-h-[80vh] object-contain"
              onError={() => setVideoError(true)}
            />
            {!canDownload && <WatermarkOverlay opacity="opacity-15" />}
          </>
        )}

        {isVideo && videoError && (
          <div className="flex flex-col items-center gap-4 py-10 px-4 relative">
            {posterUrl ? (
              <>
                <img
                  src={posterUrl}
                  alt={file.original_filename}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg"
                />
                {!canDownload && <WatermarkOverlay />}
                <p className="text-sm text-gray-400 text-center">
                  Video preview frame — {canDownload ? 'download to watch the full video.' : 'full video available after approval.'}
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-dc-teal/10 flex items-center justify-center">
                  <Play className="h-8 w-8 text-dc-teal" />
                </div>
                <p className="text-white font-semibold text-center">{file.original_filename}</p>
                <p className="text-sm text-gray-400 text-center">
                  This video format can't be previewed in the browser.
                  {canDownload ? ' Download it to watch in your video player.' : ''}
                </p>
              </>
            )}
            {canDownload && (
              <Button
                className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold px-8"
                disabled={downloading}
                onClick={handleDownload}
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Download Video
              </Button>
            )}
          </div>
        )}

        {!isImage && !isVideo && (
          <div className="flex flex-col items-center gap-4 py-10 px-4">
            <FileText className="h-12 w-12 text-gray-400" />
            <p className="text-white font-semibold text-center">{file.original_filename}</p>
            <p className="text-sm text-gray-400 text-center">
              {canDownload ? 'Download to view this file.' : message || 'Preview not available for this file type.'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-gray-950 border-t border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-sm text-gray-300 truncate">{file.original_filename}</p>
          {!canDownload && (
            <Badge variant="outline" className="text-xs gap-1 bg-yellow-900/30 text-yellow-300 border-yellow-600 shrink-0">
              <Lock className="h-3 w-3" />
              Preview Only
            </Badge>
          )}
        </div>
        {canDownload && (
          <Button
            size="sm"
            className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold shrink-0"
            disabled={downloading}
            onClick={handleDownload}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download
          </Button>
        )}
      </div>
    </div>
  );
};

export const WatermarkedLightbox: React.FC<WatermarkedLightboxProps> = ({
  files,
  initialIndex,
  collaborationId,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const total = files.length;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  useEffect(() => {
    if (isOpen) setCurrentIndex(initialIndex);
  }, [isOpen, initialIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex(i => (i < total - 1 ? i + 1 : i));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => (i > 0 ? i - 1 : i));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goPrev, goNext]);

  const file = files[currentIndex];
  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[95vh] p-0 border-0 bg-black/95 overflow-hidden rounded-2xl sm:rounded-2xl"
        onInteractOutside={onClose}
      >
        <DialogTitle className="sr-only">Content preview</DialogTitle>
        <DialogDescription className="sr-only">Preview uploaded content with watermark protection</DialogDescription>

        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          aria-label="Close lightbox"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Previous file"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
        )}
        {currentIndex < total - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Next file"
          >
            <ChevronRight className="h-6 w-6 text-white" />
          </button>
        )}

        {total > 1 && (
          <div className="absolute top-3 left-3 z-20">
            <span className="text-xs text-gray-400 bg-black/50 px-2 py-1 rounded-full">
              {currentIndex + 1} of {total}
            </span>
          </div>
        )}

        <LightboxContent
          key={file.id}
          file={file}
          collaborationId={collaborationId}
        />
      </DialogContent>
    </Dialog>
  );
};
