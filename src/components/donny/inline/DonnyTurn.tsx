import { useNavigate } from 'react-router-dom';
import { Copy, RotateCcw } from 'lucide-react';
import { DonnyAvatar } from '@/components/donny/DonnyAvatar';
import { DonnyMarkdown } from '@/components/donny/DonnyMarkdown';
import { DonnyRichCard } from '@/components/donny/DonnyRichCard';
import { isKnownDonnyRoute } from '@/lib/donnyRoutes';
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
  const navigate = useNavigate();

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

  // Donny's suggested next steps. The orchestrator emits these to satisfy the
  // "Never end on a dead end" contract, so dropping them inline would silently
  // undo that. Same guard as DonnyMessage.tsx (the panel's renderer): a message
  // persisted before the server-side route fix can carry an invented route that
  // would 404, so validate before rendering the pill and again on click.
  //
  // Navigate-only by design. useDonny maps the orchestrator's
  // `suggested_actions` to `action: 'navigate'` exclusively, and the panel's
  // 'dismiss' branch has no inline analogue (there is no overlay to close), so
  // any other action is dropped rather than rendered as a button that does
  // nothing.
  const quickActions = (message.quick_actions ?? []).filter(
    (a) => a.action === 'navigate' && !!a.url && isKnownDonnyRoute(a.url)
  );

  return (
    <div data-turn="assistant" className="group flex gap-3">
      <span data-donny-avatar>
        <DonnyAvatar state="idle" size="sm" />
      </span>
      <div className="flex-1 min-w-0">
        {message.content && <DonnyMarkdown content={message.content} />}
        {/* Legacy fallback ONLY — do not delete as dead code. The singular
            `rich_card` is written solely by supabase/functions/donny-chat
            (internal Donny); this consumer path (donny-orchestrator +
            useDonny) writes the plural `rich_cards`. Ordered as
            DonnyMessage.tsx orders them, so the two renderers agree. */}
        {message.rich_card && <DonnyRichCard card={message.rich_card} />}
        {message.rich_cards && message.rich_cards.length > 0 && (
          <div className="space-y-1.5 mt-1.5">
            {message.rich_cards.map((card, i) => (
              <DonnyRichCard key={i} card={card} />
            ))}
          </div>
        )}
        {quickActions.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2">
            {quickActions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (!action.url || !isKnownDonnyRoute(action.url)) return;
                  navigate(action.url);
                }}
                className="bg-dc-teal-btn text-white text-xs font-semibold px-4 py-2 rounded-full"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        {/* Visible by default, hover-revealed only from lg: up. Touch has no
            hover and focus-within needs a keyboard, so an unconditional
            opacity-0 left these permanently invisible on a phone while staying
            hit-testable — tappable by accident, never readable. */}
        <div className="flex items-center gap-3 mt-1.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
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
