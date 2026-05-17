import React, { useRef, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAddReaction, useRemoveReaction, useMessageReactions } from '@/hooks/useMessageReactions';
import { useAuth } from '@/hooks/useAuth';
import { Smile } from 'lucide-react';

interface ReactionTriggerProps {
  messageId: string;
  isOwnMessage: boolean;
  showBar: boolean;
  onShowBar: (show: boolean) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉'];
const ALL_EMOJIS = ['👍', '❤️', '😊', '😂', '😮', '😢', '🎉', '🔥'];

export const ReactionTrigger: React.FC<ReactionTriggerProps> = ({
  messageId,
  isOwnMessage,
  showBar,
  onShowBar,
}) => {
  const { user } = useAuth();
  const { data: reactions = [] } = useMessageReactions(messageId);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();
  const [showFullPicker, setShowFullPicker] = React.useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const userReactedEmojis = new Set(
    reactions.filter(r => r.user_id === user?.id).map(r => r.emoji)
  );

  useEffect(() => {
    if (!showBar) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onShowBar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBar, onShowBar]);

  const handleEmojiClick = (emoji: string) => {
    if (!user) return;
    if (userReactedEmojis.has(emoji)) {
      removeReaction.mutate({ messageId, emoji });
    } else {
      addReaction.mutate({ messageId, emoji });
    }
    onShowBar(false);
    setShowFullPicker(false);
  };

  return (
    <>
      {/* Hover smiley trigger (desktop only) */}
      <button
        className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-20 ${
          isOwnMessage ? '-left-8' : '-right-8'
        }`}
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
        onClick={() => onShowBar(!showBar)}
        aria-label="React to message"
      >
        <Smile className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Quick-react bar */}
      {showBar && (
        <div
          ref={barRef}
          className={`absolute bottom-full mb-1.5 flex items-center gap-0.5 bg-white rounded-full px-2 py-1.5 z-30 ${
            isOwnMessage ? 'right-0' : 'left-0'
          }`}
          style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-colors hover:bg-muted/60 ${
                userReactedEmojis.has(emoji) ? 'bg-dc-teal/10' : ''
              }`}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* More emojis */}
          <Popover open={showFullPicker} onOpenChange={setShowFullPicker}>
            <PopoverTrigger asChild>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
                aria-label="More emojis"
              >
                +
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2 rounded-xl" align={isOwnMessage ? 'end' : 'start'}>
              <div className="grid grid-cols-4 gap-1">
                {ALL_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg hover:bg-muted/60 transition-colors ${
                      userReactedEmojis.has(emoji) ? 'bg-dc-teal/10' : ''
                    }`}
                    onClick={() => handleEmojiClick(emoji)}
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </>
  );
};
