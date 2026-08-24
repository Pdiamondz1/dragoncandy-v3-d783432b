// @vitest-environment jsdom
/**
 * Spec §7, enforced: a glossary term may not appear on a slide without its
 * plain-English gloss on that same slide.
 *
 * Renders each slide and reads the resulting text, rather than grepping the source.
 * Grepping would miss every term that arrives through the model — a label read from
 * `assumptions.ts`, a bucket name from `confidential.ts` — and those are exactly the
 * strings nobody remembers to gloss.
 */
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { deck } from './index';
import { GLOSSARY, mentions, spellings } from '../deck/glossary';

afterEach(cleanup);

function textOf(slide: (typeof deck)[number], index: number): string {
  const { container } = render(<slide.Component index={index} total={deck.length} />);
  return container.textContent ?? '';
}

describe('glossary', () => {
  it.each(deck.map((s, i) => [s.id, s, i] as const))(
    'slide %s glosses every jargon term it uses',
    (_id, slide, index) => {
      const text = textOf(slide, index);

      const unglossed = GLOSSARY.filter(
        (entry) => spellings(entry).some((s) => mentions(text, s)) && !text.includes(entry.gloss),
      ).map((entry) => entry.term);

      expect(unglossed).toEqual([]);
    },
  );

  /**
   * The control. Without it, the test above passes just as happily on a deck where no
   * slide uses any jargon at all — including a deck that failed to render.
   */
  it('is actually exercised — the deck does use glossary terms', () => {
    const allText = deck.map((s, i) => textOf(s, i)).join(' ');
    const used = GLOSSARY.filter((entry) => spellings(entry).some((s) => mentions(allText, s)));

    expect(used.length).toBeGreaterThanOrEqual(5);
  });

  /**
   * And the inverse control: a slide-shaped string that uses a term without its gloss
   * must be caught. If this stops failing, the matcher above has been weakened.
   */
  it('catches an unglossed term', () => {
    const text = 'Our CAC is under control and payback is quick.';
    const unglossed = GLOSSARY.filter(
      (entry) => spellings(entry).some((s) => mentions(text, s)) && !text.includes(entry.gloss),
    ).map((entry) => entry.term);

    expect(unglossed).toContain('CAC');
    expect(unglossed).toContain('payback');
  });

  it('does not fire on a word that merely contains a term', () => {
    // "cache" contains CAC; "safety" contains SAFE. Substring matching would report both.
    const text = 'The cache is warm and the safety rails hold.';
    const unglossed = GLOSSARY.filter(
      (entry) => spellings(entry).some((s) => mentions(text, s)) && !text.includes(entry.gloss),
    );

    expect(unglossed).toEqual([]);
  });
});
