
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Archive, Search, X, Megaphone } from 'lucide-react';
import { useConversations, useArchiveConversation, Conversation } from '@/hooks/useConversations';
import { useTotalUnreadCount } from '@/hooks/useUnreadCounts';
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
  const totalUnread = useTotalUnreadCount();
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

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border/50">
          <div className="h-6 w-28 bg-dc-teal/10 rounded animate-pulse" />
        </div>
        <div className="flex-1 p-2 space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-2xl">
              <div className="h-12 w-12 bg-dc-teal/10 rounded-full animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-dc-teal/10 rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-dc-teal/10 rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Messages</h2>
          <div className="flex items-center gap-1">
            {totalUnread > 0 && (
              <span className="min-w-[22px] h-[22px] rounded-full bg-dc-teal text-white text-[11px] font-bold flex items-center justify-center px-1.5">
                {totalUnread}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-dc-teal/5"
              onClick={() => setShowSearch(!showSearch)}
              aria-label="Toggle search"
            >
              {showSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {showSearch && (
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mt-3 h-9 text-sm bg-white border-dc-teal/20 rounded-xl focus-visible:ring-dc-teal"
            aria-label="Search conversations"
            name="search"
            autoFocus
          />
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <div className="p-4 bg-dc-teal/5 rounded-2xl w-fit mx-auto mb-3">
              <MessageSquare className="h-6 w-6 text-dc-teal/40" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              {searchQuery ? 'No results' : 'No conversations yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              {searchQuery
                ? 'Try a different search term'
                : 'Start a conversation from a creator\'s profile'}
            </p>
          </div>
        ) : (
          <div className="py-1 px-2">
            {filteredConversations.map((conversation) => {
              const isActive = conversation.conversation_id === activeConversationId;
              const isCampaign = conversation.conversation_type === 'campaign';
              const hasUnread = conversation.unread_count > 0;
              const displayName = conversation.other_participant_name || 'Unknown User';

              return (
                <div
                  key={conversation.conversation_id || conversation.campaign_id}
                  className={`group flex items-center gap-3 px-3 py-3 rounded-2xl cursor-pointer transition-all duration-200 min-w-0 ${
                    isActive
                      ? 'bg-dc-teal/8'
                      : 'hover:bg-dc-teal/5'
                  }`}
                  onClick={() => handleConversationClick(conversation)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleConversationClick(conversation); } }}
                >
                  {/* Avatar with presence */}
                  <div className="relative flex-shrink-0">
                    {conversation.other_participant_avatar ? (
                      <UserPresenceIndicator
                        userId={conversation.conversation_id || conversation.campaign_id || 'unknown'}
                        userName={displayName}
                        userEmail={displayName}
                        avatarUrl={conversation.other_participant_avatar}
                        size="md"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base ${
                        isCampaign
                          ? 'bg-gradient-to-br from-dc-teal to-dc-teal-dark'
                          : 'bg-gradient-to-br from-dc-pink to-dc-pink-accent'
                      }`}>
                        {getInitials(displayName)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-sm truncate ${
                        hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
                      }`}>
                        {displayName}
                      </h4>
                      {conversation.last_message_at && (
                        <span className={`text-[11px] whitespace-nowrap flex-shrink-0 ${
                          hasUnread ? 'text-dc-teal font-medium' : 'text-muted-foreground'
                        }`}>
                          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      {isCampaign && (
                        <Megaphone className="h-3 w-3 text-dc-teal flex-shrink-0" aria-hidden="true" />
                      )}
                      <p className={`text-xs truncate ${
                        hasUnread ? 'text-foreground/60' : 'text-muted-foreground'
                      }`}>
                        {isCampaign
                          ? conversation.conversation_title
                          : 'Direct conversation'}
                      </p>
                    </div>
                  </div>

                  {/* Right side — unread badge + archive */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasUnread && (
                      <span className="min-w-[22px] h-[22px] rounded-full bg-dc-teal text-white text-[11px] font-bold flex items-center justify-center px-1">
                        {conversation.unread_count}
                      </span>
                    )}
                    {!isCampaign && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleArchive(e, conversation.conversation_id)}
                        aria-label="Archive conversation"
                      >
                        <Archive className="h-3.5 w-3.5" />
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
