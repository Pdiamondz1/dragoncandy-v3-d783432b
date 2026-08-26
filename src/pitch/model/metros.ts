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
  bandFloorAcross,
  type BandCount,
  type SizeBucket,
  type CensusGeography,
  type CensusMetroSnapshot,
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
          'Restated 2026-08-26 from 0.25 when the geography moved from the ZIP 33480 town to ' +
          'Palm Beach County, because the town ZIP was too suppressed to model. NOTE that ' +
          'claim is NOT checkable from this repo: 33480 is not in censusTam.json (the move is ' +
          'exactly why it was never snapshotted), so it records a probe run at the time rather ' +
          'than something a reader can reproduce. An earlier draft of this note counted the ' +
          'suppressed buckets, which invited exactly the arithmetic that turned out to be wrong ' +
          'elsewhere in this slice -- "bucket" means one of the row\'s NINE size classes, not ' +
          'one of the three in the addressable band. The county base is ~9x the town figure the original ' +
          'ratio was picked against, so the un-rescaled 0.25 would have implied roughly 268 ' +
          'customers in a market entered in month 12 -- of the three penetration assumptions ' +
          'in this file, this is the one most worth challenging.',
      }),
    },
  },
  {
    id: 'montauk-hamptons',
    label: 'Montauk + the Hamptons, NY',
    geography: {
      kind: 'zipset',
      // The constituent ZIPs and their labels live in scripts/fetch-census-tam.ts, which is
      // what reads them out of the Census file; the snapshot's `parts` is the audit trail.
      codes: [
        '11930', '11932', '11937', '11942', '11946', '11954', '11959',
        '11962', '11963', '11968', '11975', '11976', '11977', '11978',
      ],
      label: 'Montauk + the Hamptons, NY (14 ZIPs)',
    },
    enabled: true,
    launchMonth: modeled({
      value: 17,
      unit: 'month',
      label: 'Montauk + Hamptons launch month',
      source: SOURCE,
      note:
        'Month 17 = May 2027, the first month of the East End season. Not taken from the ' +
        'cost model, which predates this metro — stated here with its reasoning. The market ' +
        'is seasonal and tourist-driven: a large share of these venues are dark from ' +
        'November, so entering in, say, February would spend an acquisition budget on ' +
        'businesses that are closed. Palm Beach is entered at the start of ITS season ' +
        '(month 12 = December 2026) for the same reason, so the rule is consistent rather ' +
        'than fitted to this metro. What DOES exist here today is a planned launch event in ' +
        'Montauk (src/pitch/deck/pending.ts, LAUNCH_EVENTS) and no operating presence at all ' +
        '— which is why this is the last metro in, not the first.',
    }),
    penetration: {
      2026: modeled({
        value: 0,
        unit: 'fraction',
        label: 'Montauk + Hamptons penetration 2026',
        source: SOURCE,
        note: 'Launches month 17, so 2026 is structurally zero rather than a forecast.',
      }),
      2027: modeled({
        value: 0.03,
        unit: 'fraction',
        label: 'Montauk + Hamptons penetration 2027',
        source: SOURCE,
        note:
          'Three venues by the end of the first season. The honest unit here is the count, ' +
          'not the percentage: against a base of ~97 a single account moves the rate by a ' +
          'full point, so quoting 3% implies a precision the market size does not support. ' +
          'Three is what one founder-led season around a launch event plausibly closes, and ' +
          'it is deliberately BELOW Hoboken\'s first-year 8% — Hoboken is the town where the ' +
          'founders already know the owners, and nothing about the East End is warmer than ' +
          'that.',
      }),
      2028: modeled({
        value: 0.10,
        unit: 'fraction',
        label: 'Montauk + Hamptons penetration 2028',
        source: SOURCE,
        note:
          'Ten venues after a second full season. Above Palm Beach County\'s 6% and far ' +
          'below Hoboken\'s 35%, and the reason is SIZE, not confidence: ~97 venues across ' +
          'fourteen contiguous ZIPs is a market one person can physically walk in a week, so ' +
          'ten accounts is an absolute a single rep can hold — where 6% of Palm Beach County ' +
          'is 65 accounts and needs a team. The seasonal discount is already carried by the ' +
          'launch month (this window contains two selling SEASONS, not twenty months), so ' +
          'applying it again to the rate would be double-counting it. Note the denominator ' +
          'is itself a floor, so ten venues is a slightly smaller share of the real market ' +
          'than 10% — the bias runs toward understating, which is the direction we want.',
      }),
    },
  },
];

/**
 * Venues in the addressable band, with the uncertainty that comes with them.
 *
 * A single-geography metro is EXACT or it throws: `bucketSum` refuses to undercount, which is
 * what moved Palm Beach off the town ZIP and onto the county. A `zipset` returns a FLOOR
 * instead, because refusing to model a 396-venue market over one hidden coffee-shop count in
 * one hamlet is the worse error — see `bandFloorAcross`'s header in `censusTam.ts` for the
 * full argument, and `describeAddressable` below for the rule that the disclosure travels
 * with the number.
 */
export function addressableBand(metroId: string): BandCount {
  const snap = snapshotFor(loadCensusSnapshot(), metroId);
  if (snap.parts) {
    return bandFloorAcross(
      snap.parts.map((p) => p.rows),
      ADDRESSABLE_NAICS,
      ADDRESSABLE_BUCKETS,
    );
  }
  let total = 0;
  for (const naics of ADDRESSABLE_NAICS) {
    const row = snap.rows.find((r) => r.naics === naics);
    if (!row) continue;
    total += bucketSum(row, ADDRESSABLE_BUCKETS);
  }
  return { value: total, suppressedCells: 0 };
}

/** The denominator penetration is stated against. A floor where the band is a floor. */
export function addressableVenues(metroId: string): number {
  return addressableBand(metroId).value;
}

/**
 * How the addressable count must be WRITTEN wherever it is shown.
 *
 * A floor printed as if it were a count is a lie by formatting. This is the one place that
 * decides the wording, so no surface can print the bare number and none can drift from
 * another. `workbook.test.ts` asserts the disclosure reaches every sheet that shows a floor.
 */
export function describeAddressable(metroId: string): string {
  const band = addressableBand(metroId);
  if (band.suppressedCells === 0) return `${band.value} addressable venues`;
  return (
    `at least ${band.value} addressable venues — ${band.suppressedCells} suppressed Census ` +
    `cells excluded, so the true figure is higher`
  );
}

function foodServiceRows(snap: CensusMetroSnapshot) {
  return snap.parts ? snap.parts.map((p) => p.rows) : [snap.rows];
}

/**
 * Every food service and drinking place, for the ratio shown beside the addressable count.
 *
 * Establishment TOTALS are never suppressed — only the size-bucket split inside them is — so
 * this is exact even for a zipset, where the addressable band is a floor. A constituent with
 * no rows at all contributes nothing, which is correct: absent means Census published no
 * establishments there.
 */
export function totalFoodServiceVenues(metroId: string): number {
  const snap = snapshotFor(loadCensusSnapshot(), metroId);
  const groups = foodServiceRows(snap);
  const rows = groups
    .map((g) => g.find((r) => r.naics === ALL_FOOD_SERVICE_NAICS))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
  if (rows.length === 0) {
    throw new Error(`No NAICS ${ALL_FOOD_SERVICE_NAICS} row for "${metroId}" in the Census snapshot.`);
  }
  return rows.reduce((sum, r) => sum + r.establishments, 0);
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
