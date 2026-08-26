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

export interface CensusGeography {
  readonly kind: 'zip' | 'county';
  /** ZIP code, or a 5-digit state+county FIPS. */
  readonly code: string;
  readonly label: string;
}

export interface CensusMetroSnapshot {
  readonly metroId: string;
  readonly geography: CensusGeography;
  readonly rows: readonly NaicsRow[];
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
