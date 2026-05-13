
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MessageSquare, Archive, Search, X, Megaphone } from 'lucide-react';
import { useConversations, useArchiveConversation, Conversation } from '@/hooks/useConversations';
import { UserPresenceIndicator } from './UserPresenceIndicator';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

interface DirectMessagesListProps {
  onConversationSelect?: (conversationId: string) => void;
  onCampaignNavigate?: (campaignId: string) => void;
  activeConversationId?: string | null;
}

export const DirectMessagesList: React.FC<DirectMessagesListProps> = ({
  onConversationSelect,
  onCampaignNavigate,
  activeConversationId,
}) => {
  const navigate = useNavigate();
  const { user, activeOrgUnit } = useAuth();
  const { data: conversations = [], isLoading } = useConversations(activeOrgUnit?.id);
  const archiveConversation = useArchiveConversation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const filteredConversations = searchQuery.trim()
    ? conversations.filter(c =>
        (c.other_participant_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.conversation_title || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const handleConversationClick = (conversation: Conversation) => {
    if (conversation.conversation_type === 'campaign' && conversation.campaign_id) {
      if (onCampaignNavigate) {
        onCampaignNavigate(conversation.campaign_id);
      } else {
        const userRole = user?.user_metadata?.role || 'business_client';
        const role = userRole === 'content_creator' ? 'creator' : userRole === 'brand' ? 'brand' : 'business';
        navigate(`/dashboard/${role}/messages/campaign/${conversation.campaign_id}`);
      }
    } else if (conversation.conversation_id) {
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
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border/50">
          <div className="h-5 w-32 bg-muted rounded animate-pulse" />
        </div>
        <div className="flex-1 p-3 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <div className="h-10 w-10 bg-muted rounded-full animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-muted rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Header with search */}
      <div className="p-4 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            Messages
            {conversations.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 h-5">
                {conversations.length}
              </Badge>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setShowSearch(!showSearch)}
            aria-label="Toggle search"
          >
            {showSearch ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {showSearch && (
          <Input
            placeholder="Search conversations…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm bg-muted/50 border-border/50"
            aria-label="Search conversations"
            name="search"
          />
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {filteredConversations.length === 0 ? (
          <div className="p-6 text-center">
            <div className="p-4 bg-muted/30 rounded-2xl w-fit mx-auto mb-3">
              <MessageSquare className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              {searchQuery ? 'No results' : 'No conversations yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              {searchQuery
                ? 'Try a different search term'
                : 'Start a conversation to see it here'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {filteredConversations.map((conversation) => {
              const isActive = conversation.conversation_id === activeConversationId;
              const isCampaign = conversation.conversation_type === 'campaign';

              return (
                <div
                  key={conversation.conversation_id || conversation.campaign_id}
                  className={`group flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-colors duration-200 min-w-0 overflow-hidden ${
                    isActive
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-muted/60 border border-transparent'
                  }`}
                  onClick={() => handleConversationClick(conversation)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleConversationClick(conversation); } }}
                >
                  <div className="flex-shrink-0">
                    <UserPresenceIndicator
                      userId={conversation.conversation_id || conversation.campaign_id || 'unknown'}
                      userName={conversation.other_participant_name || 'Unknown User'}
                      userEmail={conversation.other_participant_name || 'unknown@example.com'}
                      avatarUrl={conversation.other_participant_avatar || undefined}
                      size="md"
                    />
                  </div>

                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-sm font-medium truncate ${
                        isActive ? 'text-primary' : 'text-foreground'
                      }`}>
                        {conversation.other_participant_name || 'Unknown User'}
                      </h4>
                      {conversation.last_message_at && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      {isCampaign && (
                        <Megaphone className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                      )}
                      <p className="text-xs text-muted-foreground truncate">
                        {isCampaign
                          ? conversation.conversation_title
                          : 'Direct conversation'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {conversation.unread_count > 0 && (
                      <Badge className="bg-primary text-primary-foreground text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                        {conversation.unread_count}
                      </Badge>
                    )}
                    {isCampaign && conversation.campaign_status && (
                      <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 hidden group-hover:flex">
                        {conversation.campaign_status}
                      </Badge>
                    )}
                    {!isCampaign && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleArchive(e, conversation.conversation_id)}
                        aria-label="Archive conversation"
                      >
                        <Archive className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

