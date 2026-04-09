import React, { useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import ContactCreatorModal from '@/components/creator-profile/ContactCreatorModal';

interface PortfolioItem {
  url: string;
  type: 'Photo' | 'Reel' | 'Video' | 'Story' | null;
}

interface CreatorInfo {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  response_time?: string;
}

interface PortfolioLightboxProps {
  items: PortfolioItem[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  creator: CreatorInfo;
}

export const PortfolioLightbox: React.FC<PortfolioLightboxProps> = ({
  items,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
  creator,
}) => {
  const item = items[currentIndex];
  const total = items.length;
  const isVideo = item?.type === 'Reel' || item?.type === 'Video';

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) onIndexChange(currentIndex + 1);
  }, [currentIndex, total, onIndexChange]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onIndexChange(currentIndex - 1);
  }, [currentIndex, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goPrev, goNext]);

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[95vh] p-0 border-0 bg-black/95 overflow-hidden rounded-2xl sm:rounded-2xl"
        onInteractOutside={onClose}
      >
        <DialogTitle className="sr-only">{creator.creator_name} Portfolio</DialogTitle>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          aria-label="Close lightbox"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {/* Navigation arrows */}
        {currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Previous item"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
        )}
        {currentIndex < total - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Next item"
          >
            <ChevronRight className="h-6 w-6 text-white" />
          </button>
        )}

        {/* Media area */}
        <div className="flex flex-col lg:flex-row min-h-0 max-h-[95vh]">
          {/* Content */}
          <div className="flex-1 flex items-center justify-center bg-black min-h-[50vh] lg:min-h-[70vh] relative">
            {isVideo ? (
              <video
                key={item.url}
                src={item.url}
                controls
                playsInline
                preload="metadata"
                className="max-w-full max-h-[85vh] object-contain"
              />
            ) : (
              <img
                src={item.url}
                alt={`${creator.creator_name} portfolio item ${currentIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain"
                loading="eager"
                decoding="async"
              />
            )}
          </div>

          {/* Sidebar / Bottom panel */}
          <div className="w-full lg:w-72 flex-shrink-0 bg-gray-950 p-4 flex flex-col gap-3 border-t lg:border-t-0 lg:border-l border-white/10">
            {/* Item info */}
            <div className="flex items-center gap-2">
              {item.type && (
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                  item.type === 'Photo' ? 'bg-dc-teal/20 text-dc-teal' :
                  item.type === 'Reel' ? 'bg-dc-pink/20 text-dc-pink' :
                  'bg-gray-700 text-gray-300'
                }`}>
                  {item.type}
                </span>
              )}
              <span className="text-xs text-gray-400">
                {currentIndex + 1} of {total}
              </span>
            </div>

            <p className="text-sm text-gray-300 font-medium">
              {creator.creator_name}
            </p>

            {/* CTAs */}
            <div className="flex flex-col gap-2 mt-auto">
              <ContactCreatorModal
                creator={creator}
                trigger={
                  <Button className="w-full bg-dc-teal text-white rounded-full h-11 font-bold text-sm hover:bg-dc-teal/90">
                    Hire This Creator
                  </Button>
                }
              />
              <ContactCreatorModal
                creator={creator}
                trigger={
                  <Button
                    variant="outline"
                    className="w-full bg-transparent text-white rounded-full h-11 font-bold text-sm border-white/20 hover:bg-white/10"
                  >
                    Message Creator
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
