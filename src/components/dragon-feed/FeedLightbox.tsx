import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Heart, MessageSquare, X, ChevronLeft, ChevronRight, User, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface FeedLightboxProps {
  item: FeedMediaItem | null;
  allItems: FeedMediaItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export const FeedLightbox: React.FC<FeedLightboxProps> = ({
  item,
  allItems,
  currentIndex,
  onClose,
  onNavigate,
}) => {
  const [liked, setLiked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeOrgUnit } = useAuth();

  // Hydrate liked state from database when item changes
  useEffect(() => {
    const checkIfLiked = async () => {
      if (!item) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('analytics_events')
        .select('event_data')
        .eq('user_id', user.id)
        .eq('event_type', 'dragon_feed_like')
        .eq('event_data->>content_id', item.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && typeof data.event_data === 'object' && data.event_data !== null) {
        const eventData = data.event_data as { action?: string };
        setLiked(eventData.action === 'like');
      } else {
        setLiked(false);
      }
    };

    checkIfLiked();
  }, [item?.id, item]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && currentIndex < allItems.length - 1) onNavigate(currentIndex + 1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, allItems.length, onClose, onNavigate]);

  const handleLike = async () => {
    const newLikedState = !liked;
    setLiked(newLikedState);
    
    // Track like in analytics
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('analytics_events').insert({
        event_type: 'dragon_feed_like',
        user_id: user.id,
        org_unit_id: activeOrgUnit?.id ?? null,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        event_data: {
          content_id: item?.id,
          creator_id: item?.creatorId,
          action: newLikedState ? 'like' : 'unlike'
        }
      });

      // Send email notification for likes (not unlikes)
      if (newLikedState) {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'content_liked',
            data: {
              recipientUserId: item?.creatorId,
              likerName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Someone',
              contentUrl: item?.url,
            }
          }
        }).catch(err => console.error('Failed to send like notification email:', err));
      }
    } catch (error) {
      console.error('Failed to track like:', error);
    }
  };

  const handleMessage = async () => {
    if (!item) return;
    
    try {
      // Create or get direct conversation with creator
      const { data, error } = await supabase.rpc('create_or_get_direct_conversation', {
        user1_uuid: (await supabase.auth.getUser()).data.user?.id,
        user2_uuid: item.creatorId
      });

      if (error) throw error;

      toast({
        title: "Opening conversation",
        description: `Starting a conversation with ${item.creatorName}`,
      });

      navigate(`/dashboard/business/messages/direct/${data}`);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast({
        title: "Error",
        description: "Failed to start conversation. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleCreatorClick = () => {
    if (item?.creatorSlug) {
      navigate(`/creator/${item.creatorSlug}`);
    }
  };

  const toggleVideoPlayback = async () => {
    if (!videoRef.current) return;
    
    try {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Video playback error:', error);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 gap-0">
        <div className="relative h-full flex flex-col bg-background">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Navigation buttons */}
          {currentIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white"
              onClick={() => onNavigate(currentIndex - 1)}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          
          {currentIndex < allItems.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white"
              onClick={() => onNavigate(currentIndex + 1)}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}

          {/* Content area */}
          <div className="flex-1 flex items-center justify-center bg-black/95 relative">
            {item.type === 'video' ? (
              <>
                <video
                  ref={videoRef}
                  src={item.url}
                  className="max-h-full max-w-full object-contain"
                  controls
                  playsInline
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                {!isPlaying && (
                  <button
                    className="absolute inset-0 flex items-center justify-center"
                    onClick={toggleVideoPlayback}
                  >
                    <div className="bg-white/90 rounded-full p-4 shadow-lg">
                      <Play className="h-8 w-8 text-primary fill-current" />
                    </div>
                  </button>
                )}
              </>
            ) : (
              <img
                src={item.url}
                alt={`Content by ${item.creatorName}`}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          {/* Info bar */}
          <div className="p-4 border-t bg-card">
            <div className="flex items-center justify-between">
              <button
                onClick={handleCreatorClick}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <p className="font-semibold text-foreground">{item.creatorName}</p>
                  <p className="text-xs text-muted-foreground">Creator</p>
                </div>
              </button>

              <div className="flex items-center gap-2">
                <Button
                  variant={liked ? "default" : "outline"}
                  size="sm"
                  onClick={handleLike}
                  className="gap-2"
                >
                  <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                  Like
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMessage}
                  className="gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Message
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
