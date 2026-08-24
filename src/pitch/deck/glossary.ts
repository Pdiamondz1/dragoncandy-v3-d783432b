/**
 * The glossary, and the rule it exists to enforce (spec §7).
 *
 * Joe must be able to present this deck cold, to an investor who will ask about CAC
 * and EBITDA by name. Banning the terms is the wrong fix — Adrian asked for them and
 * investors expect them. The rule is narrower and testable:
 *
 *   **a term may not appear on a slide without its plain-English gloss on that same
 *   slide.**
 *
 * Not one slide earlier, not in a footnote, not in the speaker notes. On the slide the
 * investor is looking at while they ask, so the answer is already on screen.
 *
 * `glossaryTest` in `slides.glossary.test.tsx` renders every slide and enforces it. The
 * practical way to satisfy it is the `<Gloss>` component, which emits the term and the
 * gloss together and therefore cannot be got wrong; writing the pair by hand is allowed
 * and equally checked.
 */

export interface GlossaryEntry {
  /** The jargon, exactly as it appears on a slide. */
  readonly term: string;
  /** The plain-English gloss `<Gloss>` renders, and the test looks for. */
  readonly gloss: string;
  /**
   * Extra spellings that count as the same term. `CAC` and `customer acquisition cost`
   * are the same jargon and both need the gloss.
   */
  readonly aliases?: readonly string[];
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'CAC',
    gloss: 'what it costs us to win one customer',
    aliases: ['customer acquisition cost'],
  },
  {
    term: 'LTV',
    gloss: 'what one customer is worth over their whole life with us',
    aliases: ['lifetime value'],
  },
  {
    term: 'EBITDA',
    gloss: 'profit before interest, tax and accounting write-downs',
  },
  {
    term: 'GMV',
    gloss: 'the total value of campaigns run through us, most of which goes to creators',
    aliases: ['gross merchandise value'],
  },
  {
    term: 'gross margin',
    gloss: 'what is left of revenue after the direct cost of delivering it',
  },
  {
    term: 'take rate',
    gloss: 'our cut of each campaign',
  },
  {
    term: 'payback',
    gloss: 'how many months until a customer has repaid what we spent winning them',
  },
  {
    term: 'SAFE',
    gloss: 'a standard pre-seed instrument that converts to equity at the next priced round',
  },
  {
    term: 'valuation cap',
    gloss: 'the ceiling price this money converts at later',
  },
  {
    term: 'MFN',
    gloss: 'if a later investor gets better terms, this one gets them too',
    aliases: ['most favoured nation', 'most favored nation'],
  },
  {
    term: 'churn',
    gloss: 'the share of customers who leave each month',
  },
  {
    term: 'liquidity',
    gloss: 'enough of both sides that neither is left waiting',
  },
  {
    term: 'LoRA',
    gloss: 'a cheap way to specialise an existing AI model rather than train a new one',
  },
  {
    term: 'ARR',
    gloss: 'revenue restated as a yearly run rate',
    aliases: ['annual recurring revenue'],
  },
];

const byTerm = new Map(GLOSSARY.map((e) => [e.term.toLowerCase(), e]));

export function lookup(term: string): GlossaryEntry | undefined {
  return byTerm.get(term.toLowerCase());
}

/** Every spelling that triggers the rule, for one entry. */
export function spellings(entry: GlossaryEntry): readonly string[] {
  return [entry.term, ...(entry.aliases ?? [])];
}

/**
 * Does `text` contain this spelling as a whole word?
 *
 * Word-bounded on purpose. `CAC` must not match inside "cache", and `SAFE` must not
 * match inside "safety" — a substring match would report a gloss as missing on a slide
 * that never used the jargon, and the fix for a false positive is usually to weaken
 * the test.
 */
export function mentions(text: string, spelling: string): boolean {
  const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \b is wrong at a boundary next to a non-word char, so bound on lookaround instead.
  return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`, 'i').test(text);
}
