// The conversation itself — messages, day dividers, the streaming bubble and
// the error/retry row. Extracted from DonnyChatView so the panel and the
// business dashboard render ONE implementation instead of two that drift.
//
// Deliberately owns no scroll container, no header and no input. Those differ
// per surface and are the parent's job: the panel is a fixed-height flex column
// that scrolls itself, while the dashboard wraps this in DonnyThreadRegion,
// which supplies its own bounded scroller and a scroll-to-bottom control. A
// component that assumed either one could not be shared.
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { DonnyMessage } from './DonnyMessage';
import { DonnyDateDivider } from './DonnyDateDivider';
import { startsNewDayGroup } from './donnyTime';
import { DonnyTypingIndicator } from './DonnyTypingIndicator';
import { DonnyAvatar } from './DonnyAvatar';
import { WebOnly } from '@/components/platform/WebOnly';
import { billingRoute } from '@/lib/donnyRoutes';
import type { DonnyMessage as DonnyMessageType, DonnyAvatarState } from '@/types/donny';
import type { UserRole } from '@/types/user';

interface DonnyThreadProps {
  messages: DonnyMessageType[];
  avatarState: DonnyAvatarState;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  retry: () => void;
  userRole: UserRole;
}

/** Index of the last assistant message, or -1. */
function lastAssistantIndex(messages: DonnyMessageType[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return i;
  }
  return -1;
}

export function DonnyThread({
  messages,
  avatarState,
  isStreaming,
  streamingContent,
  error,
  retry,
  userRole,
}: DonnyThreadProps) {
  const latestAssistant = lastAssistantIndex(messages);

  return (
    <>
      {messages.map((msg, i) => (
        <Fragment key={msg.id ?? i}>
          {startsNewDayGroup(messages, i) && <DonnyDateDivider iso={msg.created_at} />}
          <DonnyMessage
            message={msg}
            avatarState={avatarState}
            isLatestAssistant={i === latestAssistant}
          />
        </Fragment>
      ))}

      {isStreaming && !streamingContent && <DonnyTypingIndicator />}
      {isStreaming && streamingContent && (
        <div className="flex gap-2 items-end">
          <DonnyAvatar size="sm" state="thinking" />
          <div className="max-w-[80%]">
            <div className="bg-dc-pink rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              {/* Plain text while streaming, on purpose: partial markdown
                  re-parsed on every token flickers (a half-typed `**` is not
                  bold yet). The finished message renders through DonnyMessage. */}
              <p className="donny-markdown text-sm text-dc-text leading-relaxed whitespace-pre-wrap">
                {streamingContent}
                <span className="inline-block w-1.5 h-4 bg-dc-text/40 animate-pulse ml-0.5 align-text-bottom" />
              </p>
            </div>
          </div>
        </div>
      )}

      {error && !isStreaming && (
        <div className="mx-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">{error}</p>
          <div className="flex gap-2 mt-1.5">
            {error.includes('Upgrade') && (
              <WebOnly>
                <Link to={billingRoute(userRole)} className="text-xs text-dc-teal font-semibold">
                  Upgrade Plan
                </Link>
              </WebOnly>
            )}
            {!error.includes('Upgrade') && (
              <button type="button" onClick={retry} className="text-xs text-dc-teal font-semibold">
                Try Again
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
