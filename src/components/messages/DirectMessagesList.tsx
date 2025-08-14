
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Archive, Search } from 'lucide-react';
import { useConversations, useArchiveConversation } from '@/hooks/useConversations';
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

  const directConversations = conversations.filter(conv => conv.conversation_type === 'direct');

  const handleConversationClick = (conversationId: string) => {
    if (onConversationSelect) {
      onConversationSelect(conversationId);
    } else {
      // Navigate to role-specific direct conversation page
      const userRole = user?.user_metadata?.role || 'business_client';
      const role = userRole === 'content_creator' ? 'creator' : 'business';
      navigate(`/dashboard/${role}/messages/direct/${conversationId}`);
    }
  };

  const handleArchive = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    archiveConversation.mutate(conversationId);
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Direct Messages
          </CardTitle>
          <Button variant="outline" size="sm">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {directConversations.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>No direct conversations yet</p>
            <p className="text-sm">Start a conversation with a creator or business client</p>
          </div>
        ) : (
          <div className="space-y-1">
            {directConversations.map((conversation) => (
              <div
                key={conversation.conversation_id}
                className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                onClick={() => handleConversationClick(conversation.conversation_id)}
              >
                <div className="flex items-center gap-3 flex-1">
                  <UserPresenceIndicator
                    userId={conversation.conversation_id} // This would need to be the actual other user ID
                    userName={conversation.other_participant_name || 'Unknown User'}
                    avatarUrl={conversation.other_participant_avatar || undefined}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm truncate">
                        {conversation.other_participant_name || 'Unknown User'}
                      </h4>
                      {conversation.last_message_at && (
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {conversation.conversation_title || 'Direct conversation'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {conversation.unread_count > 0 && (
                    <Badge variant="default" className="text-xs">
                      {conversation.unread_count}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleArchive(e, conversation.conversation_id)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
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
