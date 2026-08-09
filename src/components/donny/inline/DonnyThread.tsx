import { RotateCcw } from 'lucide-react';
import { AppCard } from '@/components/app/AppCard';
import { DonnyAvatar } from '@/components/donny/DonnyAvatar';
import { DonnyMarkdown } from '@/components/donny/DonnyMarkdown';
import { DonnyTurn } from './DonnyTurn';
import type { DonnyMessage } from '@/types/donny';

interface DonnyThreadProps {
  messages: DonnyMessage[];
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  onRetry: () => void;
}

// The turn list plus the pending and failure states. Presentational only —
// every input arrives as a prop, so this tests without a provider and Task 7
// is free to wire it to whatever hook shape actually lands.
//
// donny-orchestrator assembles its whole SSE body after the model finishes
// (index.ts:564) — there is no token-by-token reveal here, so the pending
// state is one shimmer covering the entire latency, not a typing indicator.
export function DonnyThread({ messages, isStreaming, streamingContent, error, onRetry }: DonnyThreadProps) {
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  })();

  // Exactly one Retry lives on screen at a time. The error card owns it once
  // there's an error to recover from; mid-stream there's nothing to
  // regenerate yet; otherwise it belongs to the newest Donny turn.
  const turnRetryEnabled = error === null && !isStreaming;

  // A dropped stream must not lose what already arrived — this row shows
  // streamingContent whenever there is any, independent of isStreaming, so
  // an error doesn't wipe partial prose off the page.
  const showStreamingRow = isStreaming || streamingContent.length > 0;

  return (
    <div role="log" aria-live="polite" aria-label="Donny conversation" className="flex flex-col gap-6">
      {messages.map((message, i) => (
        <DonnyTurn
          key={message.id}
          message={message}
          onRetry={turnRetryEnabled && i === lastAssistantIndex ? onRetry : undefined}
        />
      ))}

      {showStreamingRow && (
        <div className="flex gap-3">
          <span data-donny-avatar>
            <DonnyAvatar state={isStreaming ? 'thinking' : 'idle'} size="sm" />
          </span>
          <div className="flex-1 min-w-0">
            {streamingContent ? (
              <DonnyMarkdown content={streamingContent} />
            ) : (
              <div
                data-testid="donny-pending"
                className="h-4 w-2/3 rounded-full bg-dc-teal/10 animate-pulse motion-reduce:animate-none"
              />
            )}
          </div>
        </div>
      )}

      {error && (
        <AppCard variant="inset" className="flex flex-col items-start gap-2">
          <p className="text-sm text-dc-text-muted">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-xs font-medium text-dc-teal-btn hover:text-dc-teal-btn-hover"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </AppCard>
      )}
    </div>
  );
}
