import ReactMarkdown from 'react-markdown';

/** Shared prose renderer for internal markdown documents (strategy library, briefings). */
export const MarkdownProse = ({ children }: { children: string }) => (
  <div className="prose prose-sm prose-invert max-w-none prose-headings:text-white prose-p:text-white/70 prose-li:text-white/70 prose-strong:text-white prose-a:text-dc-teal prose-code:text-dc-pink">
    <ReactMarkdown>{children}</ReactMarkdown>
  </div>
);
