import { Copy, RotateCcw } from 'lucide-react';
import { DonnyAvatar } from '@/components/donny/DonnyAvatar';
import { DonnyMarkdown } from '@/components/donny/DonnyMarkdown';
import { DonnyRichCard } from '@/components/donny/DonnyRichCard';
import type { DonnyMessage } from '@/types/donny';

interface DonnyTurnProps {
  message: DonnyMessage;
  onRetry?: () => void; // rendered only when provided — newest Donny turn only
}

// One turn of the inline canvas thread. The whole visual thesis lives here:
// the user gets a bubble, Donny does not. Donny keeps his avatar (founder
// decision) and his prose sits flat on the page — that asymmetry is what
// keeps this reading as a document instead of a texting app.
export function DonnyTurn({ message, onRetry }: DonnyTurnProps) {
  if (message.role === 'tool') return null; // internal, never rendered

  const handleCopy = () => {
    if (!message.content) return;
    navigator.clipboard?.writeText(message.content).catch((err) => {
      console.error('Failed to copy Donny turn', err);
    });
  };

  if (message.role === 'user') {
    return (
      <div data-turn="user" className="flex justify-end">
        <div
          data-bubble="true"
          className="bg-dc-teal/[0.06] text-dc-text rounded-2xl px-4 py-2 max-w-[80%]"
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div data-turn="assistant" className="group flex gap-3">
      <span data-donny-avatar>
        <DonnyAvatar state="idle" size="sm" />
      </span>
      <div className="flex-1 min-w-0">
        {message.content && <DonnyMarkdown content={message.content} />}
        {message.rich_cards && message.rich_cards.length > 0 && (
          <div className="space-y-1.5 mt-1.5">
            {message.rich_cards.map((card, i) => (
              <DonnyRichCard key={i} card={card} />
            ))}
          </div>
        )}
        {message.rich_card && <DonnyRichCard card={message.rich_card} />}
        <div className="flex items-center gap-3 mt-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-xs font-medium text-dc-text-muted hover:text-dc-teal-btn"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-xs font-medium text-dc-text-muted hover:text-dc-teal-btn"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
