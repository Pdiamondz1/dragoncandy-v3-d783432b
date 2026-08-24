/**
 * Deck primitives that carry a rule with them.
 *
 * Each of these exists because a slide could otherwise break one of the spec's
 * promises silently: an unglossed term (§7), an untagged number (§3.1), or an
 * invented answer to a founder question (§8). Using the component makes the promise
 * structural instead of a thing to remember.
 */
import type { ReactNode } from 'react';
import { lookup } from './glossary';
import { isPending, type FounderInput } from './pending';
import type { Provenance } from '../model/types';

/**
 * A jargon term with its plain-English gloss, rendered together.
 *
 * `<Gloss t="CAC" />` → `CAC (what it costs us to win one customer)`.
 *
 * Throws on an unknown term rather than rendering it bare. A typo would otherwise
 * produce a slide that shows the jargon, satisfies nothing, and passes the glossary
 * test — which only checks terms it knows about.
 */
export function Gloss({ t, className = '' }: { t: string; className?: string }) {
  const entry = lookup(t);
  if (!entry) {
    throw new Error(
      `Gloss: "${t}" is not in the glossary. Add it to src/pitch/deck/glossary.ts, or the term ships unglossed.`,
    );
  }
  return (
    <span className={className}>
      {entry.term}{' '}
      <span className="font-normal opacity-70">({entry.gloss})</span>
    </span>
  );
}

const PROVENANCE_STYLE: Record<Provenance, string> = {
  MEASURED: 'bg-dc-teal/15 text-dc-teal-btn',
  BENCHMARKED: 'bg-amber-400/20 text-amber-700',
  MODELED: 'bg-dc-pink-accent/15 text-dc-pink-accent-btn',
};

const PROVENANCE_STYLE_DARK: Record<Provenance, string> = {
  MEASURED: 'bg-dc-teal/20 text-dc-teal',
  BENCHMARKED: 'bg-amber-400/20 text-amber-300',
  MODELED: 'bg-dc-pink-accent/20 text-dc-pink',
};

/**
 * The provenance tag. Spec §3.1: every number carries one, and no modeled figure
 * appears without its inputs visible on the same slide.
 *
 * Most of this deck reads MODELED, and that is the honest state of a company with
 * zero paying customers — the tag makes it visible rather than letting a confident
 * layout imply otherwise.
 */
export function Tag({ p, dark = false }: { p: Provenance; dark?: boolean }) {
  const style = dark ? PROVENANCE_STYLE_DARK[p] : PROVENANCE_STYLE[p];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] ${style}`}
    >
      {p}
    </span>
  );
}

/**
 * A founder input: the answer if we have it, a visibly marked hole if we do not.
 *
 * There is deliberately no third branch. A slide cannot quietly omit an unanswered
 * question, because the only way to put one on a slide is through here.
 */
export function PendingMark({
  input,
  dark = false,
  className = '',
}: {
  input: FounderInput;
  dark?: boolean;
  className?: string;
}) {
  if (!isPending(input)) {
    return <span className={className}>{input.value}</span>;
  }
  return (
    <span
      data-pending={input.key}
      className={`inline-flex items-baseline gap-2 rounded-lg border-2 border-dashed px-3 py-1 ${
        dark ? 'border-amber-300/70 text-amber-200' : 'border-amber-500/70 text-amber-700'
      } ${className}`}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Founders</span>
      <span className="text-base font-semibold">{input.question}</span>
    </span>
  );
}

/** Where a number came from, in the small print under it. */
export function Source({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={`text-[12px] leading-snug ${dark ? 'text-white/45' : 'text-dc-text-muted/80'}`}>
      {children}
    </p>
  );
}
