import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile, Plus } from 'lucide-react';
import { useMessageReactions, useAddReaction, useRemoveReaction } from '@/hooks/useMessageReactions';
import { useAuth } from '@/hooks/useAuth';

interface MessageReactionsProps {
  messageId: string;
}

const COMMON_EMOJIS = ['👍', '❤️', '😊', '😂', '😮', '😢', '🎉', '🔥'];

const MessageReactions: React.FC<MessageReactionsProps> = ({ messageId }) => {
  const { user } = useAuth();
  const { data: reactions = [] } = useMessageReactions(messageId);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Group reactions by emoji
  const reactionGroups = reactions.reduce((groups, reaction) => {
    if (!groups[reaction.emoji]) {
      groups[reaction.emoji] = {
        emoji: reaction.emoji,
        count: 0,
        users: [],
        hasUserReacted: false,
      };
    }
    groups[reaction.emoji].count++;
    groups[reaction.emoji].users.push(reaction.user_id);
    if (reaction.user_id === user?.id) {
      groups[reaction.emoji].hasUserReacted = true;
    }
    return groups;
  }, {} as Record<string, { emoji: string; count: number; users: string[]; hasUserReacted: boolean }>);

  const handleEmojiClick = (emoji: string) => {
    if (!user) return;

    const group = reactionGroups[emoji];
    if (group?.hasUserReacted) {
      removeReaction.mutate({ messageId, emoji });
    } else {
      addReaction.mutate({ messageId, emoji });
    }
    setShowEmojiPicker(false);
  };

  return (
    <div className="flex items-center gap-1 mt-1">
      {/* Existing reactions */}
      {Object.values(reactionGroups).map((group) => (
        <Button
          key={group.emoji}
          variant={group.hasUserReacted ? "default" : "outline"}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => handleEmojiClick(group.emoji)}
        >
          <span className="mr-1">{group.emoji}</span>
          <span>{group.count}</span>
        </Button>
      ))}

      {/* Add reaction button */}
      <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <Plus className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-4 gap-1">
            {COMMON_EMOJIS.map((emoji) => (
              <Button
                key={emoji}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-lg"
                onClick={() => handleEmojiClick(emoji)}
              >
                {emoji}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default MessageReactions;
