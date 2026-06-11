import ReactMarkdown from 'react-markdown';

/** Shared prose renderer for internal markdown documents (strategy library, briefings). */
export const MarkdownProse = ({ children }: { children: string }) => (
  <div className="prose prose-sm max-w-none prose-headings:text-dc-text prose-p:text-dc-text-muted prose-li:text-dc-text-muted prose-strong:text-dc-text">
    <ReactMarkdown>{children}</ReactMarkdown>
  </div>
);
