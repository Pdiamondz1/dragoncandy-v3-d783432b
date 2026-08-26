// @vitest-environment jsdom
/**
 * The trajectory slide renders the model's headline numbers, so what these tests guard is
 * mostly what it CALLS them.
 *
 * `rollup()` reports `metroEbitda` — the metros' own profit, before company-level payroll,
 * AI and shared infrastructure. `consolidated()` reports `ebitda`, which is that figure less
 * the shared-cost line. They are not the same quantity and in 2027 they do not share a sign
 * (+$309,478 against -$466,406), so a bar labelled "EBITDA" showing the first one is not a
 * rounding difference, it is a different and much friendlier claim. The public build has only
 * the first, because the second is derived from the confidential pre-seed budget.
 *
 * These tests run in the DEFAULT (public) configuration: vitest shares `vite.config.ts`, so
 * `@pitch/confidential` resolves to the stub and `__PITCH_CONFIDENTIAL__` is `false`. The
 * confidential half of the slide is therefore asserted absent here rather than present; the
 * assertion that it is present is `npm run pitch:verify-public`'s inverse, run by hand
 * against a `VITE_PITCH_CONFIDENTIAL=1` build.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// No `toBeInTheDocument`: `@testing-library/jest-dom` is not registered in
// `vitest.setup.ts`, so its matchers are absent and using one fails with "Invalid Chai
// property" rather than with anything about the slide. `getByText`/`getByTestId` already
// throw when they find nothing, so the query IS the assertion and `toBeTruthy` just
// records that.

import { SlideTrajectory } from './slides';
import { moneyShort } from '../deck/format';
import { rollup } from '../model/rollup';
import { consolidated } from '../model/consolidated';

afterEach(cleanup);

const renderSlide = () => render(<SlideTrajectory index={11} total={15} />);

describe('the trajectory slide', () => {
  it('labels the three calendar years rather than Y1/Y2/Y3', () => {
    renderSlide();
    for (const year of ['2026', '2027', '2028']) {
      // getAllByText, not getByText: 2028 appears twice — as a bar label and inside the
      // cross-check sentence — and getByText throws on more than one match.
      expect(screen.getAllByText(new RegExp(year)).length).toBeGreaterThan(0);
    }
  });

  it('shows how many metros are live', () => {
    renderSlide();
    const live = rollup()[2].metrosLive;
    expect(screen.getAllByText(new RegExp(`${live}\\s*metro`, 'i')).length).toBeGreaterThan(0);
  });

  // Spec section 10: the slide must not present the bottom-up build as if it agreed with
  // the top-down band it replaced.
  it('names the top-down band as a cross-check', () => {
    renderSlide();
    expect(screen.getByText(/cross-check|top-down/i)).toBeTruthy();
  });

  it('prints each year row from the rollup', () => {
    renderSlide();
    for (const y of rollup()) {
      const row = screen.getByTestId(`trajectory-row-${y.year}`);
      expect(row.textContent).toContain(moneyShort(y.revenue));
      expect(row.textContent).toContain(moneyShort(y.metroEbitda));
    }
  });

  it('calls the metro figure metro contribution, never EBITDA', () => {
    renderSlide();
    for (const y of rollup()) {
      const text = screen.getByTestId(`trajectory-row-${y.year}`).textContent ?? '';
      expect(text).toMatch(/metro contribution/i);
      expect(text).not.toMatch(/EBITDA/i);
    }
  });

  /**
   * The control that makes the test above mean something: metro contribution and company
   * EBITDA are numerically different in every modeled year, so if the row ever started
   * showing the consolidated figure this fails rather than passing on a coincidence.
   */
  it('does not put the consolidated EBITDA figure in a year row', () => {
    renderSlide();
    for (const y of consolidated()) {
      const text = screen.getByTestId(`trajectory-row-${y.year}`).textContent ?? '';
      expect(moneyShort(y.ebitda)).not.toBe(moneyShort(y.metroEbitda));
      expect(text).not.toContain(moneyShort(y.ebitda));
    }
  });

  /**
   * The slide says in prose that the company's own line "stays negative through 2027" — a
   * claim the public build cannot compute, because consolidated EBITDA comes from the
   * confidential budget. So it is pinned here instead, against the real model. If the model
   * ever turns 2027 positive, this fails rather than letting the sentence quietly go stale
   * and understate the business to an investor.
   */
  it('backs the prose claim that the company line is negative through 2027', () => {
    const byYear = new Map(consolidated().map((y) => [y.year, y.ebitda]));
    expect(byYear.get(2026)).toBeLessThan(0);
    expect(byYear.get(2027)).toBeLessThan(0);
    expect(byYear.get(2028)).toBeGreaterThan(0);
  });

  it('omits the company EBITDA line entirely from a public build', () => {
    renderSlide();
    expect(screen.queryByTestId('trajectory-consolidated')).toBeNull();
  });

  // Every other slide carries a provenance tag; this is the one rendering the model's
  // headline numbers, so it is the last place to drop one.
  it('carries a provenance tag and a source note', () => {
    renderSlide();
    expect(screen.getByText('MODELED')).toBeTruthy();
    // The source note, not the body paragraph: both mention Census, so the match is
    // narrowed to a phrase only the footer carries.
    expect(screen.getByText(/read from the model at render time/i)).toBeTruthy();
  });
});
