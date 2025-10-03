import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMessages } from '@/hooks/useMessages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import MessageList from './MessageList';
import MessageInputEnhanced from './MessageInputEnhanced';
import { Building2, User, Users } from 'lucide-react';

interface Participant {
  user_id: string;
  role: 'brand' | 'restaurant' | 'creator';
  name: string;
  avatar_url?: string;
}

interface CampaignConversationProps {
  campaignId: string;
  conversationId?: string;
}

const CampaignConversation: React.FC<CampaignConversationProps> = ({
  campaignId,
  conversationId,
}) => {
  const { user } = useAuth();

  // Fetch messages for this campaign
  const messagesQuery = useMessages(campaignId, conversationId);
  const messages = messagesQuery.data || [];
  const messagesLoading = messagesQuery.isLoading;

  // Fetch campaign details
  const { data: campaign } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('title, user_id')
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!campaignId,
  });

  // Fetch participants (restaurant owner, brand sponsor, creator)
  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: ['campaign_participants', campaignId],
    queryFn: async () => {
      const participantsList: Participant[] = [];

      // Get restaurant owner
      if (campaign?.user_id) {
        const { data: restaurantProfile } = await supabase
          .from('business_profiles')
          .select('business_name, logo_url')
          .eq('user_id', campaign.user_id)
          .eq('account_type', 'restaurant')
          .single();

        if (restaurantProfile) {
          participantsList.push({
            user_id: campaign.user_id,
            role: 'restaurant',
            name: restaurantProfile.business_name,
            avatar_url: restaurantProfile.logo_url || undefined,
          });
        }
      }

      // Get brand sponsor(s)
      const { data: sponsorships } = await supabase
        .from('campaign_sponsorships')
        .select(`
          brand_id,
          brand:brand_id (
            user_id,
            business_name,
            logo_url
          )
        `)
        .eq('campaign_id', campaignId)
        .eq('status', 'accepted');

      if (sponsorships) {
        sponsorships.forEach((s: any) => {
          if (s.brand) {
            participantsList.push({
              user_id: s.brand.user_id,
              role: 'brand',
              name: s.brand.business_name,
              avatar_url: s.brand.logo_url || undefined,
            });
          }
        });
      }

      // Get creator(s)
      const { data: collaborations } = await supabase
        .from('campaign_collaborations')
        .select(`
          creator_id,
          creator:creator_id (
            user_id,
            creator_name,
            avatar_url
          )
        `)
        .eq('campaign_id', campaignId)
        .eq('status', 'active');

      if (collaborations) {
        collaborations.forEach((c: any) => {
          if (c.creator) {
            participantsList.push({
              user_id: c.creator.user_id,
              role: 'creator',
              name: c.creator.creator_name,
              avatar_url: c.creator.avatar_url || undefined,
            });
          }
        });
      }

      return participantsList;
    },
    enabled: !!campaignId && !!campaign,
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'brand':
        return <Building2 className="h-4 w-4" />;
      case 'restaurant':
        return <Building2 className="h-4 w-4" />;
      case 'creator':
        return <User className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'brand':
        return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
      case 'restaurant':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'creator':
        return 'bg-green-500/10 text-green-700 border-green-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const handleSendMessage = async (
    content: string,
    options?: {
      attachmentUrl?: string;
      attachmentName?: string;
      attachmentSize?: number;
      parentMessageId?: string;
      threadId?: string;
    }
  ) => {
    if (!user || !participants || participants.length === 0) return;

    // For multi-party conversations, send to all other participants
    const recipientIds = participants
      .filter(p => p.user_id !== user.id)
      .map(p => p.user_id);

    // Send message to each participant
    for (const recipientId of recipientIds) {
      const { error } = await supabase.from('messages').insert({
        campaign_id: campaignId,
        conversation_id: conversationId || null,
        sender_id: user.id,
        recipient_id: recipientId,
        content,
        attachment_url: options?.attachmentUrl,
        attachment_name: options?.attachmentName,
        attachment_size: options?.attachmentSize,
        parent_message_id: options?.parentMessageId,
        thread_id: options?.threadId,
        category: 'campaign',
      });

      if (error) {
        console.error('Error sending message:', error);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Participants Header */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Campaign Participants
          </CardTitle>
        </CardHeader>
        <CardContent>
          {participantsLoading ? (
            <div className="flex gap-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          ) : participants && participants.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {participants.map((participant) => (
                <div
                  key={participant.user_id}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={participant.avatar_url} />
                    <AvatarFallback>
                      {participant.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{participant.name}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getRoleBadgeColor(participant.role)}`}
                    >
                      <span className="mr-1">{getRoleIcon(participant.role)}</span>
                      {participant.role.charAt(0).toUpperCase() + participant.role.slice(1)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No participants yet</p>
          )}
        </CardContent>
      </Card>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <MessageList 
          campaignId={campaignId}
          conversationId={conversationId}
          messages={messages}
          isLoading={messagesLoading}
        />
      </div>

      {/* Message Input */}
      <div className="mt-4">
        <MessageInputEnhanced
          campaignId={campaignId}
          conversationId={conversationId}
          onSendMessage={handleSendMessage}
          placeholder="Send message to all participants..."
        />
      </div>
    </div>
  );
};

export default CampaignConversation;
