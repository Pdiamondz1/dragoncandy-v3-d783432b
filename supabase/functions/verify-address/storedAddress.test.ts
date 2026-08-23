import { describe, it, expect } from 'vitest';
import { planCreatorVerification, planBusinessVerification } from './storedAddress';

/**
 * These tests exist to pin the two silent-failure regressions that made this module
 * necessary, plus the missing-row case. Each is written so that it FAILS against the
 * broken shape it replaces:
 *
 *  - the null-postal-code case fails if the planner ever drops a NULL column from the
 *    predicate or substitutes an empty string for it;
 *  - the untrimmed case fails if the planner trims the predicate value (the old code
 *    compared a trimmed client copy against an untrimmed stored value);
 *  - the missing-row case fails if an absent row is treated as an empty address, which
 *    would let a write be attempted against a row that does not exist.
 */

describe('planCreatorVerification', () => {
  it('matches a stored postal code exactly, and geocodes it — the returning-creator regression', () => {
    // The OnboardingWizard path: it upserts {city, country, timezone} with no
    // postal_code, so a postal code saved earlier through the full profile editor
    // survives. The old code took the client's omission to mean "stored NULL" and
    // matched `.is('postal_code', null)`, which never matched '07030' — zero rows, no
    // stamp, permanently. Reading the row makes the omission unrepresentable.
    const plan = planCreatorVerification({ city: 'Hoboken', country: 'US', postal_code: '07030' });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.match).toEqual([
      { column: 'city', value: 'Hoboken' },
      { column: 'country', value: 'US' },
      { column: 'postal_code', value: '07030' },
    ]);
    expect(plan.queryText).toBe('Hoboken, 07030, US');
  });

  it('carries a NULL postal code through as a null term, never as an empty string or a dropped term', () => {
    const plan = planCreatorVerification({ city: 'Hoboken', country: 'US', postal_code: null });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // Three terms, not two: dropping the column would widen the write's match.
    expect(plan.match).toHaveLength(3);
    const postal = plan.match.find((m) => m.column === 'postal_code');
    expect(postal).toEqual({ column: 'postal_code', value: null });
    // `null`, not `''` — the caller turns null into `.is(col, null)`, and `.eq(col, '')`
    // would match nothing.
    expect(postal?.value).not.toBe('');
    expect(plan.queryText).toBe('Hoboken, US');
  });

  it('keeps stored whitespace VERBATIM in the predicate while trimming it out of the geocode query', () => {
    // useCreatorProfileSubmit.ts stores city/country untrimmed; the old client helper
    // sent them trimmed, so a stored 'Hoboken ' never matched a submitted 'Hoboken'.
    const plan = planCreatorVerification({ city: 'Hoboken ', country: ' US', postal_code: null });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // The predicate must compare the row against ITSELF — untrimmed.
    expect(plan.match[0]).toEqual({ column: 'city', value: 'Hoboken ' });
    expect(plan.match[1]).toEqual({ column: 'country', value: ' US' });
    // The query text is a search string, not an equality, so it is normalized.
    expect(plan.queryText).toBe('Hoboken, US');
  });

  it('reports a missing row distinctly, rather than as a blank address', () => {
    expect(planCreatorVerification(null)).toEqual({ ok: false, reason: 'missing_row' });
    expect(planCreatorVerification(undefined)).toEqual({ ok: false, reason: 'missing_row' });
  });

  it('reports a row with no usable address as no_address, and plans no write', () => {
    expect(planCreatorVerification({ city: null, country: 'US', postal_code: '07030' }))
      .toEqual({ ok: false, reason: 'no_address' });
    expect(planCreatorVerification({ city: '   ', country: 'US', postal_code: null }))
      .toEqual({ ok: false, reason: 'no_address' });
    expect(planCreatorVerification({ city: 'Hoboken', country: '', postal_code: null }))
      .toEqual({ ok: false, reason: 'no_address' });
  });
});

describe('planBusinessVerification', () => {
  it('keeps a stored untrimmed address verbatim in the predicate and trimmed in the query', () => {
    const plan = planBusinessVerification({ address: '  221B Baker St, London ' });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.match).toEqual([{ column: 'address', value: '  221B Baker St, London ' }]);
    expect(plan.queryText).toBe('221B Baker St, London');
  });

  it('reports a missing unit distinctly from a unit with no address', () => {
    expect(planBusinessVerification(null)).toEqual({ ok: false, reason: 'missing_row' });
    expect(planBusinessVerification({ address: null })).toEqual({ ok: false, reason: 'no_address' });
    expect(planBusinessVerification({ address: '  ' })).toEqual({ ok: false, reason: 'no_address' });
  });
});
