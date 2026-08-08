import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import useEmblaCarousel from 'embla-carousel-react';
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageSquare, X, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { useFeedLike } from '@/hooks/useFeedLike';
import { useRecordFeedView } from '@/hooks/useRecordFeedView';
import { useMessageCreator } from '@/hooks/useMessageCreator';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

interface FeedViewerProps {
  items: PortfolioMedia[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export const FeedViewer: React.FC<FeedViewerProps> = ({ items, index, onIndexChange, onClose }) => {
  const navigate = useNavigate();
  const activeItem = items[index] ?? null;
  const { liked, toggleLike } = useFeedLike(activeItem);
  const { messageCreator } = useMessageCreator();
  const recordView = useRecordFeedView();
  const videoRefs = useRef(new Map<number, HTMLVideoElement>());

  // A "view" is an item reaching the lightbox — including each one swiped to. Deduped per
  // user/item/day inside the hook, and fire-and-forget so analytics never blocks browsing.
  useEffect(() => {
    void recordView(activeItem);
  }, [activeItem?.id, activeItem, recordView]);

  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex: index, loop: false });

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    onIndexChange(emblaApi.selectedScrollSnap());
  }, [emblaApi, onIndexChange]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // External index changes (chevrons, arrow keys) drive the carousel.
  useEffect(() => {
    if (emblaApi && emblaApi.selectedScrollSnap() !== index) {
      emblaApi.scrollTo(index);
    }
  }, [emblaApi, index]);

  // Play the active slide's video, pause the rest.
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (i === index) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [index]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, items.length, onClose, onIndexChange]);

  const handleCreatorClick = () => {
    if (!activeItem) return;
    navigate(`/creator/${activeItem.creatorSlug || activeItem.creatorId}`);
  };

  if (!activeItem) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black lg:bg-black/80" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 h-dvh w-screen bg-black focus:outline-none lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[90vh] lg:w-full lg:max-w-5xl lg:-translate-x-1/2 lg:-translate-y-1/2 lg:overflow-hidden lg:rounded-2xl"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Content by {activeItem.creatorName}
          </DialogPrimitive.Title>

          {/* Swipe pager */}
          <div ref={emblaRef} className="h-full overflow-hidden">
            <div className="flex h-full">
              {items.map((item, i) => {
                const isNear = Math.abs(i - index) <= 1;
                return (
                  <div key={item.id} className="relative h-full min-w-0 flex-[0_0_100%]">
                    {isNear && (
                      item.type === 'video' ? (
                        <video
                          ref={(el) => {
                            if (el) videoRefs.current.set(i, el);
                            else videoRefs.current.delete(i);
                          }}
                          src={item.url}
                          aria-label={`Video by ${item.creatorName}`}
                          className="h-full w-full object-contain"
                          muted
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={item.url}
                          alt={`Content by ${item.creatorName}`}
                          className="h-full w-full object-contain"
                        />
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            className="absolute left-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Position counter */}
          <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 text-xs text-white/70">
            {index + 1} / {items.length}
          </div>

          {/* Desktop-only chevrons */}
          {index > 0 && (
            <button
              type="button"
              onClick={() => onIndexChange(index - 1)}
              aria-label="Previous item"
              className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 lg:flex"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {index < items.length - 1 && (
            <button
              type="button"
              onClick={() => onIndexChange(index + 1)}
              aria-label="Next item"
              className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 lg:flex"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Bottom action bar */}
          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCreatorClick}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Avatar className="h-8 w-8 ring-2 ring-teal-400">
                  <AvatarImage src={activeItem.avatarUrl} alt={activeItem.creatorName} />
                  <AvatarFallback className="text-xs">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium text-white">{activeItem.creatorName}</span>
              </button>
              <button
                type="button"
                onClick={toggleLike}
                aria-label={liked ? 'Unlike' : 'Like'}
                className="rounded-full bg-white/90 p-2 hover:bg-white"
              >
                <Heart className={`h-5 w-5 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-700'}`} />
              </button>
              <button
                type="button"
                onClick={() => messageCreator(activeItem.creatorId, activeItem.creatorName)}
                aria-label={`Message ${activeItem.creatorName}`}
                className="rounded-full bg-white/90 p-2 hover:bg-white"
              >
                <MessageSquare className="h-5 w-5 text-gray-700" />
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};
