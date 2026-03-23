import { DonnyAvatar } from './DonnyAvatar';
import { DonnyRichCard } from './DonnyRichCard';
import type { DonnyMessage as DonnyMessageType, DonnyAvatarState } from '@/types/donny';

interface DonnyMessageProps {
  message: DonnyMessageType;
  avatarState?: DonnyAvatarState;
  isLatestAssistant?: boolean;
}

export function DonnyMessage({ message, avatarState = 'idle', isLatestAssistant = false }: DonnyMessageProps) {
  if (message.role === 'tool') return null; // Tool messages are internal, not rendered

  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-[#4DD9C0] rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[75%]">
          <p className="text-sm text-white leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-2 items-end">
      <DonnyAvatar
        size="sm"
        state={isLatestAssistant ? avatarState : 'idle'}
      />
      <div className="max-w-[80%]">
        {message.content && (
          <div className="bg-[#F9A8D4] rounded-2xl rounded-bl-sm px-3.5 py-2.5">
            <p className="text-sm text-[#111] leading-relaxed">{message.content}</p>
          </div>
        )}
        {message.rich_card && <DonnyRichCard card={message.rich_card} />}
      </div>
    </div>
  );
}
