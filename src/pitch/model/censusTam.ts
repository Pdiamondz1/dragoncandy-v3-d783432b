/**
 * Census Business Patterns establishment counts, read from a committed snapshot.
 *
 * The snapshot is committed rather than fetched at build time for three reasons: the build
 * must be deterministic and work offline, the snapshot is the audit trail an investor can
 * check, and a network fetch inside a build is a build that fails for reasons unrelated to
 * the code. Refresh it with `npm run model:tam`.
 *
 * Census suppresses cells to protect respondent confidentiality, writing "N" where a real
 * count exists. Treating that as zero undercounts a market. It is treated as unknown here,
 * and recovered only when it is arithmetically forced.
 */
import snapshotJson from './censusTam.json';

export const SIZE_BUCKETS = [
  'lt5',
  'b5_9',
  'b10_19',
  'b20_49',
  'b50_99',
  'b100_249',
  'b250_499',
  'b500_999',
  'b1000',
] as const;

export type SizeBucket = (typeof SIZE_BUCKETS)[number];

/** `null` means Census suppressed the cell. It is never a zero. */
export type Buckets = Readonly<Record<SizeBucket, number | null>>;

export interface NaicsRow {
  readonly naics: string;
  readonly establishments: number;
  readonly buckets: Buckets;
}

/**
 * One geography, or a set of them.
 *
 * `zipset` exists because a real market is not always one ZIP or one county. Montauk alone is
 * 11-17 addressable venues — too thin to model — while the East End it sits on is a single
 * commercial market spread across fourteen ZIPs. Modelling it needed a geography kind that is
 * a SET, and a summing rule (see `bandFloorAcross` below) that survives Census suppression
 * across a dozen small places.
 */
export type CensusGeography =
  | {
      readonly kind: 'zip' | 'county';
      /** ZIP code, or a 5-digit state+county FIPS. */
      readonly code: string;
      readonly label: string;
    }
  | {
      readonly kind: 'zipset';
      /** Every ZIP in the set, INCLUDING any the Census file has no rows for. */
      readonly codes: readonly string[];
      readonly label: string;
    };

/**
 * One constituent of a `zipset`, with its RAW rows.
 *
 * Raw, deliberately. Suppression recovery and summing happen in this file, where CI tests
 * them, rather than being baked into a committed JSON nobody can re-derive. An empty `rows`
 * means the Census file has no rows for that ZIP at all — it is recorded rather than dropped,
 * because absent is not zero and a reader must be able to see that the constituent list was
 * fourteen and twelve answered.
 */
export interface CensusPart {
  readonly code: string;
  readonly label: string;
  readonly rows: readonly NaicsRow[];
}

export interface CensusMetroSnapshot {
  readonly metroId: string;
  readonly geography: CensusGeography;
  /** The metro's own rows. Empty for a `zipset`, whose rows live in `parts`. */
  readonly rows: readonly NaicsRow[];
  /** Present only for a `zipset`. Single-geography metros are byte-identical without it. */
  readonly parts?: readonly CensusPart[];
  /** CBP/ZBP data year, e.g. 2022. */
  readonly vintage: number;
  readonly sourceUrl: string;
  /** ISO date the file was downloaded. */
  readonly fetchedAt: string;
}

export interface CensusSnapshot {
  readonly generatedAt: string;
  readonly metros: readonly CensusMetroSnapshot[];
}

/**
 * Fill a suppressed bucket when exactly one is unknown — its value is then forced by the
 * establishment total. With two or more unknown, the split is genuinely unrecoverable and
 * the row is returned untouched.
 */
export function resolveSuppressed(row: NaicsRow): NaicsRow {
  const unknown = SIZE_BUCKETS.filter((b) => row.buckets[b] === null);
  if (unknown.length !== 1) return row;

  const known = SIZE_BUCKETS.filter((b) => row.buckets[b] !== null).reduce(
    (sum, b) => sum + (row.buckets[b] as number),
    0,
  );
  const residual = row.establishments - known;
  if (residual < 0) {
    throw new Error(
      `${row.naics}: residual is negative (${row.establishments} establishments, ` +
        `${known} in known buckets). The row does not add up — check the column offsets ` +
        `for this vintage before trusting any figure derived from it.`,
    );
  }
  return { ...row, buckets: { ...row.buckets, [unknown[0]]: residual } };
}

/** Sum of the named buckets. Throws rather than undercounting if one is still suppressed. */
export function bucketSum(row: NaicsRow, buckets: readonly SizeBucket[]): number {
  const resolved = resolveSuppressed(row);
  let total = 0;
  for (const b of buckets) {
    const v = resolved.buckets[b];
    if (v === null) {
      throw new Error(
        `${row.naics}: bucket "${b}" is suppressed and could not be recovered, so a sum over ` +
          `[${buckets.join(', ')}] would silently undercount. Widen the band or state a range.`,
      );
    }
    total += v;
  }
  return total;
}

