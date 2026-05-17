import React from 'react';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { useAuth } from '@/hooks/useAuth';
import { useAddReaction, useRemoveReaction } from '@/hooks/useMessageReactions';

interface FloatingReactionsProps {
  messageId: string;
  isOwnMessage: boolean;
}

export const FloatingReactions: React.FC<FloatingReactionsProps> = ({ messageId, isOwnMessage }) => {
  const { user } = useAuth();
  const { data: reactions = [] } = useMessageReactions(messageId);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();

  const reactionGroups = reactions.reduce((groups, reaction) => {
    if (!groups[reaction.emoji]) {
      groups[reaction.emoji] = { emoji: reaction.emoji, count: 0, hasUserReacted: false };
    }
    groups[reaction.emoji].count++;
    if (reaction.user_id === user?.id) {
      groups[reaction.emoji].hasUserReacted = true;
    }
    return groups;
  }, {} as Record<string, { emoji: string; count: number; hasUserReacted: boolean }>);

  const groupedReactions = Object.values(reactionGroups);
  if (groupedReactions.length === 0) return null;

  const handleToggle = (emoji: string, hasUserReacted: boolean) => {
    if (!user) return;
    if (hasUserReacted) {
      removeReaction.mutate({ messageId, emoji });
    } else {
      addReaction.mutate({ messageId, emoji });
    }
  };

  return (
    <div
      className={`absolute -bottom-2.5 flex gap-1 z-10 ${
        isOwnMessage ? 'left-2' : 'right-2'
      }`}
    >
      {groupedReactions.map((group) => (
        <button
          key={group.emoji}
          onClick={() => handleToggle(group.emoji, group.hasUserReacted)}
          className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs shadow-sm transition-colors cursor-pointer ${
            group.hasUserReacted
              ? 'bg-dc-teal/10 border border-dc-teal/30'
              : 'bg-white border border-transparent'
          }`}
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
          aria-label={`${group.emoji} reaction, ${group.count}`}
        >
          <span className="text-[13px] leading-none">{group.emoji}</span>
          {group.count > 1 && (
            <span className="text-[10px] font-semibold text-foreground/60">{group.count}</span>
          )}
        </button>
      ))}
    </div>
  );
};
