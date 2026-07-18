import React, { Children } from 'react';
import { SectionHeader } from './SectionHeader';
import { AppCard } from '@/components/app/AppCard';

interface NeedsAttentionSectionProps {
  /**
   * Each child MUST render null — not an empty element or a skeleton — when
   * it has nothing to show. Children are wrapped in slot divs and the whole
   * section hides itself via CSS :has() when every slot is :empty; a child
   * that renders an empty container resurrects the header with a blank frame.
   */
  children: React.ReactNode;
}

/**
 * Consolidates what used to be a pile of separate banners (pending actions,
 * rating prompts, setup alerts) into one quiet framed list. Dividers are
 * drawn only between non-empty slots.
 */
export function NeedsAttentionSection({ children }: NeedsAttentionSectionProps) {
  return (
    <section className="hidden [&:has([data-attention-slot]:not(:empty))]:block">
      <SectionHeader title="Needs your attention" />
      <AppCard className="p-0 overflow-hidden [&>div:not(:empty)~div:not(:empty)]:border-t [&>div]:border-dc-teal/10">
        {Children.map(children, (child) =>
          child == null || child === false ? null : <div data-attention-slot>{child}</div>
        )}
      </AppCard>
    </section>
  );
}
