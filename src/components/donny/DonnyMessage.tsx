import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { DonnyAvatar } from './DonnyAvatar';
import { DonnyRichCard } from './DonnyRichCard';
import { formatBubbleTime } from './donnyTime';
import { parseAndDispatchDeepLink } from '@/features/donny/deepLinks';
import { safeUrl } from '@/lib/safeUrl';
import { isKnownDonnyRoute } from '@/lib/donnyRoutes';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import type { DonnyMessage as DonnyMessageType, DonnyAvatarState } from '@/types/donny';

interface DonnyMessageProps {
  message: DonnyMessageType;
  avatarState?: DonnyAvatarState;
  isLatestAssistant?: boolean;
}

export function DonnyMessage({ message, avatarState = 'idle', isLatestAssistant = false }: DonnyMessageProps) {
  const navigate = useNavigate();
  const { close } = useDonnyContext();
  const [dismissedActions, setDismissedActions] = useState(false);

  if (message.role === 'tool') return null; // Tool messages are internal, not rendered

  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-dc-teal rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[75%]">
          <p className="text-sm text-white leading-relaxed">{message.content}</p>
          <span className="block text-right text-[10px] text-white/60 mt-0.5">
            {formatBubbleTime(message.created_at)}
          </span>
        </div>
      </div>
    );
  }

  // Only show navigate actions that point at a real in-app route — an unknown
  // route (from a message persisted before the server-side fix) would 404.
  const visibleQuickActions = (message.quick_actions ?? []).filter(
    (a) => a.action !== 'navigate' || (!!a.url && isKnownDonnyRoute(a.url))
  );

  // Assistant message
  return (
    <div className="flex gap-2 items-end">
      <DonnyAvatar
        size="sm"
        state={isLatestAssistant ? avatarState : 'idle'}
      />
      <div className="max-w-[80%]">
        {message.content && (
          <div className="bg-dc-pink rounded-2xl rounded-bl-sm px-3.5 py-2.5">
            <div className="donny-markdown text-sm text-dc-text leading-relaxed">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h3 className="font-bold text-base mt-2 mb-1">{children}</h3>,
                  h2: ({ children }) => <h4 className="font-bold text-sm mt-2 mb-1">{children}</h4>,
                  h3: ({ children }) => <h5 className="font-semibold text-sm mt-1.5 mb-0.5">{children}</h5>,
                  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  a: ({ href, children }) => {
                    // Intercept help brief links to open in drawer
                    const helpMatch = href?.match(/\/help\/promotions\/([a-z0-9-]+)/);
                    if (helpMatch) {
                      return (
                        <button
                          type="button"
                          onClick={() => parseAndDispatchDeepLink(`open help: ${helpMatch[1]}`)}
                          className="text-dc-pink-accent underline underline-offset-2 cursor-pointer"
                        >
                          {children}
                        </button>
                      );
                    }
                    return (
                      <a href={safeUrl(href) ?? '#'} target="_blank" rel="noopener noreferrer" className="text-dc-pink-accent underline underline-offset-2">
                        {children}
                      </a>
                    );
                  },
                  code: ({ children }) => (
                    <code className="bg-black/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
                  ),
                  hr: () => <hr className="border-black/20 my-2" />,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
            <span className="block text-[10px] text-dc-text/50 mt-0.5">
              {formatBubbleTime(message.created_at)}
            </span>
          </div>
        )}
        {message.rich_card && <DonnyRichCard card={message.rich_card} />}
        {visibleQuickActions.length > 0 && !dismissedActions && (
          <div className="flex gap-2 flex-wrap mt-2">
            {visibleQuickActions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (action.action === 'navigate' && action.url) {
                    // Guard again at click time — never navigate to an unknown route.
                    if (!isKnownDonnyRoute(action.url)) return;
                    // On mobile the chat sheet is a fullscreen overlay — close it
                    // so the destination page is actually visible. The desktop
                    // panel is docked beside the content, so it stays open.
                    if (window.matchMedia('(max-width: 767px)').matches) close();
                    navigate(action.url);
                  } else if (action.action === 'dismiss') {
                    setDismissedActions(true);
                  }
                }}
                className={
                  action.action === 'navigate'
                    ? 'bg-dc-teal-btn text-white text-xs font-semibold px-4 py-2 rounded-full'
                    : 'bg-white text-dc-pink-accent border border-gray-200 text-xs font-semibold px-4 py-2 rounded-full'
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
