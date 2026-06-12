import React, { Children } from 'react';

interface NeedsAttentionSectionProps {
  children: React.ReactNode;
}

/**
 * Consolidates what used to be a pile of separate banners (pending actions,
 * rating prompts, setup alerts) into one quiet framed list.
 *
 * Children keep their own logic and may render null when they have nothing
 * to show — each child is wrapped in a slot div, and the whole section hides
 * itself via CSS :has() when every slot is empty. Dividers are drawn only
 * between non-empty slots.
 */
export function NeedsAttentionSection({ children }: NeedsAttentionSectionProps) {
  return (
    <section className="hidden [&:has([data-attention-slot]:not(:empty))]:block">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-3.5 w-1 rounded-full bg-dc-pink" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-dc-text">Needs your attention</h2>
      </div>
      <div className="rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm overflow-hidden [&>div:not(:empty)~div:not(:empty)]:border-t [&>div]:border-dc-teal/10">
        {Children.map(children, (child) =>
          child == null || child === false ? null : <div data-attention-slot>{child}</div>
        )}
      </div>
    </section>
  );
}
