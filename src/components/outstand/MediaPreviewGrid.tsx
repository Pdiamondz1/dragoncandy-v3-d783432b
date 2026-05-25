import React, { useState } from 'react';
import { VideoFrameThumbnail } from '@/components/content/VideoFrameThumbnail';

export interface MediaItem {
  url: string;
  fileId?: string;
  mimeType?: string;
  filename?: string;
  storedThumbnailUrl?: string;
}

interface MediaPreviewGridProps {
  items: MediaItem[];
  className?: string;
}

function isVideoItem(item: MediaItem): boolean {
  if (item.mimeType?.startsWith('video/')) return true;
  const ext = item.url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
}

function getContentTypeLabel(item: MediaItem): string {
  if (!isVideoItem(item)) return 'Photo';
  const mime = item.mimeType?.toLowerCase() ?? '';
  if (mime.includes('reel') || mime.includes('short')) return 'Reel';
  return 'Video';
}

export const MediaPreviewGrid: React.FC<MediaPreviewGridProps> = ({ items, className }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (items.length === 0) return null;

  const featured = items[selectedIndex] ?? items[0];
  const isVideo = isVideoItem(featured);
  const contentType = getContentTypeLabel(featured);

  return (
    <div className={className}>
      {/* Hero frame — 1:1 square */}
      <div className="flex justify-center mb-2">
        <div className="w-[200px] h-[200px] lg:w-[200px] lg:h-[200px] w-full aspect-square max-w-[280px] rounded-xl overflow-hidden relative bg-gray-900">
          {isVideo ? (
            <VideoFrameThumbnail
              fileId={featured.fileId ?? `media-${selectedIndex}`}
              videoUrl={featured.url}
              storedThumbnailUrl={featured.storedThumbnailUrl ?? null}
              mimeType={featured.mimeType ?? 'video/mp4'}
              filename={featured.filename ?? 'video'}
              className="w-full h-full"
            />
          ) : (
            <img
              src={featured.url}
              alt={featured.filename ?? 'Content preview'}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute top-2 left-2 bg-black/45 rounded px-2 py-0.5">
            <span className="text-[9px] text-white font-medium">{contentType}</span>
          </div>
        </div>
      </div>

      {/* Thumbnail row — only if multiple items */}
      {items.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {items.map((item, i) => {
            const active = i === selectedIndex;
            const itemIsVideo = isVideoItem(item);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedIndex(i)}
                className={`w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 relative ${
                  active ? 'ring-2 ring-dc-teal' : 'ring-1 ring-gray-200'
                }`}
              >
                {itemIsVideo ? (
                  <VideoFrameThumbnail
                    fileId={item.fileId ?? `thumb-${i}`}
                    videoUrl={item.url}
                    storedThumbnailUrl={item.storedThumbnailUrl ?? null}
                    mimeType={item.mimeType ?? 'video/mp4'}
                    filename={item.filename ?? 'video'}
                    className="w-full h-full"
                    compact
                  />
                ) : (
                  <img
                    src={item.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
              </button>
            );
          })}
          {items.length > 4 && (
            <span className="text-[10px] text-gray-400 flex items-center ml-1">
              +{items.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
