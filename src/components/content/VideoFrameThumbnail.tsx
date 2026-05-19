import React, { useRef, useEffect } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useVideoFrameCapture } from '@/hooks/useVideoFrameCapture';
import { persistVideoThumbnail } from '@/lib/thumbnailBackfill';

interface VideoFrameThumbnailProps {
  fileId: string;
  videoUrl: string | null;
  storedThumbnailUrl: string | null;
  mimeType: string;
  filename: string;
  className?: string;
}

export const VideoFrameThumbnail: React.FC<VideoFrameThumbnailProps> = ({
  fileId,
  videoUrl,
  storedThumbnailUrl,
  mimeType,
  filename,
  className = 'w-full h-full',
}) => {
  const needsCapture = !storedThumbnailUrl;
  const captureUrl = needsCapture ? videoUrl : null;
  const { frameDataUrl, loading, error } = useVideoFrameCapture(captureUrl, mimeType);
  const persistedRef = useRef<string | null>(null);

  useEffect(() => {
    if (frameDataUrl && fileId && persistedRef.current !== fileId) {
      persistedRef.current = fileId;
      persistVideoThumbnail(fileId, frameDataUrl);
    }
  }, [frameDataUrl, fileId]);

  const thumbnailSrc = storedThumbnailUrl ?? frameDataUrl;

  return (
    <div className={`${className} relative bg-gray-900`}>
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={filename}
          className="w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : loading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-dc-teal animate-spin" />
        </div>
      ) : null}

      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
        <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
          <Play className="h-5 w-5 text-white fill-white ml-0.5" />
        </div>
      </div>

      {!thumbnailSrc && !loading && error && (
        <div className="absolute bottom-1 left-0 right-0 text-center">
          <span className="text-[10px] text-gray-400 truncate block px-1">{filename}</span>
        </div>
      )}
    </div>
  );
};
