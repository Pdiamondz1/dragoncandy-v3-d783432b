/**
 * The metros, their addressable market, and how far we expect to penetrate it.
 *
 * "Addressable" is a modeling choice and is stated rather than left to the reader (spec
 * section 4.2). Full-service restaurants, bars and coffee shops, at 5-49 employees: large
 * enough to have a marketing budget, small enough to have no marketing department. Under 5
 * is below the $149 entry tier's plausible budget; 50+ has, or is owned by someone who has,
 * a marketing function. Franchised fast food is excluded because social is set at corporate.
 *
 * Penetration is stated against the ADDRESSABLE count, never the town-wide count. Both
 * appear in the workbook so the ratio cannot be quietly swapped.
 */
import { modeled, type Assumption } from './types';
import {
  loadCensusSnapshot,
  snapshotFor,
  bucketSum,
  type SizeBucket,
  type CensusGeography,
} from './censusTam';

export const MODEL_YEARS = [2026, 2027, 2028] as const;
export type ModelYear = (typeof MODEL_YEARS)[number];

export const ADDRESSABLE_NAICS = ['722511', '722410', '722515'] as const;
export const ADDRESSABLE_BUCKETS: readonly SizeBucket[] = ['b5_9', 'b10_19', 'b20_49'];

/** Every food service and drinking place, the denominator the addressable band sits inside. */
const ALL_FOOD_SERVICE_NAICS = '722';

export interface Metro {
  readonly id: string;
  readonly label: string;
  readonly geography: CensusGeography;
  /** Toggled into the rollup. Mirrors Adrian's per-state YES/NO. */
  readonly enabled: boolean;
  /** Absolute month, 1 = 2026-01. */
  readonly launchMonth: Assumption<number>;
  /** Penetration of ADDRESSABLE venues at the END of each year. */
  readonly penetration: Readonly<Record<ModelYear, Assumption<number>>>;
}

const SOURCE = 'src/pitch/model/metros.ts';
const ROLLOUT = 'docs/DragonCandy_Capital_Raise_Cost_Model.md (metro sequence)';

/**
 * Launch months map the cost model's raise-relative plan (Hoboken 0-6, Manhattan 5-12,
 * Palm Beach 11-18) onto calendar months with raise month 1 = 2026-01. That mapping is an
 * assumption, not a fact, and moves if the raise closes later.
 */
export const METROS: readonly Metro[] = [
  {
    id: 'hoboken',
    label: 'Hoboken, NJ',
    geography: { kind: 'zip', code: '07030', label: 'Hoboken, NJ' },
    enabled: true,
    launchMonth: modeled({ value: 1, unit: 'month', label: 'Hoboken launch month', source: ROLLOUT }),
    penetration: {
      2026: modeled({ value: 0.08, unit: 'fraction', label: 'Hoboken penetration 2026', source: SOURCE }),
      2027: modeled({ value: 0.22, unit: 'fraction', label: 'Hoboken penetration 2027', source: SOURCE }),
      2028: modeled({ value: 0.35, unit: 'fraction', label: 'Hoboken penetration 2028', source: SOURCE }),
    },
  },
  {
    id: 'manhattan',
    label: 'Manhattan, NY',
    geography: { kind: 'county', code: '36061', label: 'New York County, NY' },
    enabled: true,
    launchMonth: modeled({ value: 6, unit: 'month', label: 'Manhattan launch month', source: ROLLOUT }),
    penetration: {
      2026: modeled({ value: 0.005, unit: 'fraction', label: 'Manhattan penetration 2026', source: SOURCE }),
      2027: modeled({ value: 0.02, unit: 'fraction', label: 'Manhattan penetration 2027', source: SOURCE }),
      2028: modeled({ value: 0.05, unit: 'fraction', label: 'Manhattan penetration 2028', source: SOURCE }),
    },
  },
  {
    id: 'palm-beach',
    label: 'Palm Beach County, FL',
    geography: { kind: 'county', code: '12099', label: 'Palm Beach County, FL' },
    enabled: true,
    launchMonth: modeled({ value: 12, unit: 'month', label: 'Palm Beach launch month', source: ROLLOUT }),
    penetration: {
      2026: modeled({ value: 0, unit: 'fraction', label: 'Palm Beach penetration 2026', source: SOURCE }),
      2027: modeled({ value: 0.02, unit: 'fraction', label: 'Palm Beach penetration 2027', source: SOURCE }),
      2028: modeled({
        value: 0.06,
        unit: 'fraction',
        label: 'Palm Beach penetration 2028',
        source: SOURCE,
        note:
          'Restated 2026-08-26 from 0.25 when the geography moved from the ZIP 33480 town ' +
          '(which has no recoverable 722410 row and two suppressed buckets each in 722511 and ' +
          '722515) to Palm Beach County. The county base is ~9x the town figure the original ' +
          'ratio was picked against, so the un-rescaled 0.25 would have implied roughly 268 ' +
          'customers in a market entered in month 12 -- of the three penetration assumptions ' +
          'in this file, this is the one most worth challenging.',
      }),
    },
  },
];

/** Venues in the addressable band -- the denominator penetration is stated against. */
export function addressableVenues(metroId: string): number {
  const snap = snapshotFor(loadCensusSnapshot(), metroId);
  let total = 0;
  for (const naics of ADDRESSABLE_NAICS) {
    const row = snap.rows.find((r) => r.naics === naics);
    if (!row) continue;
    total += bucketSum(row, ADDRESSABLE_BUCKETS);
  }
  return total;
}

/** Every food service and drinking place, for the ratio shown beside the addressable count. */
export function totalFoodServiceVenues(metroId: string): number {
  const snap = snapshotFor(loadCensusSnapshot(), metroId);
  const row = snap.rows.find((r) => r.naics === ALL_FOOD_SERVICE_NAICS);
  if (!row) throw new Error(`No NAICS 722 row for "${metroId}" in the Census snapshot.`);
  return row.establishments;
}

export function enabledMetros(): readonly Metro[] {
  return METROS.filter((m) => m.enabled);
}

/** Flat view for staleness checking and the workbook's Assumptions sheet. */
export const METRO_ASSUMPTIONS: Readonly<Record<string, Assumption<number>>> = Object.fromEntries(
  METROS.flatMap((m) => [
    [`${m.id}_launchMonth`, m.launchMonth],
    ...MODEL_YEARS.map((y) => [`${m.id}_penetration_${y}`, m.penetration[y]] as const),
  ]),
);