/**
 * A count that knows whether it is exact or a floor.
 *
 * The two are not interchangeable and must never be printed the same way — see
 * `describeAddressable` in `metros.ts`, and the test that makes the disclosure travel with
 * the number.
 */
export interface BandCount {
  /** Sum of the buckets whose value is known after per-part suppression recovery. */
  readonly value: number;
  /** Cells still suppressed after recovery. `0` means `value` is exact, not a floor. */
  readonly suppressedCells: number;
}

/**
 * Sum the named buckets across MANY geographies, resolving suppression per geography first,
 * and count the cells that stayed unknown.
 *
 * ## This diverges from `bucketSum`'s throw-rather-than-undercount rule, on purpose
 *
 * `bucketSum` throws when a needed bucket is still suppressed, and that is right for a single
 * geography: one hidden cell there means the metro is not modelable, which is exactly why
 * Palm Beach moved from ZIP 33480 to the county. Across fourteen ZIPs it is the wrong rule.
 * Throwing would make a real 396-venue market unmodelable because one coffee-shop count in
 * one hamlet is hidden — and the market does not stop existing when Census protects a
 * respondent.
 *
 * So this returns the FLOOR: the sum of what is known, with a count of what is not. The bias
 * is bounded (each missing cell hides at least 1 and at most the row's establishment total),
 * ONE-DIRECTIONAL (it can only understate), and DISCLOSED (`suppressedCells` travels with the
 * figure and every surface that prints the number must print the range). Understating revenue
 * is the safe direction for an investor model; silently overstating it is not, and neither is
 * refusing to model a market that plainly exists.
 *
 * ## Why resolution is per-part and happens BEFORE the sum
 *
 * `resolveSuppressed` recovers a bucket whose value is FORCED by its row's establishment
 * total, which holds only when exactly one of the row's nine buckets is unknown. Summing raw
 * rows first would collapse several rows' unknowns into one row with many, so a recoverable
 * bucket would be lost for nothing. Hence per-geography, before the sum.
 *
 * **On the committed 2023 vintage it recovers NOTHING, and that must be said plainly rather
 * than left to be discovered.** Measured across all 67 rows in `censusTam.json`: the fewest
 * suppressed buckets any row has is TWO, and the distribution runs 2–9 (17 rows have eight,
 * 11 have all nine). **Zero rows have exactly one.** So `bandFloorAcross` returns byte-identical
 * results with and without the resolution step, every band figure is a floor, and
 * `suppressedCells` is the whole story.
 *
 * This comment previously claimed "Montauk's 722511 row has exactly one suppressed bucket, so
 * its value is recoverable; Water Mill's has two, so it is not." That is false against this
 * snapshot — Montauk's 722511 has six and Water Mill's seven — and the same worked example had
 * been copied onto the investor-facing Sources sheet, where a reader could check it and find it
 * wrong. It was true only under a different reading of "bucket" (the three inside the
 * addressable band, rather than the nine in the row), which is not the mechanism the sentence
 * describes.
 *
 * The function and its ordering test are KEPT rather than deleted: the test proves the ordering
 * rule on synthetic one-null fixtures, and the rule is correct — it simply has no work to do on
 * this vintage. A later vintage, or a narrower geography, can produce a one-null row. What must
 * not happen again is a surface asserting that it currently does.
 */
export function bandFloorAcross(
  rowsPerGeography: ReadonlyArray<readonly NaicsRow[]>,
  naicsCodes: readonly string[],
  buckets: readonly SizeBucket[],
): BandCount {
  let value = 0;
  let suppressedCells = 0;
  for (const rows of rowsPerGeography) {
    for (const naics of naicsCodes) {
      const row = rows.find((r) => r.naics === naics);
      // A NAICS with no row is not a suppressed cell — Census published nothing for it
      // because there is nothing there. Counting it as unknown would inflate the disclosed
      // uncertainty with places that genuinely have no bars.
      if (!row) continue;
      const resolved = resolveSuppressed(row);
      for (const b of buckets) {
        const v = resolved.buckets[b];
        if (v === null) suppressedCells += 1;
        else value += v;
      }
    }
  }
  return { value, suppressedCells };
}

export function loadCensusSnapshot(): CensusSnapshot {
  return snapshotJson as CensusSnapshot;
}

export function snapshotFor(snapshot: CensusSnapshot, metroId: string): CensusMetroSnapshot {
  const found = snapshot.metros.find((m) => m.metroId === metroId);
  if (!found) {
    throw new Error(
      `No Census snapshot for metro "${metroId}". Add its geography to scripts/fetch-census-tam.ts ` +
        `and re-run \`npm run model:tam\`.`,
    );
  }
  return found;
}
