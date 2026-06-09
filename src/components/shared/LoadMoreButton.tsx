// src/components/shared/LoadMoreButton.tsx
import { Button } from '@/components/ui/button';

interface Props {
  hasMore: boolean;
  showing: number;
  total: number;
  onClick: () => void;
  /** Plural noun for the count line, e.g. "campaigns", "posts". */
  noun?: string;
  className?: string;
}

/**
 * Brand pill "Load more" control with a "Showing X of Y" caption.
 * Renders nothing when there's nothing more to load. Works identically on
 * desktop and mobile.
 */
export function LoadMoreButton({ hasMore, showing, total, onClick, noun = 'items', className }: Props) {
  if (!hasMore) return null;
  return (
    <div className={`flex flex-col items-center gap-1.5 pt-2 ${className ?? ''}`}>
      <Button
        variant="outline"
        onClick={onClick}
        className="rounded-full border-dc-teal/40 text-dc-teal-btn hover:bg-dc-teal/10 font-semibold px-6"
      >
        Load more
      </Button>
      <span className="text-xs text-dc-text-muted">
        Showing {showing} of {total} {noun}
      </span>
    </div>
  );
}
