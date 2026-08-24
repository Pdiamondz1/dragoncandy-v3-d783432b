import { describe, it, expect } from 'vitest';
import {
  measured,
  benchmarked,
  modeled,
  findStale,
  MAX_MEASURED_AGE_DAYS,
  type Assumption,
} from './types';

const TODAY = new Date('2026-08-23T00:00:00Z');

describe('assumption constructors', () => {
  it('stamps the provenance so a caller cannot mislabel a row', () => {
    const m = measured({
      value: 572,
      unit: 'USD/month',
      label: 'Monthly operating cost',
      source: 'vendor invoices: Lovable 50, Anthropic 200, Outstand 249, Supabase 45, OpenAI 25',
      asOf: '2026-08-23',
    });
    expect(m.provenance).toBe('MEASURED');
    expect(m.asOf).toBe('2026-08-23');

    expect(benchmarked({ value: 0.04, unit: 'fraction/month', label: 'SMB SaaS churn', source: 'https://example.invalid' }).provenance)
      .toBe('BENCHMARKED');
    expect(modeled({ value: 2.5, unit: 'campaigns/month', label: 'Campaigns per restaurant', source: 'src/pitch/model/assumptions.ts' }).provenance)
      .toBe('MODELED');
  });
});

describe('findStale', () => {
  it('flags a MEASURED row past the threshold and reports its age and source', () => {
    const register: Record<string, Assumption<number>> = {
      burnMonthly: measured({
        value: 572,
        unit: 'USD/month',
        label: 'Monthly operating cost',
        source: 'vendor invoices',
        asOf: '2026-01-01',
      }),
    };
    const found = findStale(register, TODAY, MAX_MEASURED_AGE_DAYS);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe('burnMonthly');
    expect(found[0].ageDays).toBe(234);
    expect(found[0].source).toBe('vendor invoices');
  });

  it('does not flag a MEASURED row inside the threshold', () => {
    const register: Record<string, Assumption<number>> = {
      fresh: measured({ value: 1, unit: 'n', label: 'Fresh', source: 'cmd', asOf: '2026-08-01' }),
    };
    expect(findStale(register, TODAY, MAX_MEASURED_AGE_DAYS)).toEqual([]);
  });

  it('never flags BENCHMARKED or MODELED rows, which carry no asOf at all', () => {
    const register: Record<string, Assumption<number>> = {
      churn: benchmarked({ value: 0.04, unit: 'fraction/month', label: 'Churn', source: 'url' }),
      campaigns: modeled({ value: 2.5, unit: 'n/month', label: 'Campaigns', source: 'file' }),
    };
    expect(findStale(register, TODAY, MAX_MEASURED_AGE_DAYS)).toEqual([]);
  });

  it('flags a row exactly one day past the threshold but not one exactly at it', () => {
    const at: Record<string, Assumption<number>> = {
      k: measured({ value: 1, unit: 'n', label: 'At', source: 'cmd', asOf: '2026-05-25' }),
    };
    const past: Record<string, Assumption<number>> = {
      k: measured({ value: 1, unit: 'n', label: 'Past', source: 'cmd', asOf: '2026-05-24' }),
    };
    expect(findStale(at, TODAY, MAX_MEASURED_AGE_DAYS)).toEqual([]);
    expect(findStale(past, TODAY, MAX_MEASURED_AGE_DAYS)).toHaveLength(1);
  });
});
