import ReactMarkdown from 'react-markdown';
import { parseAndDispatchDeepLink } from '@/features/donny/deepLinks';
import { safeUrl } from '@/lib/safeUrl';

interface DonnyMarkdownProps {
  content: string;
}

/**
 * Donny's shared markdown prose renderer. Depends only on `content` — no
 * stage, no panel context, no close/navigate side effects — so it is used
 * verbatim by both the side-panel bubble (DonnyMessage) and the inline
 * canvas turn (DonnyTurn) rather than being duplicated between them. The
 * bubble chrome and timestamp around it are panel-specific and stay with
 * each caller.
 */
export function DonnyMarkdown({ content }: DonnyMarkdownProps) {
  return (
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
