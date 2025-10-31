
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Archive, Search } from 'lucide-react';
import { useConversations, useArchiveConversation, Conversation } from '@/hooks/useConversations';
import UserPresenceIndicator from './UserPresenceIndicator';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

interface DirectMessagesListProps {
  onConversationSelect?: (conversationId: string) => void;
}

const DirectMessagesList: React.FC<DirectMessagesListProps> = ({ onConversationSelect }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: conversations = [], isLoading } = useConversations();
  const archiveConversation = useArchiveConversation();

  // No filtering - show both direct and campaign conversations
  const allConversations = conversations;

  const handleConversationClick = (conversation: Conversation) => {
    if (conversation.conversation_type === 'campaign' && conversation.campaign_id) {
      // Navigate to campaign messages
      const userRole = user?.user_metadata?.role || 'business_client';
      const role = userRole === 'content_creator' ? 'creator' : userRole === 'brand' ? 'brand' : 'business';
      navigate(`/dashboard/${role}/messages/campaign/${conversation.campaign_id}`);
    } else if (conversation.conversation_id) {
      // Navigate to direct conversation
      if (onConversationSelect) {
        onConversationSelect(conversation.conversation_id);
      } else {
        const userRole = user?.user_metadata?.role || 'business_client';
        const role = userRole === 'content_creator' ? 'creator' : userRole === 'brand' ? 'brand' : 'business';
        navigate(`/dashboard/${role}/messages/direct/${conversation.conversation_id}`);
      }
    }
  };

  const handleArchive = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (conversationId) {
      archiveConversation.mutate(conversationId);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-10 w-10 bg-gray-300 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-border/50 shadow-lg">
      <CardHeader className="border-b border-border/50 bg-muted/30">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-primary" />
            Direct Messages
          </CardTitle>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {allConversations.length === 0 ? (
          <div className="p-8 text-center">
            <div className="p-6 bg-muted/30 rounded-full w-fit mx-auto mb-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">No conversations yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Start a conversation with creators or business clients to see them here
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {allConversations.map((conversation, index) => (
              <div
                key={conversation.conversation_id || conversation.campaign_id}
                className={`flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors duration-200 ${
                  index !== allConversations.length - 1 ? 'border-b border-border/30' : ''
                }`}
                onClick={() => handleConversationClick(conversation)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <UserPresenceIndicator
                    userId={conversation.conversation_id || conversation.campaign_id || 'unknown'}
                    userName={conversation.other_participant_name || 'Unknown User'}
                    userEmail={conversation.other_participant_name || 'unknown@example.com'}
                    avatarUrl={conversation.other_participant_avatar || undefined}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium text-sm truncate text-foreground">
                        {conversation.other_participant_name || 'Unknown User'}
                      </h4>
                      {conversation.last_message_at && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground truncate">
                        {conversation.conversation_type === 'campaign' 
                          ? conversation.conversation_title 
                          : 'Direct conversation'}
                      </p>
                      {conversation.conversation_type === 'campaign' && conversation.campaign_status && (
                        <Badge variant="outline" className="text-xs">
                          {conversation.campaign_status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {conversation.unread_count > 0 && (
                    <Badge variant="default" className="text-xs min-w-[20px] h-5 flex items-center justify-center">
                      {conversation.unread_count}
                    </Badge>
                  )}
                  {conversation.conversation_type === 'direct' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => handleArchive(e, conversation.conversation_id)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DirectMessagesList;
