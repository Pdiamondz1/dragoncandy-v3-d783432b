
import { useState, useEffect, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TypingUser {
  user_id: string;
  user_name: string;
  timestamp: number;
}

export const useTypingIndicator = (campaignId: string) => {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  // Listen for typing indicators and manage channel subscription
  useEffect(() => {
    if (!campaignId || !user) return;

    const channelInstance = supabase
      .channel(`typing-${campaignId}`)
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channelInstance.presenceState();
        const currentTypingUsers: TypingUser[] = [];

        Object.values(presenceState).forEach((presences) => {
          (presences as unknown as Array<{ user_id: string; user_name: string; typing: boolean; timestamp: number }>).forEach((presence) => {
            // Don't show our own typing indicator
            if (presence.user_id !== user.id && presence.typing) {
              currentTypingUsers.push({
                user_id: presence.user_id,
                user_name: presence.user_name,
                timestamp: presence.timestamp
              });
            }
          });
        });

        setTypingUsers(currentTypingUsers);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setChannel(channelInstance);
        }
      });

    return () => {
      if (channelInstance) {
        supabase.removeChannel(channelInstance);
      }
      setChannel(null);
    };
  }, [campaignId, user]);

  // Send typing indicator
  const sendTypingIndicator = useCallback(async (typing: boolean) => {
    if (!user || !campaignId || !channel) return;
    
    try {
      if (typing) {
        await channel.track({
          user_id: user.id,
          user_name: user.user_metadata?.full_name || 'Unknown User',
          typing: true,
          timestamp: Date.now()
        });
      } else {
        await channel.untrack();
      }
      setIsTyping(typing);
    } catch (error) {
      console.error('Error sending typing indicator:', error);
    }
  }, [user, campaignId, channel]);

  // Clean up old typing indicators (remove after 3 seconds of inactivity)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev => 
        prev.filter(typingUser => now - typingUser.timestamp < 3000)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    typingUsers,
    sendTypingIndicator,
    isTyping
  };
};
