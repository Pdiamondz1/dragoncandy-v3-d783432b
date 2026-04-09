import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Play, Pause, Heart, MessageSquare, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  creatorSlug: string;
  creatorId: string;
}

interface DragonFeedCardProps {
  media: PortfolioMedia;
}

export const DragonFeedCard: React.FC<DragonFeedCardProps> = ({ media }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [liked, setLiked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLoad = () => setLoaded(true);
  const handleError = () => setError(true);
  
  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newLikedState = !liked;
    setLiked(newLikedState);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('analytics_events').insert({
        event_type: 'dragon_feed_like',
        user_id: user.id,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        event_data: {
          content_id: media.id,
          creator_id: media.creatorId,
          action: newLikedState ? 'like' : 'unlike'
        }
      });

      // Send email notification for likes (not unlikes)
      if (newLikedState) {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'content_liked',
            data: {
              recipientUserId: media.creatorId,
              likerName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Someone',
              contentUrl: media.url,
            }
          }
        }).catch(err => console.error('Failed to send like notification email:', err));
      }
    } catch (error) {
      console.error('Failed to track like:', error);
    }
  };

  useEffect(() => {
    const checkIfLiked = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('analytics_events')
        .select('event_data')
        .eq('user_id', user.id)
        .eq('event_type', 'dragon_feed_like')
        .eq('event_data->>content_id', media.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data && typeof data.event_data === 'object' && data.event_data !== null) {
        const eventData = data.event_data as { action?: string };
        if (eventData.action === 'like') {
          setLiked(true);
        }
      }
    };

    checkIfLiked();
  }, [media.id]);
  
  const handleCreatorClick = () => {
    if (media.creatorSlug) {
      navigate(`/creator/${media.creatorSlug}`);
    } else if (media.creatorId) {
      navigate(`/creator/${media.creatorId}`);
    }
  };

  const handleMessage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to send messages.",
          variant: "destructive"
        });
        return;
      }

      const { data: conversationId, error } = await supabase.rpc(
        'create_or_get_direct_conversation',
        {
          user1_uuid: user.id,
          user2_uuid: media.creatorId
        }
      );

      if (error) throw error;

      toast({
        title: "Opening conversation",
        description: `Starting a conversation with ${media.creatorName}`,
      });

      const userRole = user.user_metadata?.role || 'business_client';
      const rolePrefix = userRole === 'brand' ? 'brand' : 'business';
      
      navigate(`/dashboard/${rolePrefix}/messages/direct/${conversationId}`);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast({
        title: "Error",
        description: "Failed to start conversation. Please try again.",
        variant: "destructive"
      });
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


  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-105">
      <div className="relative aspect-square overflow-hidden">
        {!loaded && !error && (
          <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        
        {error ? (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <div className="text-muted-foreground text-sm">Failed to load</div>
          </div>
        ) : (
          <>
            {media.type === 'video' ? (
              <video
                ref={videoRef}
                src={media.url}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 cursor-pointer"
                onLoadedData={handleLoad}
                onError={handleError}
                onClick={toggleVideoPlayback}
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={media.url}
                alt={`Content by ${media.creatorName}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                onLoad={handleLoad}
                onError={handleError}
              />
            )}
          </>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
        
        {/* Play/Pause button for videos */}
        {media.type === 'video' && loaded && (
          <button
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-transparent border-0 cursor-pointer"
            onClick={toggleVideoPlayback}
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            <div className="bg-white/90 rounded-full p-3 shadow-lg pointer-events-none">
              {isPlaying ? (
                <Pause className="h-6 w-6 text-primary fill-current" />
              ) : (
                <Play className="h-6 w-6 text-primary fill-current" />
              )}
            </div>
          </button>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="text-xs bg-black/70 text-white border-0">
            {media.type === 'video' ? 'Video' : 'Photo'}
          </Badge>
        </div>


        {/* Action buttons */}
        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
            onClick={toggleLike}
          >
            <Heart className={`h-4 w-4 ${liked ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
          </Button>
          <Button
            size="sm" 
            variant="secondary"
            className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
            onClick={handleMessage}
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <button
              onClick={handleCreatorClick}
              className="font-medium text-sm text-foreground truncate hover:text-primary transition-colors cursor-pointer text-left w-full"
            >
              {media.creatorName}
            </button>
            <p className="text-xs text-muted-foreground">Creator</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};