/**
 * Provenance-tagged assumptions for the investor model.
 *
 * Every number the deck and the generated model document state passes through here. The tag
 * is not decoration: `docs/DragonCandy_Capital_Raise_Cost_Model.md` said burn was $390/mo for
 * two months after it became $572, because prose cannot fail. A MEASURED row carries the date
 * it was read and the command that reads it, and `findStale` turns "someone should re-check
 * that" into a failing test.
 */

export type Provenance = 'MEASURED' | 'BENCHMARKED' | 'MODELED';

/** A MEASURED row is re-read from its source every 90 days or CI fails. */
export const MAX_MEASURED_AGE_DAYS = 90;

interface AssumptionBase<T> {
  readonly value: T;
  /** e.g. 'USD/month', 'fraction', 'campaigns/month'. Displayed beside the value. */
  readonly unit: string;
  /** Plain-English name. This is what appears in the document and on a slide. */
  readonly label: string;
  /**
   * A command, file path, or URL — never a prose description. A measured number whose source
   * cannot be re-run is not measured, and an ambiguous count (see the spec on pages: 69 or 95)
   * is only pinned down by the exact command.
   */
  readonly source: string;
  readonly note?: string;
}

export interface MeasuredAssumption<T> extends AssumptionBase<T> {
  readonly provenance: 'MEASURED';
  /** ISO date (YYYY-MM-DD) this value was last read from `source`. */
  readonly asOf: string;
}

export interface DerivedAssumption<T> extends AssumptionBase<T> {
  readonly provenance: 'BENCHMARKED' | 'MODELED';
  /** Structurally impossible: only a measured value has a reading date. */
  readonly asOf?: never;
}

export type Assumption<T = number> = MeasuredAssumption<T> | DerivedAssumption<T>;

export function measured<T>(a: Omit<MeasuredAssumption<T>, 'provenance'>): MeasuredAssumption<T> {
  return { ...a, provenance: 'MEASURED' };
}

export function benchmarked<T>(a: Omit<DerivedAssumption<T>, 'provenance' | 'asOf'>): DerivedAssumption<T> {
  return { ...a, provenance: 'BENCHMARKED' };
}

export function modeled<T>(a: Omit<DerivedAssumption<T>, 'provenance' | 'asOf'>): DerivedAssumption<T> {
  return { ...a, provenance: 'MODELED' };
}

export interface StaleFinding {
  readonly key: string;
  readonly label: string;
  readonly asOf: string;
  readonly ageDays: number;
  readonly source: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Every MEASURED row older than `maxAgeDays`. Pure: `today` is a parameter so the check is
 * deterministic in a test and honest in CI, where the caller passes the real date.
 */
export function findStale(
  register: Readonly<Record<string, Assumption<unknown>>>,
  today: Date,
  maxAgeDays: number,
): StaleFinding[] {
  const findings: StaleFinding[] = [];
  for (const [key, a] of Object.entries(register)) {
    if (a.provenance !== 'MEASURED') continue;
    const readAt = Date.parse(`${a.asOf}T00:00:00Z`);
    if (Number.isNaN(readAt)) {
      throw new Error(`Assumption "${key}" has an unparseable asOf: ${a.asOf}`);
    }
    const ageDays = Math.floor((today.getTime() - readAt) / MS_PER_DAY);
    if (ageDays > maxAgeDays) {
      findings.push({ key, label: a.label, asOf: a.asOf, ageDays, source: a.source });
    }
  }
  return findings;
}
