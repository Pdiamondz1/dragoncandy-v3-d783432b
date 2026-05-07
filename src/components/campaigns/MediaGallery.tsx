import React, { useState } from 'react';
import { Play, X, Image, Film } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import type { CampaignMediaItem, MediaType } from '@/types/campaignMedia';

interface MediaGalleryProps {
  media: CampaignMediaItem[];
  editable?: boolean;
  showTypeFilter?: boolean;
  onRemove?: (mediaId: string) => void;
}

const isVideo = (item: CampaignMediaItem): boolean => {
  if (item.mime_type) return item.mime_type.startsWith('video/');
  return item.media_type === 'reference_video';
};

const mediaTypeLabel = (type: MediaType): string => {
  switch (type) {
    case 'reference_image':
      return 'Photo';
    case 'reference_video':
      return 'Video';
    case 'ai_preview':
      return 'AI Preview';
    case 'raw_footage':
      return 'Raw Footage';
    default:
      return type;
  }
};

interface MediaItemCardProps {
  item: CampaignMediaItem;
  editable?: boolean;
  onRemove?: (mediaId: string) => void;
  onClick: () => void;
}

const MediaItemCard: React.FC<MediaItemCardProps> = ({ item, editable, onRemove, onClick }) => {
  const video = isVideo(item);

  return (
    <button type="button" className="relative group cursor-pointer w-full text-left" onClick={onClick}>
      <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 relative">
        {video ? (
          /* Video placeholder with play icon */
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <Film className="w-8 h-8 text-gray-400" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-5 h-5 text-white ml-0.5" />
              </div>
            </div>
          </div>
        ) : (
          <img
            src={item.file_url}
            alt={item.file_name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}

        {/* Type badge */}
        <div className="absolute bottom-1 left-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-black/60 text-white">
            {video ? <Film className="w-3 h-3" /> : <Image className="w-3 h-3" />}
            {video ? 'Video' : 'Photo'}
          </span>
        </div>

        {/* Remove button (editable mode) */}
        {editable && onRemove && (
          <button
            type="button"
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.id);
            }}
            aria-label="Remove media"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* File name */}
      <p className="mt-1 text-xs text-gray-600 truncate" title={item.file_name}>
        {item.file_name}
      </p>
    </button>
  );
};

interface LightboxProps {
  item: CampaignMediaItem | null;
  open: boolean;
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ item, open, onClose }) => {
  if (!item) return null;
  const video = isVideo(item);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-full p-2 bg-black border-none">
        <DialogClose className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition-colors">
          <X className="w-4 h-4" />
        </DialogClose>
        <div className="flex items-center justify-center min-h-[200px]">
          {video ? (
            <video
              src={item.file_url}
              controls
              aria-label="Campaign media"
              className="max-w-full max-h-[80vh] rounded-lg"
            />
          ) : (
            <img
              src={item.file_url}
              alt={item.file_name}
              className="max-w-full max-h-[80vh] rounded-lg object-contain"
            />
          )}
        </div>
        <p className="text-center text-xs text-gray-400 mt-1 truncate px-4">{item.file_name}</p>
      </DialogContent>
    </Dialog>
  );
};

const MediaGrid: React.FC<{
  items: CampaignMediaItem[];
  editable?: boolean;
  onRemove?: (mediaId: string) => void;
  onItemClick: (item: CampaignMediaItem) => void;
}> = ({ items, editable, onRemove, onItemClick }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
    {items.map((item) => (
      <MediaItemCard
        key={item.id}
        item={item}
        editable={editable}
        onRemove={onRemove}
        onClick={() => onItemClick(item)}
      />
    ))}
  </div>
);

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  media,
  editable = false,
  showTypeFilter = false,
  onRemove,
}) => {
  const [lightboxItem, setLightboxItem] = useState<CampaignMediaItem | null>(null);

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400">
        <Image className="w-10 h-10 mb-2" />
        <p className="text-sm">No media uploaded</p>
      </div>
    );
  }

  // Unique media types present
  const uniqueTypes = Array.from(new Set(media.map((m) => m.media_type)));

  const handleItemClick = (item: CampaignMediaItem) => {
    setLightboxItem(item);
  };

  const handleLightboxClose = () => {
    setLightboxItem(null);
  };

  return (
    <>
      {showTypeFilter && uniqueTypes.length > 1 ? (
        <Tabs defaultValue="all">
          <TabsList className="mb-3">
            <TabsTrigger value="all">All</TabsTrigger>
            {uniqueTypes.map((type) => (
              <TabsTrigger key={type} value={type}>
                {mediaTypeLabel(type)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all">
            <MediaGrid
              items={media}
              editable={editable}
              onRemove={onRemove}
              onItemClick={handleItemClick}
            />
          </TabsContent>

          {uniqueTypes.map((type) => (
            <TabsContent key={type} value={type}>
              <MediaGrid
                items={media.filter((m) => m.media_type === type)}
                editable={editable}
                onRemove={onRemove}
                onItemClick={handleItemClick}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <MediaGrid
          items={media}
          editable={editable}
          onRemove={onRemove}
          onItemClick={handleItemClick}
        />
      )}

      <Lightbox item={lightboxItem} open={lightboxItem !== null} onClose={handleLightboxClose} />
    </>
  );
};

