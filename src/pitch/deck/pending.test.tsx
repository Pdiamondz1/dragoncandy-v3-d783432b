// @vitest-environment jsdom
/**
 * The five founder inputs (spec §8) cannot be invented, so what these tests enforce is
 * that they cannot be *skipped* either.
 *
 * See the header of `pending.ts` for why this deliberately does not fail while the
 * inputs are unanswered: a permanently red test in a repo whose CI gates every unrelated
 * PR stops being a signal and becomes an obstacle, and the thing people route around
 * would be the only guard against an invented number reaching an investor.
 */
import { render, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FOUNDER_INPUTS, OUTSTANDING, isPending, outstandingReport } from './pending';
import { PendingMark } from './components';
import { deck } from '../slides';
import { SlideLiquidity } from '../slides/slides';

afterEach(cleanup);

describe('founder inputs', () => {
  it('derives the outstanding list from the data, so the two cannot drift', () => {
    const unanswered = Object.values(FOUNDER_INPUTS).filter((i) => i.value === null);

    expect(OUTSTANDING.map((i) => i.key)).toEqual(unanswered.map((i) => i.key));
  });

  it('treats only null as unanswered — an empty string is an answer someone typed', () => {
    expect(isPending({ ...FOUNDER_INPUTS.safeTerms, value: null })).toBe(true);
    expect(isPending({ ...FOUNDER_INPUTS.safeTerms, value: '' })).toBe(false);
    expect(isPending({ ...FOUNDER_INPUTS.safeTerms, value: '$1M cap, 20% discount' })).toBe(false);
  });

  it('renders the answer once given, with no further edit to the slide', () => {
    render(<PendingMark input={{ ...FOUNDER_INPUTS.safeTerms, value: '$1M on a $8M cap' }} />);

    expect(screen.getByText('$1M on a $8M cap')).toBeTruthy();
    expect(screen.queryByText(/Founders/)).toBeNull();
  });

  it('marks an unanswered input visibly, carrying the question', () => {
    const { container } = render(<PendingMark input={FOUNDER_INPUTS.safeTerms} />);

    expect(container.querySelector('[data-pending="safeTerms"]')).toBeTruthy();
    expect(container.textContent).toContain(FOUNDER_INPUTS.safeTerms.question);
  });

  /**
   * The label next to a mark is part of the question, and this one got a wrong answer.
   *
   * The liquidity slide read "Restaurants in Hoboken:", which standing beside a liquidity
   * model says *our supply* just as naturally as it says *the town's total* — and the
   * founder answered with ours ("two"). The number wanted is the denominator. Both the
   * slide and the question now say which, and this pins it, because the failure was
   * silent: a plausible answer to the wrong question looks exactly like progress.
   */
  it('asks for the town-wide count, on the slide and in the question', () => {
    const { container } = render(
      <SlideLiquidity index={0} total={deck.length} />,
    );
    const mark = container.querySelector('[data-pending="hobokenRestaurantCount"]');
    expect(mark).toBeTruthy();

    // Read the LABEL, not the slide. The first draft asserted `container.textContent`
    // contained "town-wide" and passed with the old ambiguous label — because the mark
    // renders the question, and the question says "town-wide". A whole-slide text search
    // cannot tell the label apart from the thing standing next to it.
    const label = mark?.parentElement?.querySelector('p');
    expect(label?.textContent).toContain('town-wide');

    expect(FOUNDER_INPUTS.hobokenRestaurantCount.question).toMatch(/IN TOTAL|town-wide/);
  });

  /**
   * The one that matters. Every unanswered input must reach a slide as a mark — an
   * input that is merely absent from the deck is the failure mode this whole file
   * exists to prevent, and it is invisible by construction.
   */
  it('puts every outstanding input on a slide, marked', () => {
    const marks = new Set<string>();
    deck.forEach((slide, index) => {
      const { container } = render(<slide.Component index={index} total={deck.length} />);
      container.querySelectorAll('[data-pending]').forEach((el) => {
        const key = el.getAttribute('data-pending');
        if (key) marks.add(key);
      });
      cleanup();
    });

    expect([...marks].sort()).toEqual(OUTSTANDING.map((i) => i.key).sort());
  });

  it('reports what is outstanding, for the export to print', () => {
    const report = outstandingReport();

    if (OUTSTANDING.length === 0) {
      expect(report).toBe('All founder inputs are filled.');
    } else {
      expect(report).toContain(`${OUTSTANDING.length} founder input`);
      OUTSTANDING.forEach((i) => expect(report).toContain(i.question));
    }
  });
});
