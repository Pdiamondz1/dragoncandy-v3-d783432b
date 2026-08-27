# Investor Financial Model Workbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-metro financial model for DragonCandy on the architecture of the model Adrian Vella supplied, delivered as a live-formula Excel workbook in the Confidential shared drive and wired into the investor deck so the slide and the workbook cannot disagree.

**Architecture:** Census Business Patterns gives each metro's addressable venue count (committed as a JSON snapshot, fetched by a re-runnable script). A metro registry holds penetration ramps as provenance-tagged assumptions. Pure functions project one metro-year, then roll up across enabled metros with shared-cost allocation. A generator emits an eleven-sheet `.xlsx` whose inputs are named cells and whose downstream cells are real Excel formulas carrying cached results. The deck's existing `trajectory` slide is rebuilt on the rollup.

**Tech Stack:** TypeScript (strict), Vitest, `exceljs@4.4.0` (new dev dependency), `tsx` for scripts, the existing `scripts/lib/drive-service-account.ts` for upload.

**Spec:** `docs/superpowers/specs/2026-08-26-investor-financial-model-workbook-design.md`

## Global Constraints

- **Years are 2026, 2027, 2028.** Month indexing is absolute: month 1 = 2026-01, month 36 = 2028-12.
- **No orphan numeric literals in the workbook.** Every number is either sourced from `REGISTER`/`metros.ts` or is a formula. Enforced by `workbookProvenance.test.ts` (Task 6).
- **Every new numeric assumption is an `Assumption<number>`** from `src/pitch/model/types.ts`, using `measured()` / `benchmarked()` / `modeled()`. A `MEASURED` row needs an `asOf` and a re-runnable `source`.
- **Census suppression (`"N"`) is unknown, never zero.**
- **Three Adrian blocks are omitted, not stubbed:** bonus costs, statutory gaming tax, market access fees.
- **Do not tune penetration to match the top-down PROJECT_CONTEXT §3 bands.** The gap is reported, never closed.
- **Confidential build only.** The workbook carries `Financing`. The generator refuses to emit a public-labelled workbook containing that sheet.
- **TypeScript strict:** `noUnusedLocals`, `noUnusedParameters` are on. Prefix intentionally unused params with `_`.
- **ESLint:** only `console.error` / `console.warn` are allowed in `src/`. Scripts under `scripts/` are ESLint-ignored, so `console.log` is fine there.
- **Run `npm run build` before any push to main.**

---

### Task 1: Census TAM loader and snapshot

**Files:**
- Create: `src/pitch/model/censusTam.ts`
- Create: `src/pitch/model/censusTam.test.ts`
- Create: `src/pitch/model/censusTam.json` (generated in Step 6)
- Create: `scripts/fetch-census-tam.ts`
- Modify: `package.json` (add `model:tam` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `SizeBucket`, `NaicsRow`, `CensusGeography`, `CensusMetroSnapshot`, `CensusSnapshot`, `SIZE_BUCKETS`, `resolveSuppressed(row: NaicsRow): NaicsRow`, `bucketSum(row: NaicsRow, buckets: readonly SizeBucket[]): number`, `loadCensusSnapshot(): CensusSnapshot`, `snapshotFor(snapshot: CensusSnapshot, metroId: string): CensusMetroSnapshot`.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/censusTam.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SIZE_BUCKETS,
  resolveSuppressed,
  bucketSum,
  loadCensusSnapshot,
  snapshotFor,
  type NaicsRow,
} from './censusTam';

function row(naics: string, establishments: number, partial: Partial<NaicsRow['buckets']>): NaicsRow {
  const buckets = Object.fromEntries(SIZE_BUCKETS.map((b) => [b, 0])) as NaicsRow['buckets'];
  return { naics, establishments, buckets: { ...buckets, ...partial } };
}

describe('census suppression', () => {
  // Hoboken 722410 in the 2022 ZBP: est 22, under-5 suppressed, 5/8/6 in the next three.
  // 22 - 5 - 8 - 6 = 3, so the suppressed cell is recoverable exactly.
  it('recovers a single suppressed bucket as the residual', () => {
    const r = row('722410', 22, { lt5: null, b5_9: 5, b10_19: 8, b20_49: 6 });
    expect(resolveSuppressed(r).buckets.lt5).toBe(3);
  });

  it('leaves the buckets alone when two are suppressed', () => {
    const r = row('722511', 30, { lt5: null, b5_9: null, b10_19: 8, b20_49: 6 });
    const out = resolveSuppressed(r);
    expect(out.buckets.lt5).toBeNull();
    expect(out.buckets.b5_9).toBeNull();
  });

  it('never turns a suppressed cell into a zero', () => {
    const r = row('722515', 43, { lt5: null, b5_9: null, b10_19: null });
    for (const b of ['lt5', 'b5_9', 'b10_19'] as const) {
      expect(resolveSuppressed(r).buckets[b]).toBeNull();
    }
  });

  // A residual that comes out negative means the row does not add up -- bad parse, wrong
  // column offset, or a vintage whose layout moved. Silently clamping it to 0 would hide
  // exactly the failure this is meant to surface.
  it('throws when the residual would be negative', () => {
    const r = row('722511', 5, { lt5: null, b5_9: 9 });
    expect(() => resolveSuppressed(r)).toThrow(/residual/i);
  });
});

describe('bucketSum', () => {
  it('adds the named buckets', () => {
    const r = row('722511', 97, { lt5: 17, b5_9: 19, b10_19: 23, b20_49: 34, b50_99: 4 });
    expect(bucketSum(r, ['b5_9', 'b10_19', 'b20_49'])).toBe(76);
  });

  it('throws rather than undercounting when a needed bucket is suppressed', () => {
    const r = row('722511', 97, { b5_9: null, b10_19: 23 });
    expect(() => bucketSum(r, ['b5_9', 'b10_19'])).toThrow(/suppressed/i);
  });
});

describe('the committed snapshot', () => {
  const snapshot = loadCensusSnapshot();

  it('covers the three named metros', () => {
    for (const id of ['hoboken', 'manhattan', 'palm-beach']) {
      expect(snapshotFor(snapshot, id).rows.length).toBeGreaterThan(0);
    }
  });

  it('records a vintage, a source URL and a fetch date for every metro', () => {
    for (const m of snapshot.metros) {
      expect(m.vintage).toBeGreaterThanOrEqual(2022);
      expect(m.sourceUrl).toMatch(/^https:\/\/www2\.census\.gov\//);
      expect(m.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('carries the Hoboken counts read during design', () => {
    const rows = snapshotFor(snapshot, 'hoboken').rows;
    const byNaics = Object.fromEntries(rows.map((r) => [r.naics, r.establishments]));
    expect(byNaics['722511']).toBe(97);
    expect(byNaics['722410']).toBe(22);
    expect(byNaics['722515']).toBe(43);
  });

  it('has every bucket total reconcile to the establishment count', () => {
    for (const m of snapshot.metros) {
      for (const r of m.rows) {
        const resolved = resolveSuppressed(r);
        const known = SIZE_BUCKETS.map((b) => resolved.buckets[b]).filter((v): v is number => v !== null);
        const suppressed = SIZE_BUCKETS.length - known.length;
        const total = known.reduce((a, b) => a + b, 0);
        if (suppressed === 0) {
          expect(total, `${m.metroId} ${r.naics}`).toBe(r.establishments);
        } else {
          expect(total, `${m.metroId} ${r.naics}`).toBeLessThanOrEqual(r.establishments);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pitch/model/censusTam.test.ts`
Expected: FAIL — `Failed to resolve import "./censusTam"`.

- [ ] **Step 3: Write the loader**

Create `src/pitch/model/censusTam.ts`:

```ts
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
```

- [ ] **Step 4: Enable JSON imports if TypeScript objects**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -5`

If it reports the JSON module cannot be found, add `"resolveJsonModule": true` to `compilerOptions` in `tsconfig.app.json`. If it already passes, change nothing.

- [ ] **Step 5: Write the fetch script**

Create `scripts/fetch-census-tam.ts`:

```ts
#!/usr/bin/env npx tsx
/**
 * Refresh src/pitch/model/censusTam.json from Census Business Patterns.
 *
 *   npm run model:tam
 *
 * The api.census.gov JSON endpoint now answers "Missing Key". The bulk dataset files need
 * no key, so this downloads those. It prints a diff against the previous snapshot, because
 * a vintage that moves under you and changes a TAM silently is worse than one that fails.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SIZE_BUCKETS, type CensusGeography, type NaicsRow } from '../src/pitch/model/censusTam';

const OUT = 'src/pitch/model/censusTam.json';

/** NAICS codes the model reads. Superset of the addressable band, so the band can widen. */
const NAICS = ['722', '722511', '722513', '722515', '722410', '7223'];

const GEOGRAPHIES: ReadonlyArray<{ metroId: string; geography: CensusGeography }> = [
  { metroId: 'hoboken', geography: { kind: 'zip', code: '07030', label: 'Hoboken, NJ' } },
  { metroId: 'manhattan', geography: { kind: 'county', code: '36061', label: 'New York County, NY' } },
  { metroId: 'palm-beach', geography: { kind: 'zip', code: '33480', label: 'Palm Beach, FL' } },
];

async function newestVintage(): Promise<number> {
  for (let year = new Date().getUTCFullYear(); year >= 2022; year -= 1) {
    const yy = String(year).slice(2);
    const url = `https://www2.census.gov/programs-surveys/cbp/datasets/${year}/zbp${yy}detail.zip`;
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return year;
  }
  throw new Error('No CBP vintage found back to 2022.');
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/** ZBP detail: zip,name,naics,est,n<5,n5_9,n10_19,n20_49,n50_99,n100_249,n250_499,n500_999,n1000,... */
function parseZbp(text: string, zip: string): NaicsRow[] {
  const out: NaicsRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith(`"${zip}"`)) continue;
    const f = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    const naics = f[2];
    if (!NAICS.includes(naics)) continue;
    out.push(toRow(naics, f.slice(3, 3 + 1 + SIZE_BUCKETS.length)));
  }
  return out;
}

/** CBP county: fipstate,fipscty,naics,emp_nf,emp,qp1_nf,qp1,ap_nf,ap,est,n<5,... */
function parseCbp(text: string, fips: string): NaicsRow[] {
  const state = fips.slice(0, 2);
  const county = fips.slice(2);
  const out: NaicsRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith(`"${state}","${county}"`)) continue;
    const f = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    const naics = f[2];
    if (!NAICS.includes(naics)) continue;
    out.push(toRow(naics, [f[9], ...f.slice(10, 10 + SIZE_BUCKETS.length)]));
  }
  return out;
}

/** `fields[0]` is the establishment count; the rest are the size buckets, in order. */
function toRow(naics: string, fields: string[]): NaicsRow {
  const buckets = Object.fromEntries(
    SIZE_BUCKETS.map((b, i) => {
      const raw = fields[i + 1];
      return [b, raw === undefined || raw === '' || raw === 'N' ? null : Number(raw)];
    }),
  ) as NaicsRow['buckets'];
  return { naics, establishments: Number(fields[0]), buckets };
}

async function main(): Promise<void> {
  const vintage = await newestVintage();
  const yy = String(vintage).slice(2);
  const dir = mkdtempSync(join(tmpdir(), 'cbp-'));
  const fetchedAt = new Date().toISOString().slice(0, 10);

  const zbpUrl = `https://www2.census.gov/programs-surveys/cbp/datasets/${vintage}/zbp${yy}detail.zip`;
  const cbpUrl = `https://www2.census.gov/programs-surveys/cbp/datasets/${vintage}/cbp${yy}co.zip`;

  console.log(`Vintage ${vintage}. Downloading...`);
  await download(zbpUrl, join(dir, 'zbp.zip'));
  await download(cbpUrl, join(dir, 'cbp.zip'));
  execFileSync('unzip', ['-o', '-q', join(dir, 'zbp.zip'), '-d', dir]);
  execFileSync('unzip', ['-o', '-q', join(dir, 'cbp.zip'), '-d', dir]);

  const zbpText = readFileSync(join(dir, `zbp${yy}detail.txt`), 'utf8');
  const cbpText = readFileSync(join(dir, `cbp${yy}co.txt`), 'utf8');

  const metros = GEOGRAPHIES.map(({ metroId, geography }) => ({
    metroId,
    geography,
    rows:
      geography.kind === 'zip'
        ? parseZbp(zbpText, geography.code)
        : parseCbp(cbpText, geography.code),
    vintage,
    sourceUrl: geography.kind === 'zip' ? zbpUrl : cbpUrl,
    fetchedAt,
  }));

  for (const m of metros) {
    if (m.rows.length === 0) {
      throw new Error(
        `No rows parsed for ${m.metroId} (${m.geography.label}). Either the geography code is ` +
          `wrong or the ${vintage} file layout moved. Refusing to write an empty TAM.`,
      );
    }
  }

  if (existsSync(OUT)) {
    const prev = JSON.parse(readFileSync(OUT, 'utf8')) as { metros: typeof metros };
    for (const m of metros) {
      const before = prev.metros.find((p) => p.metroId === m.metroId);
      if (!before) continue;
      for (const r of m.rows) {
        const b = before.rows.find((x) => x.naics === r.naics);
        if (b && b.establishments !== r.establishments) {
          console.log(`  CHANGED ${m.metroId} ${r.naics}: ${b.establishments} -> ${r.establishments}`);
        }
      }
    }
  }

  writeFileSync(OUT, JSON.stringify({ generatedAt: fetchedAt, metros }, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT} (${metros.length} metros, vintage ${vintage}).`);
}

void main();
```

Note: `createGunzip` is imported above but unused — delete that import line before committing, or ESLint/tsc will flag it.

- [ ] **Step 6: Add the script and generate the snapshot**

Add to `package.json` `scripts`, next to `model:doc`:

```json
"model:tam": "npx tsx scripts/fetch-census-tam.ts",
```

Run: `npm run model:tam`
Expected: prints a vintage, writes `src/pitch/model/censusTam.json`, reports 3 metros.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/pitch/model/censusTam.test.ts`
Expected: PASS.

If the Hoboken assertion fails because the newest vintage moved the counts, that is the script working. Update the expected numbers in the test to the new vintage's values in the same commit, and note the vintage in the commit message.

- [ ] **Step 8: Commit**

```bash
git add src/pitch/model/censusTam.ts src/pitch/model/censusTam.test.ts \
        src/pitch/model/censusTam.json scripts/fetch-census-tam.ts package.json tsconfig.app.json
git commit -m "Census TAM loader, with suppression treated as unknown rather than zero"
```

---

### Task 2: Metro registry

**Files:**
- Create: `src/pitch/model/metros.ts`
- Create: `src/pitch/model/metros.test.ts`

**Interfaces:**
- Consumes: `SizeBucket`, `NaicsRow`, `CensusGeography`, `loadCensusSnapshot`, `snapshotFor`, `bucketSum` from `./censusTam`; `Assumption`, `modeled`, `benchmarked` from `./types`.
- Produces: `ADDRESSABLE_NAICS: readonly string[]`, `ADDRESSABLE_BUCKETS: readonly SizeBucket[]`, `Metro` interface, `METROS: readonly Metro[]`, `MODEL_YEARS: readonly [2026, 2027, 2028]`, `addressableVenues(metroId: string): number`, `totalFoodServiceVenues(metroId: string): number`, `enabledMetros(): readonly Metro[]`, `METRO_ASSUMPTIONS: Readonly<Record<string, Assumption<number>>>`.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/metros.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  METROS,
  MODEL_YEARS,
  ADDRESSABLE_NAICS,
  ADDRESSABLE_BUCKETS,
  addressableVenues,
  totalFoodServiceVenues,
  enabledMetros,
  METRO_ASSUMPTIONS,
} from './metros';
import { findStale, MAX_MEASURED_AGE_DAYS } from './types';

describe('the addressable band', () => {
  // Spec section 4.2. Limited-service is franchised fast food, where social is set at
  // corporate; special food services have no fixed venue to market.
  it('excludes limited-service and special food services', () => {
    expect(ADDRESSABLE_NAICS).not.toContain('722513');
    expect(ADDRESSABLE_NAICS).not.toContain('7223');
    expect([...ADDRESSABLE_NAICS].sort()).toEqual(['722410', '722511', '722515']);
  });

  it('excludes venues under 5 employees and over 49', () => {
    expect([...ADDRESSABLE_BUCKETS].sort()).toEqual(['b10_19', 'b20_49', 'b5_9']);
  });

  // 76 full-service + 19 bars + 25 coffee = 120, read off ZBP 2022 during design.
  it('yields 120 addressable venues in Hoboken against 251 town-wide', () => {
    expect(addressableVenues('hoboken')).toBe(120);
    expect(totalFoodServiceVenues('hoboken')).toBe(251);
  });

  it('never lets the addressable count exceed the town-wide count', () => {
    for (const m of METROS) {
      expect(addressableVenues(m.id), m.id).toBeLessThanOrEqual(totalFoodServiceVenues(m.id));
    }
  });
});

describe('the metro registry', () => {
  it('models exactly 2026, 2027 and 2028', () => {
    expect(MODEL_YEARS).toEqual([2026, 2027, 2028]);
  });

  it('names the three launch metros in rollout order', () => {
    expect(METROS.map((m) => m.id)).toEqual(['hoboken', 'manhattan', 'palm-beach']);
  });

  it('orders launch months by the rollout plan', () => {
    const months = METROS.map((m) => m.launchMonth.value);
    expect(months).toEqual([...months].sort((a, b) => a - b));
    expect(months[0]).toBeGreaterThanOrEqual(1);
    expect(months[months.length - 1]).toBeLessThanOrEqual(36);
  });

  it('ramps penetration monotonically and never past 100%', () => {
    for (const m of METROS) {
      const p = MODEL_YEARS.map((y) => m.penetration[y].value);
      for (const v of p) {
        expect(v, `${m.id}`).toBeGreaterThanOrEqual(0);
        expect(v, `${m.id}`).toBeLessThanOrEqual(1);
      }
      expect(p, `${m.id} penetration must not go backwards`).toEqual([...p].sort((a, b) => a - b));
    }
  });

  // A penetration that implies more customers than venues is the single arithmetic error
  // that would make the whole forecast nonsense, so it gets its own check.
  it('never implies more customers than addressable venues', () => {
    for (const m of METROS) {
      const venues = addressableVenues(m.id);
      for (const y of MODEL_YEARS) {
        expect(Math.round(venues * m.penetration[y].value), `${m.id} ${y}`).toBeLessThanOrEqual(venues);
      }
    }
  });

  it('enables only metros marked enabled', () => {
    expect(enabledMetros().every((m) => m.enabled)).toBe(true);
  });

  it('registers every metro assumption for staleness checking', () => {
    expect(Object.keys(METRO_ASSUMPTIONS).length).toBeGreaterThanOrEqual(METROS.length * 4);
    expect(findStale(METRO_ASSUMPTIONS, new Date(), MAX_MEASURED_AGE_DAYS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pitch/model/metros.test.ts`
Expected: FAIL — `Failed to resolve import "./metros"`.

- [ ] **Step 3: Write the registry**

Create `src/pitch/model/metros.ts`:

```ts
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
    label: 'Palm Beach, FL',
    geography: { kind: 'zip', code: '33480', label: 'Palm Beach, FL' },
    enabled: true,
    launchMonth: modeled({ value: 12, unit: 'month', label: 'Palm Beach launch month', source: ROLLOUT }),
    penetration: {
      2026: modeled({ value: 0, unit: 'fraction', label: 'Palm Beach penetration 2026', source: SOURCE }),
      2027: modeled({ value: 0.10, unit: 'fraction', label: 'Palm Beach penetration 2027', source: SOURCE }),
      2028: modeled({ value: 0.25, unit: 'fraction', label: 'Palm Beach penetration 2028', source: SOURCE }),
    },
  },
];

function metro(metroId: string): Metro {
  const found = METROS.find((m) => m.id === metroId);
  if (!found) throw new Error(`Unknown metro "${metroId}".`);
  return found;
}

/** Venues in the addressable band — the denominator penetration is stated against. */
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

void metro;
```

Delete the `void metro;` line and the `metro()` helper if nothing else ends up using them — they are here only so a later task can look a metro up by id without re-implementing the lookup. Task 3 uses it; keep it and delete the `void`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pitch/model/metros.test.ts`
Expected: PASS.

If `addressableVenues('palm-beach')` throws a suppression error, Palm Beach's ZIP has more than one suppressed bucket in a band NAICS. Do not widen the band to dodge it. Record the range and add the county figure as the upper bound per spec §4.1, then adjust the test to assert the range rather than a point.

- [ ] **Step 5: Commit**

```bash
git add src/pitch/model/metros.ts src/pitch/model/metros.test.ts
git commit -m "Metro registry: Census-derived addressable band, penetration ramps as assumptions"
```

---

### Task 3: Per-metro projection

**Files:**
- Create: `src/pitch/model/metroModel.ts`
- Create: `src/pitch/model/metroModel.test.ts`

**Interfaces:**
- Consumes: `METROS`, `MODEL_YEARS`, `ModelYear`, `addressableVenues` from `./metros`; `TierMix`, `REGISTERED_MIX`, `blendedSubscription`, `blendedTakeRate`, `avgCampaignValue` from `./project`; `MARKET`, `UNIT_ECONOMICS` from `./assumptions`.
- Produces: `MetroYear` interface, `penetrationAtMonth(metroId: string, month: number): number`, `customersAtMonth(metroId: string, month: number): number`, `projectMetroYear(metroId: string, year: ModelYear, mix: TierMix): MetroYear`, `MONTHS_PER_YEAR = 12`.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/metroModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { penetrationAtMonth, customersAtMonth, projectMetroYear } from './metroModel';
import { addressableVenues, MODEL_YEARS } from './metros';
import { REGISTERED_MIX } from './project';

describe('the penetration curve', () => {
  it('is zero before the metro launches', () => {
    // Palm Beach launches month 12.
    expect(penetrationAtMonth('palm-beach', 11)).toBe(0);
    expect(penetrationAtMonth('palm-beach', 1)).toBe(0);
  });

  it('hits the registered penetration exactly at each year end', () => {
    expect(penetrationAtMonth('hoboken', 12)).toBeCloseTo(0.08, 10);
    expect(penetrationAtMonth('hoboken', 24)).toBeCloseTo(0.22, 10);
    expect(penetrationAtMonth('hoboken', 36)).toBeCloseTo(0.35, 10);
  });

  it('rises monotonically across the whole horizon', () => {
    for (const id of ['hoboken', 'manhattan', 'palm-beach']) {
      let prev = -1;
      for (let m = 1; m <= 36; m += 1) {
        const p = penetrationAtMonth(id, m);
        expect(p, `${id} month ${m}`).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    }
  });

  it('interpolates between year ends rather than stepping', () => {
    const mid = penetrationAtMonth('hoboken', 18);
    expect(mid).toBeGreaterThan(0.08);
    expect(mid).toBeLessThan(0.22);
  });
});

describe('customers', () => {
  it('never exceeds the addressable venue count', () => {
    for (let m = 1; m <= 36; m += 1) {
      expect(customersAtMonth('hoboken', m)).toBeLessThanOrEqual(addressableVenues('hoboken'));
    }
  });
});

describe('projectMetroYear', () => {
  const mix = REGISTERED_MIX;

  it('produces no revenue for a metro that has not launched', () => {
    const y = projectMetroYear('palm-beach', 2026, mix);
    expect(y.revenue).toBe(0);
    expect(y.customersAtYearEnd).toBe(0);
  });

  it('grows revenue year over year for a launched metro', () => {
    const r = MODEL_YEARS.map((y) => projectMetroYear('hoboken', y, mix).revenue);
    expect(r[1]).toBeGreaterThan(r[0]);
    expect(r[2]).toBeGreaterThan(r[1]);
  });

  it('splits revenue into subscription and take rate that sum to the total', () => {
    const y = projectMetroYear('hoboken', 2027, mix);
    expect(y.subscriptionRevenue + y.takeRateRevenue).toBeCloseTo(y.revenue, 6);
  });

  it('charges marketing on gross adds, so a year with churn costs more than net growth', () => {
    const y = projectMetroYear('hoboken', 2027, mix);
    const netAdds = y.customersAtYearEnd - y.customersAtYearStart;
    expect(y.grossAdds).toBeGreaterThan(netAdds);
    expect(y.marketingCost).toBeGreaterThan(0);
  });

  // The three Adrian blocks with no analogue. A future edit that quietly adds a
  // "bonus cost" or "gaming tax" row would be inventing a number to match his shape.
  it('has no bonus, gaming-tax or market-access line', () => {
    const y = projectMetroYear('hoboken', 2027, mix) as unknown as Record<string, unknown>;
    for (const forbidden of ['bonusCost', 'gamingTax', 'marketAccessFee']) {
      expect(Object.keys(y)).not.toContain(forbidden);
    }
  });

  it('reports metro EBITDA as gross profit less marketing', () => {
    const y = projectMetroYear('hoboken', 2028, mix);
    expect(y.metroEbitda).toBeCloseTo(y.grossProfit - y.marketingCost, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pitch/model/metroModel.test.ts`
Expected: FAIL — `Failed to resolve import "./metroModel"`.

- [ ] **Step 3: Write the projection**

Create `src/pitch/model/metroModel.ts`:

```ts
/**
 * One metro, one year. Pure — no dates, no I/O.
 *
 * Adrian's per-state sheet computes revenue as market size times market share, then walks a
 * cost stack down to a local EBITDA. This is the same walk with our own rows. Three of his
 * blocks have no analogue here and are omitted rather than stubbed: promotional bonus costs
 * (we discount nothing), statutory gaming tax, and market-access fees to a licence holder.
 *
 * Revenue is summed MONTHLY rather than computed off an annual average, because a metro that
 * launches mid-year earns nothing for the months before it opens and an annual figure hides
 * that. Hoboken launches in month 1 and Palm Beach in month 12, so the difference is real.
 */
import { MODEL_YEARS, METROS, addressableVenues, type ModelYear } from './metros';
import {
  avgCampaignValue,
  blendedSubscription,
  blendedTakeRate,
  type TierMix,
} from './project';
import { MARKET, UNIT_ECONOMICS } from './assumptions';

export const MONTHS_PER_YEAR = 12;

export interface MetroYear {
  readonly metroId: string;
  readonly year: ModelYear;
  readonly addressableVenues: number;
  readonly penetrationAtYearEnd: number;
  readonly customersAtYearStart: number;
  readonly customersAtYearEnd: number;
  /** New customers signed during the year, including replacements for churn. */
  readonly grossAdds: number;
  readonly campaigns: number;
  readonly gmv: number;
  readonly subscriptionRevenue: number;
  readonly takeRateRevenue: number;
  readonly revenue: number;
  readonly stripeCost: number;
  readonly serveCost: number;
  readonly costOfRevenue: number;
  readonly grossProfit: number;
  readonly marketingCost: number;
  readonly metroEbitda: number;
}

function metroById(metroId: string) {
  const found = METROS.find((m) => m.id === metroId);
  if (!found) throw new Error(`Unknown metro "${metroId}".`);
  return found;
}

/**
 * Penetration at an absolute month, interpolated linearly between the registered year-end
 * anchors. Zero before launch. A metro launching after a year end simply has no anchor
 * there, so the ramp starts from its launch month to the next anchor it does have.
 */
export function penetrationAtMonth(metroId: string, month: number): number {
  const m = metroById(metroId);
  const launch = m.launchMonth.value;
  if (month < launch) return 0;

  const anchors: Array<{ month: number; pen: number }> = [{ month: launch, pen: 0 }];
  MODEL_YEARS.forEach((y, i) => {
    const anchorMonth = (i + 1) * MONTHS_PER_YEAR;
    if (anchorMonth > launch) anchors.push({ month: anchorMonth, pen: m.penetration[y].value });
  });

  if (month >= anchors[anchors.length - 1].month) return anchors[anchors.length - 1].pen;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (month >= a.month && month <= b.month) {
      const span = b.month - a.month;
      if (span === 0) return b.pen;
      return a.pen + ((month - a.month) / span) * (b.pen - a.pen);
    }
  }
  return 0;
}

export function customersAtMonth(metroId: string, month: number): number {
  return Math.round(addressableVenues(metroId) * penetrationAtMonth(metroId, month));
}

export function projectMetroYear(metroId: string, year: ModelYear, mix: TierMix): MetroYear {
  const yearIndex = MODEL_YEARS.indexOf(year);
  if (yearIndex < 0) throw new Error(`Year ${year} is outside the model horizon.`);

  const firstMonth = yearIndex * MONTHS_PER_YEAR + 1;
  const lastMonth = firstMonth + MONTHS_PER_YEAR - 1;

  const customersAtYearStart = customersAtMonth(metroId, firstMonth - 1 || 0);
  const customersAtYearEnd = customersAtMonth(metroId, lastMonth);

  const subPerCustomer = blendedSubscription(mix);
  const takeRate = blendedTakeRate(mix);
  const campaignValue = avgCampaignValue();
  const campaignsPerCustomer = MARKET.campaignsPerRestaurantPerMonth.value;

  let campaigns = 0;
  let gmv = 0;
  let subscriptionRevenue = 0;
  let customerMonths = 0;

  for (let month = firstMonth; month <= lastMonth; month += 1) {
    const customers = customersAtMonth(metroId, month);
    const monthCampaigns = customers * campaignsPerCustomer;
    campaigns += monthCampaigns;
    gmv += monthCampaigns * campaignValue;
    subscriptionRevenue += customers * subPerCustomer;
    customerMonths += customers;
  }

  const takeRateRevenue = gmv * takeRate;
  const revenue = subscriptionRevenue + takeRateRevenue;

  // Stripe is charged on the full amount moving through the platform and recovered inside
  // the take rate, so it is a cost of revenue rather than an infrastructure line.
  const stripeCost =
    gmv * UNIT_ECONOMICS.stripePctFee.value + campaigns * UNIT_ECONOMICS.stripeFixedFee.value;
  const serveCost =
    customerMonths *
    (UNIT_ECONOMICS.aiCostPerCustomerMonth.value + UNIT_ECONOMICS.infraCostPerCustomerMonth.value);
  const costOfRevenue = stripeCost + serveCost;
  const grossProfit = revenue - costOfRevenue;

  // Marketing is charged on GROSS adds, not net growth. A customer who churns and is
  // replaced costs a second CAC, and a model that charges only net growth understates
  // marketing by exactly the churn rate — which is the number the kill-switch watches.
  const monthlyChurn = UNIT_ECONOMICS.monthlyChurn.value;
  let churned = 0;
  for (let month = firstMonth; month <= lastMonth; month += 1) {
    churned += customersAtMonth(metroId, month - 1) * monthlyChurn;
  }
  const grossAdds = Math.max(0, customersAtYearEnd - customersAtYearStart + churned);
  const cac = (UNIT_ECONOMICS.restaurantCacLow.value + UNIT_ECONOMICS.restaurantCacHigh.value) / 2;
  const marketingCost = grossAdds * cac;

  return {
    metroId,
    year,
    addressableVenues: addressableVenues(metroId),
    penetrationAtYearEnd: penetrationAtMonth(metroId, lastMonth),
    customersAtYearStart,
    customersAtYearEnd,
    grossAdds,
    campaigns,
    gmv,
    subscriptionRevenue,
    takeRateRevenue,
    revenue,
    stripeCost,
    serveCost,
    costOfRevenue,
    grossProfit,
    marketingCost,
    metroEbitda: grossProfit - marketingCost,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pitch/model/metroModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pitch/model/metroModel.ts src/pitch/model/metroModel.test.ts
git commit -m "Per-metro yearly projection, summed monthly so a mid-year launch is honest"
```

---

### Task 4: Rollup, shared-cost allocation, and the later-metro cohort

**Files:**
- Create: `src/pitch/model/rollup.ts`
- Create: `src/pitch/model/rollup.test.ts`

**Interfaces:**
- Consumes: `MetroYear`, `projectMetroYear` from `./metroModel`; `METROS`, `MODEL_YEARS`, `ModelYear`, `enabledMetros` from `./metros`; `TierMix`, `REGISTERED_MIX` from `./project`; `threeYearTrajectory` from `./derive`; `PRE_SEED_BUDGET`, `budgetTotal` from `./confidential`.
- Produces: `COHORT_METRO_COUNTS: Readonly<Record<ModelYear, Assumption<number>>>`, `SharedCostAllocation`, `RollupYear`, `allocateSharedCost(metros: readonly MetroYear[], total: number): SharedCostAllocation[]`, `sharedCostForYear(year: ModelYear): number`, `cohortMetroYear(year: ModelYear, mix: TierMix): MetroYear`, `rollup(mix?: TierMix): RollupYear[]`, `COHORT_METRO_ID = 'cohort'`.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/rollup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  rollup,
  allocateSharedCost,
  sharedCostForYear,
  cohortMetroYear,
  COHORT_METRO_ID,
  COHORT_METRO_COUNTS,
} from './rollup';
import { projectMetroYear } from './metroModel';
import { MODEL_YEARS } from './metros';
import { REGISTERED_MIX } from './project';

describe('shared cost allocation', () => {
  const fake = (metroId: string, revenue: number) =>
    ({ metroId, revenue } as Parameters<typeof allocateSharedCost>[0][number]);

  it('allocates in proportion to revenue', () => {
    const out = allocateSharedCost([fake('a', 300), fake('b', 100)], 400);
    expect(out.find((o) => o.metroId === 'a')?.amount).toBeCloseTo(300, 6);
    expect(out.find((o) => o.metroId === 'b')?.amount).toBeCloseTo(100, 6);
  });

  // A forced control: if the allocator silently normalised or dropped a metro, this fails.
  it('allocates exactly 100% of the shared cost', () => {
    const out = allocateSharedCost([fake('a', 7), fake('b', 11), fake('c', 3)], 1000);
    expect(out.reduce((s, o) => s + o.amount, 0)).toBeCloseTo(1000, 6);
    expect(out.reduce((s, o) => s + o.share, 0)).toBeCloseTo(1, 9);
  });

  it('splits evenly when no metro has revenue yet, rather than dividing by zero', () => {
    const out = allocateSharedCost([fake('a', 0), fake('b', 0)], 500);
    expect(out.map((o) => o.amount)).toEqual([250, 250]);
  });
});

describe('the later-metro cohort', () => {
  it('has a metro count per year that never goes backwards', () => {
    const counts = MODEL_YEARS.map((y) => COHORT_METRO_COUNTS[y].value);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('contributes nothing in 2026, when no fourth metro is open', () => {
    expect(cohortMetroYear(2026, REGISTERED_MIX).revenue).toBe(0);
  });

  it('scales a single average metro by the cohort count', () => {
    const one = cohortMetroYear(2028, REGISTERED_MIX);
    expect(one.metroId).toBe(COHORT_METRO_ID);
    expect(one.revenue).toBeGreaterThan(0);
  });
});

describe('rollup', () => {
  const years = rollup(REGISTERED_MIX);

  it('covers 2026, 2027 and 2028', () => {
    expect(years.map((y) => y.year)).toEqual([...MODEL_YEARS]);
  });

  it('sums revenue across the metros it reports', () => {
    for (const y of years) {
      expect(y.revenue).toBeCloseTo(
        y.metros.reduce((s, m) => s + m.revenue, 0),
        6,
      );
    }
  });

  // Adrian's YES/NO toggle, tested at the model layer rather than in the sheet.
  it('excludes a disabled metro entirely', () => {
    for (const y of years) {
      expect(y.metros.some((m) => m.metroId === 'hoboken')).toBe(true);
    }
    const withoutHoboken = rollup(REGISTERED_MIX, ['manhattan', 'palm-beach']);
    for (const y of withoutHoboken) {
      expect(y.metros.some((m) => m.metroId === 'hoboken')).toBe(false);
      expect(y.revenue).toBeLessThan(years.find((x) => x.year === y.year)!.revenue);
    }
  });

  it('reports EBITDA as metro EBITDA less shared cost', () => {
    for (const y of years) {
      const metroEbitda = y.metros.reduce((s, m) => s + m.metroEbitda, 0);
      expect(y.ebitda).toBeCloseTo(metroEbitda - y.sharedCost, 6);
    }
  });

  it('counts metros live as those with a customer at year end', () => {
    for (const y of years) {
      expect(y.metrosLive).toBe(y.metros.filter((m) => m.customersAtYearEnd > 0).length);
    }
  });

  // Spec section 10. This REPORTS the gap; it must never fail on it, because either the
  // top-down band or the bottom-up build could be the wrong one, and a test that forced
  // them together would just be assumption-fitting with extra steps.
  it('carries the top-down cross-check band without asserting agreement', () => {
    for (const y of years) {
      expect(y.topDownRevenueLow).toBeGreaterThan(0);
      expect(y.topDownRevenueHigh).toBeGreaterThan(y.topDownRevenueLow);
      expect(typeof y.bottomUpVsTopDown).toBe('number');
    }
  });

  it('prints the top-down gap so a reviewer sees it', () => {
    const report = years
      .map(
        (y) =>
          `  ${y.year}: bottom-up $${Math.round(y.revenue).toLocaleString()} vs top-down ` +
          `$${y.topDownRevenueLow.toLocaleString()}-$${y.topDownRevenueHigh.toLocaleString()} ` +
          `(${(y.bottomUpVsTopDown * 100).toFixed(0)}% of the band midpoint)`,
      )
      .join('\n');
    console.warn(`Top-down / bottom-up divergence:\n${report}`);
    expect(report.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pitch/model/rollup.test.ts`
Expected: FAIL — `Failed to resolve import "./rollup"`.

- [ ] **Step 3: Write the rollup**

Create `src/pitch/model/rollup.ts`:

```ts
/**
 * Every metro, consolidated. Adrian's `Totals` sheet, as a function.
 *
 * Shared costs (payroll, AI, shared infrastructure) are allocated across metros by revenue
 * share, which is how his USA_Tech_Consolidated_costs sheet feeds each state sheet. Before
 * any metro has revenue the split is even, because a revenue-weighted split of zero is a
 * division by zero, not an allocation.
 *
 * The top-down band from PROJECT_CONTEXT section 3 travels alongside the bottom-up build as
 * a cross-check. They are expected to disagree. See the spec, section 10: the gap is
 * reported and never closed, because tuning penetration until they match is fitting the
 * assumptions to a desired answer.
 */
import { modeled, type Assumption } from './types';
import { MODEL_YEARS, enabledMetros, type ModelYear } from './metros';
import { projectMetroYear, type MetroYear } from './metroModel';
import { REGISTERED_MIX, type TierMix } from './project';
import { threeYearTrajectory } from './derive';
import { PRE_SEED_BUDGET, budgetTotal } from './confidential';

export const COHORT_METRO_ID = 'cohort';

const SOURCE = 'src/pitch/model/rollup.ts';

/**
 * Metros beyond the three named ones. PROJECT_CONTEXT section 3 targets 2-3 metros in Y1,
 * 8-12 in Y2 and 20+ in Y3, but those metros have not been chosen — so they are modeled as
 * a count of average metros rather than as invented named cities.
 */
export const COHORT_METRO_COUNTS: Readonly<Record<ModelYear, Assumption<number>>> = {
  2026: modeled({ value: 0, unit: 'metros', label: 'Additional metros 2026', source: SOURCE }),
  2027: modeled({ value: 6, unit: 'metros', label: 'Additional metros 2027', source: SOURCE }),
  2028: modeled({ value: 17, unit: 'metros', label: 'Additional metros 2028', source: SOURCE }),
};

export interface SharedCostAllocation {
  readonly metroId: string;
  readonly share: number;
  readonly amount: number;
}

export interface RollupYear {
  readonly year: ModelYear;
  readonly metros: readonly MetroYear[];
  readonly revenue: number;
  readonly grossProfit: number;
  readonly marketingCost: number;
  readonly metroEbitda: number;
  readonly sharedCost: number;
  readonly allocations: readonly SharedCostAllocation[];
  readonly ebitda: number;
  readonly metrosLive: number;
  readonly topDownRevenueLow: number;
  readonly topDownRevenueHigh: number;
  /** Bottom-up revenue as a multiple of the top-down band's midpoint. 1.0 means agreement. */
  readonly bottomUpVsTopDown: number;
}

export function allocateSharedCost(
  metros: readonly Pick<MetroYear, 'metroId' | 'revenue'>[],
  total: number,
): SharedCostAllocation[] {
  const revenue = metros.reduce((s, m) => s + m.revenue, 0);
  if (metros.length === 0) return [];
  if (revenue <= 0) {
    const share = 1 / metros.length;
    return metros.map((m) => ({ metroId: m.metroId, share, amount: total * share }));
  }
  return metros.map((m) => {
    const share = m.revenue / revenue;
    return { metroId: m.metroId, share, amount: total * share };
  });
}

/**
 * Shared cost for a year, taken from the pre-seed budget's non-metro lines. Year 1 is the
 * budget's first twelve months; later years hold the run rate of month 12 flat, because the
 * budget horizon is 18 months and extrapolating a hiring plan we have not written would be
 * inventing headcount.
 */
export function sharedCostForYear(year: ModelYear): number {
  const yearIndex = MODEL_YEARS.indexOf(year);
  const firstTwelve = budgetTotal(PRE_SEED_BUDGET, 12);
  if (yearIndex === 0) return firstTwelve;
  const monthTwelveRunRate = PRE_SEED_BUDGET.filter(
    (l) => l.startMonth <= 12 && l.endMonth >= 12,
  ).reduce((s, l) => s + l.monthlyCost, 0);
  return monthTwelveRunRate * 12;
}

/** The later metros, as `count` copies of an average of the named metros' second year. */
export function cohortMetroYear(year: ModelYear, mix: TierMix): MetroYear {
  const count = COHORT_METRO_COUNTS[year].value;
  const named = enabledMetros();
  const template = projectMetroYear(named[0].id, year, mix);

  if (count === 0) {
    return {
      ...template,
      metroId: COHORT_METRO_ID,
      customersAtYearStart: 0,
      customersAtYearEnd: 0,
      grossAdds: 0,
      campaigns: 0,
      gmv: 0,
      subscriptionRevenue: 0,
      takeRateRevenue: 0,
      revenue: 0,
      stripeCost: 0,
      serveCost: 0,
      costOfRevenue: 0,
      grossProfit: 0,
      marketingCost: 0,
      metroEbitda: 0,
    };
  }

  const scale = (v: number) => v * count;
  return {
    ...template,
    metroId: COHORT_METRO_ID,
    customersAtYearStart: scale(template.customersAtYearStart),
    customersAtYearEnd: scale(template.customersAtYearEnd),
    grossAdds: scale(template.grossAdds),
    campaigns: scale(template.campaigns),
    gmv: scale(template.gmv),
    subscriptionRevenue: scale(template.subscriptionRevenue),
    takeRateRevenue: scale(template.takeRateRevenue),
    revenue: scale(template.revenue),
    stripeCost: scale(template.stripeCost),
    serveCost: scale(template.serveCost),
    costOfRevenue: scale(template.costOfRevenue),
    grossProfit: scale(template.grossProfit),
    marketingCost: scale(template.marketingCost),
    metroEbitda: scale(template.metroEbitda),
  };
}

export function rollup(mix: TierMix = REGISTERED_MIX, metroIds?: readonly string[]): RollupYear[] {
  const selected = enabledMetros().filter((m) => !metroIds || metroIds.includes(m.id));
  const topDown = threeYearTrajectory();

  return MODEL_YEARS.map((year, i) => {
    const metros = [
      ...selected.map((m) => projectMetroYear(m.id, year, mix)),
      cohortMetroYear(year, mix),
    ];
    const revenue = metros.reduce((s, m) => s + m.revenue, 0);
    const grossProfit = metros.reduce((s, m) => s + m.grossProfit, 0);
    const marketingCost = metros.reduce((s, m) => s + m.marketingCost, 0);
    const metroEbitda = metros.reduce((s, m) => s + m.metroEbitda, 0);
    const sharedCost = sharedCostForYear(year);
    const band = topDown[i];
    const midpoint = (band.revenueLow + band.revenueHigh) / 2;

    return {
      year,
      metros,
      revenue,
      grossProfit,
      marketingCost,
      metroEbitda,
      sharedCost,
      allocations: allocateSharedCost(metros, sharedCost),
      ebitda: metroEbitda - sharedCost,
      metrosLive: metros.filter((m) => m.customersAtYearEnd > 0).length,
      topDownRevenueLow: band.revenueLow,
      topDownRevenueHigh: band.revenueHigh,
      bottomUpVsTopDown: midpoint === 0 ? 0 : revenue / midpoint,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pitch/model/rollup.test.ts`
Expected: PASS, with the divergence report printed as a warning.

**Read that warning.** It is the finding this build exists to produce. Record the three numbers in the eventual PR description.

- [ ] **Step 5: Commit**

```bash
git add src/pitch/model/rollup.ts src/pitch/model/rollup.test.ts
git commit -m "Rollup with revenue-weighted shared-cost allocation and the top-down cross-check"
```

---

### Task 5: Workbook generator, values only

**Files:**
- Create: `src/pitch/model/workbook.ts`
- Create: `scripts/generate-financial-model-xlsx.ts`
- Modify: `package.json` (add `model:xlsx`, add `exceljs` dev dependency)
- Modify: `.gitignore` (ignore the generated `.xlsx`)

**Interfaces:**
- Consumes: everything from Tasks 1–4, plus `REGISTER` from `./assumptions`, `unitEconomics` from `./derive`, `PRE_SEED_BUDGET`/`budgetTotal`/`preSeedRaise`/`buildFundsAllocation`/`USE_OF_FUNDS_SPLIT`/`PRE_SEED_HORIZON_MONTHS` from `./confidential`.
- Produces: `SheetSpec { name: string; rows: readonly CellRow[] }`, `CellRow = readonly Cell[]`, `Cell = { v: string | number | null; f?: string; name?: string; fmt?: string }`, `buildWorkbookSpec(opts: { confidential: boolean }): readonly SheetSpec[]`, `SHEET_ORDER: readonly string[]`, `FINANCING_SHEET = 'Financing'`.

Building the sheet **spec** as plain data, separate from writing it with `exceljs`, is what lets Task 6 walk every cell in a test without opening a binary file.

- [ ] **Step 1: Install exceljs**

Run: `npm install --save-dev exceljs@4.4.0`
Expected: added to `devDependencies`.

- [ ] **Step 2: Write the failing test**

Create `src/pitch/model/workbook.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildWorkbookSpec, SHEET_ORDER, FINANCING_SHEET } from './workbook';
import { REGISTER } from './assumptions';
import { METRO_ASSUMPTIONS } from './metros';

describe('the workbook spec', () => {
  const confidential = buildWorkbookSpec({ confidential: true });

  it('emits every sheet in the documented order', () => {
    expect(confidential.map((s) => s.name)).toEqual([...SHEET_ORDER]);
  });

  it('gives the Assumptions sheet a row per registered assumption', () => {
    const sheet = confidential.find((s) => s.name === 'Assumptions')!;
    const expected = Object.keys(REGISTER).length + Object.keys(METRO_ASSUMPTIONS).length;
    // Header row plus one per assumption, plus the cohort counts.
    expect(sheet.rows.length).toBeGreaterThanOrEqual(expected + 1);
  });

  it('records provenance and a source for every assumption row', () => {
    const sheet = confidential.find((s) => s.name === 'Assumptions')!;
    for (const row of sheet.rows.slice(1)) {
      const provenance = row[3]?.v;
      const source = row[4]?.v;
      expect(['MEASURED', 'BENCHMARKED', 'MODELED']).toContain(provenance);
      expect(String(source).length).toBeGreaterThan(8);
    }
  });

  it('names the Census vintage and URL on the Sources sheet', () => {
    const sheet = confidential.find((s) => s.name === 'Sources')!;
    const text = sheet.rows.flat().map((c) => String(c.v ?? '')).join(' ');
    expect(text).toMatch(/www2\.census\.gov/);
    expect(text).toMatch(/722511/);
  });

  // Spec section 5. A reader comparing the two workbooks must not be left wondering
  // whether we forgot these rows.
  it('states which of Adrian’s blocks were omitted, and why', () => {
    const sheet = confidential.find((s) => s.name === 'Sources')!;
    const text = sheet.rows.flat().map((c) => String(c.v ?? '')).join(' ').toLowerCase();
    for (const omitted of ['bonus', 'gaming tax', 'market access']) {
      expect(text).toContain(omitted);
    }
  });

  it('shows the addressable count beside the town-wide count on each metro sheet', () => {
    const sheet = confidential.find((s) => s.name === 'Hoboken_Model')!;
    const text = sheet.rows.flat().map((c) => String(c.v ?? '')).join(' ');
    expect(text).toMatch(/Addressable venues/);
    expect(text).toMatch(/food service/i);
  });

  it('omits the Financing sheet from a public build', () => {
    const publicSpec = buildWorkbookSpec({ confidential: false });
    expect(publicSpec.map((s) => s.name)).not.toContain(FINANCING_SHEET);
    expect(confidential.map((s) => s.name)).toContain(FINANCING_SHEET);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/pitch/model/workbook.test.ts`
Expected: FAIL — `Failed to resolve import "./workbook"`.

- [ ] **Step 4: Write the workbook spec builder**

Create `src/pitch/model/workbook.ts`. Build it as plain data — no `exceljs` import in this file, which is what keeps it testable and keeps the binary writer replaceable.

```ts
/**
 * The workbook, as data. `exceljs` never appears here — the writer is a separate script.
 *
 * Keeping the sheet contents as plain cells means a test can walk every cell and assert
 * that no number arrived without provenance (see workbookProvenance.test.ts), which is the
 * control that turns "no made-up numbers" from a promise into a failing build.
 */
import { REGISTER } from './assumptions';
import { METRO_ASSUMPTIONS, METROS, MODEL_YEARS, addressableVenues, totalFoodServiceVenues,
         ADDRESSABLE_NAICS, ADDRESSABLE_BUCKETS, enabledMetros } from './metros';
import { loadCensusSnapshot, snapshotFor } from './censusTam';
import { projectMetroYear } from './metroModel';
import { rollup, COHORT_METRO_COUNTS, sharedCostForYear } from './rollup';
import { REGISTERED_MIX } from './project';
import { unitEconomics } from './derive';
import { PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS, budgetTotal, preSeedRaise,
         buildFundsAllocation, USE_OF_FUNDS_SPLIT } from './confidential';
import type { Assumption } from './types';

export interface Cell {
  readonly v: string | number | null;
  /** Excel formula, without the leading `=`. Task 7 fills these in. */
  readonly f?: string;
  /** Defined name for this cell, so formulas elsewhere can reference it by name. */
  readonly name?: string;
  /** Excel number format, e.g. `'$#,##0'` or `'0.0%'`. */
  readonly fmt?: string;
}

export type CellRow = readonly Cell[];

export interface SheetSpec {
  readonly name: string;
  readonly rows: readonly CellRow[];
}

export const FINANCING_SHEET = 'Financing';

export const SHEET_ORDER = [
  'README',
  'Assumptions',
  'Sources',
  'Hoboken_Model',
  'Manhattan_Model',
  'PalmBeach_Model',
  'Metros_4toN',
  'Shared_Costs',
  'Totals',
  'Unit_Economics',
  FINANCING_SHEET,
] as const;

const t = (v: string): Cell => ({ v });
const n = (v: number, fmt = '$#,##0'): Cell => ({ v, fmt });
const pct = (v: number): Cell => ({ v, fmt: '0.0%' });
const blank: Cell = { v: null };

const SHEET_BY_METRO: Readonly<Record<string, string>> = {
  hoboken: 'Hoboken_Model',
  manhattan: 'Manhattan_Model',
  'palm-beach': 'PalmBeach_Model',
};

function assumptionRows(): CellRow[] {
  const all: Array<[string, Assumption<number>]> = [
    ...Object.entries(REGISTER),
    ...Object.entries(METRO_ASSUMPTIONS),
    ...MODEL_YEARS.map((y) => [`cohortMetros_${y}`, COHORT_METRO_COUNTS[y]] as [string, Assumption<number>]),
  ];
  return all.map(([key, a]) => [
    t(key),
    t(a.label),
    { v: a.value, name: `asm_${key}` },
    t(a.provenance),
    t(a.source),
    t(a.provenance === 'MEASURED' ? a.asOf : ''),
    t(a.unit),
    t(a.note ?? ''),
  ]);
}

function readmeSheet(): SheetSpec {
  return {
    name: 'README',
    rows: [
      [t('DragonCandy — three-year financial model')],
      [t('Generated by `npm run model:xlsx`. Do not edit by hand; the next run overwrites it.')],
      [blank],
      [t('Every input lives on the Assumptions sheet as a named cell. Change one and the')],
      [t('metro sheets, the Totals rollup and every ratio reflow. Nothing else holds a raw number.')],
      [blank],
      [t('Provenance: MEASURED = read off production, an invoice or the codebase on the stated')],
      [t('date, with the command that re-reads it. BENCHMARKED = an external comparable, with a')],
      [t('URL. MODELED = ours, with the driver named. See the Assumptions and Sources sheets.')],
      [blank],
      [t('Toggle a metro in or out with the YES/NO cells on Totals.')],
    ],
  };
}

function sourcesSheet(): SheetSpec {
  const snap = loadCensusSnapshot();
  const rows: CellRow[] = [
    [t('Sources')],
    [blank],
    [t('Market size — US Census Business Patterns')],
    [t('NAICS in the addressable band'), t(ADDRESSABLE_NAICS.join(', '))],
    [t('Employment-size buckets'), t(ADDRESSABLE_BUCKETS.join(', '))],
    [t('Excluded: 722513 limited-service'), t('franchised fast food — social is set at corporate, not by the location')],
    [t('Excluded: 7223 special food services'), t('catering and food trucks — no fixed venue to market')],
    [t('Excluded: under 5 employees'), t('below the $149 entry tier’s plausible budget')],
    [t('Excluded: 50+ employees'), t('has, or is owned by someone who has, a marketing function')],
    [blank],
  ];
  for (const m of snap.metros) {
    rows.push([t(m.metroId), t(m.geography.label), t(`vintage ${m.vintage}`), t(m.sourceUrl), t(`fetched ${m.fetchedAt}`)]);
  }
  rows.push(
    [blank],
    [t('Census suppression')],
    [t('Cells marked "N" are suppressed to protect respondent confidentiality. They are treated')],
    [t('as unknown, never as zero. A bucket forced by the establishment total is recovered as')],
    [t('the residual; where more than one is suppressed the model states a range.')],
    [blank],
    [t('Rows in Adrian’s model that are OMITTED here, deliberately')],
    [t('Bonus costs'), t('no analogue — DragonCandy discounts nothing')],
    [t('Statutory gaming tax'), t('no analogue — not a gaming business')],
    [t('Market access fees'), t('no analogue — no licence holder takes a share')],
    [t('A row shaped like his but filled with an invented number would be worse than its absence.')],
    [blank],
    [t('Every other number traces to the Assumptions sheet, which carries its provenance and source.')],
  );
  return { name: 'Sources', rows };
}

function metroSheet(metroId: string): SheetSpec {
  const snap = snapshotFor(loadCensusSnapshot(), metroId);
  const years = MODEL_YEARS.map((y) => projectMetroYear(metroId, y, REGISTERED_MIX));
  const label = METROS.find((m) => m.id === metroId)!.label;

  const line = (name: string, pick: (y: (typeof years)[number]) => number, fmt?: string): CellRow => [
    t(name),
    ...years.map((y) => (fmt === '0.0%' ? pct(pick(y)) : n(pick(y), fmt))),
  ];

  return {
    name: SHEET_BY_METRO[metroId],
    rows: [
      [t(label), ...MODEL_YEARS.map((y) => t(String(y)))],
      [t(`${snap.geography.label} — Census ${snap.vintage}`)],
      [blank],
      [t('Market')],
      [t('Total food service venues'), ...years.map(() => n(totalFoodServiceVenues(metroId), '#,##0'))],
      [t('Addressable venues'), ...years.map(() => n(addressableVenues(metroId), '#,##0'))],
      line('Penetration of addressable', (y) => y.penetrationAtYearEnd, '0.0%'),
      line('Customers at year end', (y) => y.customersAtYearEnd, '#,##0'),
      line('Gross adds (incl. churn replacement)', (y) => y.grossAdds, '#,##0'),
      [blank],
      [t('Revenue')],
      line('Campaigns', (y) => y.campaigns, '#,##0'),
      line('GMV', (y) => y.gmv),
      line('Subscription revenue', (y) => y.subscriptionRevenue),
      line('Take-rate revenue', (y) => y.takeRateRevenue),
      line('Total revenue', (y) => y.revenue),
      [blank],
      [t('Cost of revenue')],
      line('Stripe fees', (y) => -y.stripeCost),
      line('AI and infrastructure', (y) => -y.serveCost),
      line('Total cost of revenue', (y) => -y.costOfRevenue),
      line('Gross profit', (y) => y.grossProfit),
      [blank],
      [t('Marketing')],
      line('Acquisition marketing', (y) => -y.marketingCost),
      [blank],
      [t('Metro EBITDA'), ...years.map((y) => n(y.metroEbitda))],
      [blank],
      [t('KPIs')],
      line('Gross margin', (y) => (y.revenue === 0 ? 0 : y.grossProfit / y.revenue), '0.0%'),
      line('Marketing as % of revenue', (y) => (y.revenue === 0 ? 0 : y.marketingCost / y.revenue), '0.0%'),
      line('Cost of revenue as % of revenue', (y) => (y.revenue === 0 ? 0 : y.costOfRevenue / y.revenue), '0.0%'),
    ],
  };
}

function cohortSheet(): SheetSpec {
  const years = rollup().map((r) => r.metros.find((m) => m.metroId === 'cohort')!);
  return {
    name: 'Metros_4toN',
    rows: [
      [t('Metros beyond the three named'), ...MODEL_YEARS.map((y) => t(String(y)))],
      [t('These metros have not been chosen. Modeled as N copies of an average metro rather')],
      [t('than as invented named cities. Change the count on the Assumptions sheet.')],
      [blank],
      [t('Metros in cohort'), ...MODEL_YEARS.map((y) => n(COHORT_METRO_COUNTS[y].value, '#,##0'))],
      [t('Customers at year end'), ...years.map((y) => n(y.customersAtYearEnd, '#,##0'))],
      [t('Revenue'), ...years.map((y) => n(y.revenue))],
      [t('Gross profit'), ...years.map((y) => n(y.grossProfit))],
      [t('Marketing'), ...years.map((y) => n(-y.marketingCost))],
      [t('Metro EBITDA'), ...years.map((y) => n(y.metroEbitda))],
    ],
  };
}

function sharedCostsSheet(): SheetSpec {
  const years = rollup();
  const rows: CellRow[] = [
    [t('Shared costs'), ...MODEL_YEARS.map((y) => t(String(y)))],
    [t('Payroll, AI and shared infrastructure, allocated across metros by revenue share.')],
    [t('Before any metro has revenue the split is even — a revenue-weighted split of zero')],
    [t('is a division by zero, not an allocation.')],
    [blank],
    [t('Total shared cost'), ...MODEL_YEARS.map((y) => n(sharedCostForYear(y)))],
    [blank],
    [t('Allocation')],
  ];
  const metroIds = years[0].allocations.map((a) => a.metroId);
  for (const id of metroIds) {
    rows.push([
      t(id),
      ...years.map((y) => n(y.allocations.find((a) => a.metroId === id)?.amount ?? 0)),
    ]);
  }
  return { name: 'Shared_Costs', rows };
}

function totalsSheet(): SheetSpec {
  const years = rollup();
  const metroIds = years[0].metros.map((m) => m.metroId);
  const rows: CellRow[] = [
    [t('Consolidated'), t('Include?'), ...MODEL_YEARS.map((y) => t(String(y)))],
    [blank],
    [t('Revenue by metro')],
  ];
  for (const id of metroIds) {
    rows.push([
      t(id),
      t('YES'),
      ...years.map((y) => n(y.metros.find((m) => m.metroId === id)?.revenue ?? 0)),
    ]);
  }
  rows.push(
    [blank],
    [t('Total revenue'), blank, ...years.map((y) => n(y.revenue))],
    [t('Metro EBITDA'), blank, ...years.map((y) => n(y.metroEbitda))],
    [t('Shared cost'), blank, ...years.map((y) => n(-y.sharedCost))],
    [t('EBITDA'), blank, ...years.map((y) => n(y.ebitda))],
    [t('Metros live'), blank, ...years.map((y) => n(y.metrosLive, '#,##0'))],
    [blank],
    [t('Cross-check — PROJECT_CONTEXT section 3 top-down band')],
    [t('Top-down revenue, low'), blank, ...years.map((y) => n(y.topDownRevenueLow))],
    [t('Top-down revenue, high'), blank, ...years.map((y) => n(y.topDownRevenueHigh))],
    [t('Bottom-up as a multiple of the band midpoint'), blank, ...years.map((y) => ({ v: y.bottomUpVsTopDown, fmt: '0.00x' }))],
    [t('These are expected to disagree. The band was asserted top-down; this model is built')],
    [t('bottom-up from Census venue counts. Neither has been tuned to match the other.')],
  );
  return { name: 'Totals', rows };
}

function unitEconomicsSheet(): SheetSpec {
  const u = unitEconomics(REGISTERED_MIX);
  return {
    name: 'Unit_Economics',
    rows: [
      [t('Unit economics'), t('Value')],
      [t('Gross profit per business per month'), n(u.grossProfitPerBusinessPerMonth, '$#,##0.00')],
      [t('Customer lifetime (months)'), n(u.customerLifetimeMonths, '#,##0.0')],
      [t('LTV'), n(u.ltv)],
      [t('LTV:CAC at low CAC'), { v: u.ltvToCacAtCacLow, fmt: '0.00x' }],
      [t('LTV:CAC at high CAC'), { v: u.ltvToCacAtCacHigh, fmt: '0.00x' }],
      [t('CAC payback at low CAC (months)'), n(u.cacPaybackMonthsAtCacLow, '#,##0.0')],
      [t('CAC payback at high CAC (months)'), n(u.cacPaybackMonthsAtCacHigh, '#,##0.0')],
      [blank],
      [t('CAC is MODELED, not measured — the source states it as a target and DragonCandy has')],
      [t('never acquired a paying customer. This is a projection measured against a projection.')],
    ],
  };
}

function financingSheet(): SheetSpec {
  const total = budgetTotal(PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS);
  const raise = preSeedRaise();
  const allocation = buildFundsAllocation();
  const rows: CellRow[] = [
    [t('Financing — CONFIDENTIAL'), t('Amount')],
    [blank],
    [t('Pre-seed budget')],
  ];
  for (const line of PRE_SEED_BUDGET) {
    rows.push([
      t(line.label),
      n(line.monthlyCost, '$#,##0'),
      t(`months ${line.startMonth}–${line.endMonth}`),
    ]);
  }
  rows.push(
    [blank],
    [t(`Total over ${PRE_SEED_HORIZON_MONTHS} months`), n(total)],
    [t('Raise'), n(typeof raise === 'number' ? raise : (raise as { amount: number }).amount)],
    [blank],
    [t('Use of funds')],
  );
  for (const [key, share] of Object.entries(USE_OF_FUNDS_SPLIT)) {
    const amount = allocation.find((a) => a.key === key)?.amount;
    rows.push([t(key), { v: share, fmt: '0%' }, n(amount ?? 0)]);
  }
  rows.push(
    [blank],
    [t('SAFE terms — cap, discount, MFN — are a founder decision, not a derivation, and are')],
    [t('deliberately absent. Launch event budget is blocked on launchEventPlan in deck/pending.ts.')],
  );
  return { name: FINANCING_SHEET, rows };
}

export function buildWorkbookSpec({ confidential }: { confidential: boolean }): readonly SheetSpec[] {
  const sheets: SheetSpec[] = [
    readmeSheet(),
    { name: 'Assumptions', rows: [
      [t('key'), t('label'), t('value'), t('provenance'), t('source'), t('as of'), t('unit'), t('note')],
      ...assumptionRows(),
    ] },
    sourcesSheet(),
    ...enabledMetros().map((m) => metroSheet(m.id)),
    cohortSheet(),
    sharedCostsSheet(),
    totalsSheet(),
    unitEconomicsSheet(),
  ];
  if (confidential) sheets.push(financingSheet());
  return sheets;
}
```

`preSeedRaise()` and `buildFundsAllocation()` return shapes defined in `src/pitch/model/confidential.ts` — open that file and match the real return types rather than the defensive `typeof` check above, which is a placeholder for a signature you can read directly.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/pitch/model/workbook.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the xlsx writer**

Create `scripts/generate-financial-model-xlsx.ts`:

```ts
#!/usr/bin/env npx tsx
/**
 * Write the workbook. `npm run model:xlsx [-- --public]`
 *
 * Default is the CONFIDENTIAL build, because that is the one Adrian is getting and a default
 * that silently drops the Financing sheet would ship a redacted model under a full name.
 */
import ExcelJS from 'exceljs';
import { buildWorkbookSpec, FINANCING_SHEET } from '../src/pitch/model/workbook';
import { findStale, MAX_MEASURED_AGE_DAYS } from '../src/pitch/model/types';
import { REGISTER } from '../src/pitch/model/assumptions';
import { METRO_ASSUMPTIONS } from '../src/pitch/model/metros';
import { writeFileSync } from 'node:fs';

const isPublic = process.argv.includes('--public');
const OUT = isPublic
  ? 'dragoncandy-financial-model-public.xlsx'
  : 'dragoncandy-financial-model.xlsx';

const stale = findStale({ ...REGISTER, ...METRO_ASSUMPTIONS }, new Date(), MAX_MEASURED_AGE_DAYS);
if (stale.length > 0) {
  console.error(`${stale.length} measured input(s) are stale. Fix the register, do not bypass:`);
  for (const s of stale) console.error(`  ${s.key} (${s.ageDays}d) — re-read: ${s.source}`);
  process.exit(1);
}

const spec = buildWorkbookSpec({ confidential: !isPublic });

// The guard is on CONTENT, not on the filename — a filename guard is defeated by a rename,
// which is the lesson scripts/upload-pitch-to-drive.ts already records.
if (isPublic && spec.some((s) => s.name === FINANCING_SHEET)) {
  console.error('Refusing to write a public workbook that contains the Financing sheet.');
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
wb.creator = 'DragonCandy';
wb.created = new Date();

for (const sheet of spec) {
  const ws = wb.addWorksheet(sheet.name);
  sheet.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const target = ws.getCell(r + 1, c + 1);
      if (cell.f !== undefined) {
        target.value = { formula: cell.f, result: cell.v as number };
      } else if (cell.v !== null) {
        target.value = cell.v;
      }
      if (cell.fmt) target.numFmt = cell.fmt;
      if (cell.name) wb.definedNames.add(`${sheet.name}!${target.address}`, cell.name);
    });
  });
  ws.getColumn(1).width = 44;
  for (let c = 2; c <= 8; c += 1) ws.getColumn(c).width = 18;
  ws.getRow(1).font = { bold: true };
}

const buffer = await wb.xlsx.writeBuffer();
writeFileSync(OUT, Buffer.from(buffer));

const manifest = {
  file: OUT,
  confidential: !isPublic,
  sheets: spec.map((s) => s.name),
  generatedAt: new Date().toISOString(),
};
writeFileSync(`${OUT}.manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${OUT} (${spec.length} sheets, ${isPublic ? 'public' : 'CONFIDENTIAL'}).`);
```

- [ ] **Step 7: Wire the script and ignore the output**

Add to `package.json` `scripts`:

```json
"model:xlsx": "npx tsx scripts/generate-financial-model-xlsx.ts",
```

Add to `.gitignore`:

```
dragoncandy-financial-model*.xlsx
dragoncandy-financial-model*.xlsx.manifest.json
```

- [ ] **Step 8: Generate and eyeball it**

Run: `npm run model:xlsx`
Expected: writes `dragoncandy-financial-model.xlsx`, reports 11 sheets, CONFIDENTIAL.

Open it. Check the metro sheets carry three year columns, the Totals sheet has YES cells, and the Assumptions sheet has one row per assumption.

- [ ] **Step 9: Commit**

```bash
git add src/pitch/model/workbook.ts src/pitch/model/workbook.test.ts \
        scripts/generate-financial-model-xlsx.ts package.json package-lock.json .gitignore
git commit -m "Workbook generator: eleven sheets, values first, spec kept as plain data"
```

---

### Task 6: The orphan-literal control

**Files:**
- Create: `src/pitch/model/workbookProvenance.test.ts`

**Interfaces:**
- Consumes: `buildWorkbookSpec`, `Cell` from `./workbook`; `REGISTER` from `./assumptions`; `METRO_ASSUMPTIONS` from `./metros`.
- Produces: nothing. This is the control the whole build rests on.

Written now, before formulas exist, so it constrains Task 7 rather than being retrofitted to whatever Task 7 produced.

- [ ] **Step 1: Write the test**

Create `src/pitch/model/workbookProvenance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildWorkbookSpec } from './workbook';
import { REGISTER } from './assumptions';
import { METRO_ASSUMPTIONS } from './metros';
import { COHORT_METRO_COUNTS } from './rollup';
import { rollup } from './rollup';
import { MODEL_YEARS } from './metros';

/**
 * Every number the workbook shows must be traceable: it is either a registered assumption,
 * a value this model computed from registered assumptions, a formula, or a year label.
 *
 * Without this, "no made-up numbers" is a promise. With it, adding an untraceable figure
 * fails the build.
 */
describe('workbook provenance', () => {
  const spec = buildWorkbookSpec({ confidential: true });

  const registeredValues = new Set<number>([
    ...Object.values(REGISTER).map((a) => a.value),
    ...Object.values(METRO_ASSUMPTIONS).map((a) => a.value),
    ...MODEL_YEARS.map((y) => COHORT_METRO_COUNTS[y].value),
  ]);

  // Values this model derives. Collected by walking the rollup rather than by listing them,
  // so a new derived row cannot be forgotten here and pass as an orphan.
  const derivedValues = new Set<number>();
  for (const year of rollup()) {
    for (const k of ['revenue', 'grossProfit', 'marketingCost', 'metroEbitda', 'sharedCost', 'ebitda',
                     'metrosLive', 'topDownRevenueLow', 'topDownRevenueHigh', 'bottomUpVsTopDown'] as const) {
      derivedValues.add(year[k] as number);
      derivedValues.add(-(year[k] as number));
    }
    for (const m of year.metros) {
      for (const v of Object.values(m)) {
        if (typeof v === 'number') {
          derivedValues.add(v);
          derivedValues.add(-v);
        }
      }
    }
    for (const a of year.allocations) {
      derivedValues.add(a.amount);
      derivedValues.add(-a.amount);
    }
  }

  const YEAR_LABELS = new Set<number>(MODEL_YEARS);

  function traceable(value: number): boolean {
    if (Number.isInteger(value) && YEAR_LABELS.has(value)) return true;
    if (registeredValues.has(value) || registeredValues.has(-value)) return true;
    for (const d of derivedValues) {
      if (Math.abs(d - value) < 1e-6) return true;
    }
    return false;
  }

  it('has no numeric cell that is neither a formula, a registered assumption, nor derived', () => {
    const orphans: string[] = [];
    for (const sheet of spec) {
      sheet.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell.f !== undefined) return;
          if (typeof cell.v !== 'number') return;
          if (!traceable(cell.v)) {
            orphans.push(`${sheet.name}!R${r + 1}C${c + 1} = ${cell.v}`);
          }
        });
      });
    }
    expect(
      orphans,
      `${orphans.length} numeric cell(s) have no provenance. Every number in the workbook must ` +
        `come from src/pitch/model/assumptions.ts, src/pitch/model/metros.ts, or a computation ` +
        `over them — or be an Excel formula. Do not add the value to this test to make it pass; ` +
        `register the assumption.\n${orphans.slice(0, 40).join('\n')}`,
    ).toEqual([]);
  });

  // A forced control. If the walker above silently visited nothing, the test would pass
  // while checking zero cells, which is the failure mode that makes a green suite a lie.
  it('actually visits a meaningful number of numeric cells', () => {
    let numeric = 0;
    for (const sheet of spec) {
      for (const row of sheet.rows) {
        for (const cell of row) if (typeof cell.v === 'number') numeric += 1;
      }
    }
    expect(numeric).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/pitch/model/workbookProvenance.test.ts`
Expected: it may FAIL, listing orphan cells.

**Every orphan is a real finding.** Fix it by registering the assumption in `assumptions.ts` or `metros.ts`, or by routing the cell through a derived value. Do **not** add the literal to `registeredValues` — that converts the control into decoration.

- [ ] **Step 3: Re-run until green**

Run: `npx vitest run src/pitch/model/workbookProvenance.test.ts`
Expected: PASS, with the second test confirming over 100 numeric cells were visited.

- [ ] **Step 4: Commit**

```bash
git add src/pitch/model/workbookProvenance.test.ts src/pitch/model/assumptions.ts src/pitch/model/metros.ts src/pitch/model/workbook.ts
git commit -m "Every number in the workbook must trace to a registered assumption"
```

---

### Task 7: Live formulas

**Files:**
- Modify: `src/pitch/model/workbook.ts` (metro sheets, Totals, Shared_Costs)
- Create: `src/pitch/model/formulaEval.ts`
- Create: `src/pitch/model/formulaAgreement.test.ts`

**Interfaces:**
- Consumes: `Cell`, `SheetSpec`, `buildWorkbookSpec` from `./workbook`.
- Produces: `evaluateFormula(formula: string, ctx: FormulaContext): number`, `FormulaContext { names: Record<string, number>; cells: Record<string, number> }`, `collectFormulaContext(spec: readonly SheetSpec[]): FormulaContext`.

The evaluator handles only the subset we emit — `SUM`, `IF`, `+ - * /`, parentheses, numbers, defined names, and `Sheet!A1` references. The subset is small precisely because we choose what to emit.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/formulaAgreement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildWorkbookSpec } from './workbook';
import { evaluateFormula, collectFormulaContext } from './formulaEval';

describe('the formula evaluator', () => {
  const ctx = { names: { asm_a: 10, asm_b: 4 }, cells: { 'Totals!C5': 7, 'Totals!C6': 3 } };

  it('does arithmetic', () => {
    expect(evaluateFormula('2+3*4', ctx)).toBe(14);
    expect(evaluateFormula('(2+3)*4', ctx)).toBe(20);
  });

  it('resolves defined names', () => {
    expect(evaluateFormula('asm_a-asm_b', ctx)).toBe(6);
  });

  it('resolves sheet-qualified cell references', () => {
    expect(evaluateFormula('Totals!C5+Totals!C6', ctx)).toBe(10);
  });

  it('handles SUM over a list', () => {
    expect(evaluateFormula('SUM(asm_a,asm_b,2)', ctx)).toBe(16);
  });

  it('handles IF with a string comparison, which is how the metro toggles work', () => {
    const toggled = { names: {}, cells: { 'Totals!B7': 'YES' as unknown as number, 'Totals!C7': 500 } };
    expect(evaluateFormula('IF(Totals!B7="NO",0,Totals!C7)', toggled)).toBe(500);
    const off = { names: {}, cells: { 'Totals!B7': 'NO' as unknown as number, 'Totals!C7': 500 } };
    expect(evaluateFormula('IF(Totals!B7="NO",0,Totals!C7)', off)).toBe(0);
  });

  it('throws on a function it does not implement rather than guessing', () => {
    expect(() => evaluateFormula('VLOOKUP(1,2,3)', ctx)).toThrow(/VLOOKUP/);
  });
});

/**
 * The workbook is live: Excel and Google Sheets recalculate on open. If a formula and the
 * cached result our TypeScript computed can disagree, the workbook shows one number and
 * becomes another when someone touches it. That is worse than a values-only workbook,
 * because it looks trustworthy.
 */
describe('every formula agrees with its cached result', () => {
  const spec = buildWorkbookSpec({ confidential: true });
  const ctx = collectFormulaContext(spec);

  it('finds formulas to check', () => {
    const count = spec.flatMap((s) => s.rows.flat()).filter((c) => c.f !== undefined).length;
    expect(count, 'Task 7 is not done if there are no formulas').toBeGreaterThan(20);
  });

  it('evaluates each formula to the number the sheet displays', () => {
    const mismatches: string[] = [];
    for (const sheet of spec) {
      sheet.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell.f === undefined) return;
          const cached = cell.v as number;
          let computed: number;
          try {
            computed = evaluateFormula(cell.f, ctx);
          } catch (err) {
            mismatches.push(`${sheet.name}!R${r + 1}C${c + 1}: ${(err as Error).message}`);
            return;
          }
          if (Math.abs(computed - cached) > Math.max(1e-6, Math.abs(cached) * 1e-9)) {
            mismatches.push(
              `${sheet.name}!R${r + 1}C${c + 1}: formula "${cell.f}" gives ${computed}, cache says ${cached}`,
            );
          }
        });
      });
    }
    expect(
      mismatches,
      `${mismatches.length} formula(s) disagree with their cached result. A reader who opens ` +
        `this workbook sees the cache; a reader who edits anything sees the formula.\n` +
        mismatches.slice(0, 30).join('\n'),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pitch/model/formulaAgreement.test.ts`
Expected: FAIL — `Failed to resolve import "./formulaEval"`.

- [ ] **Step 3: Write the evaluator**

Create `src/pitch/model/formulaEval.ts`:

```ts
/**
 * A tiny Excel evaluator, covering exactly the subset the generator emits.
 *
 * It exists to answer one question in a test: does this formula compute the number the
 * workbook displays? A general Excel engine would be a dependency and a liability; this
 * handles `SUM`, `IF`, arithmetic, parentheses, defined names and `Sheet!A1` references,
 * and throws on anything else rather than guessing. If the generator ever needs another
 * function, add it here in the same change — a formula the evaluator cannot read is a
 * formula nothing checks.
 */
import type { SheetSpec } from './workbook';

export interface FormulaContext {
  readonly names: Record<string, number>;
  readonly cells: Record<string, number>;
}

type Token = { kind: 'num'; v: number } | { kind: 'str'; v: string } | { kind: 'op'; v: string }
  | { kind: 'ref'; v: string } | { kind: 'fn'; v: string };

const FUNCTIONS = new Set(['SUM', 'IF', 'MAX', 'MIN']);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      tokens.push({ kind: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new Error(`Unterminated string in "${src}"`);
      tokens.push({ kind: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_!$.]/.test(src[j])) j += 1;
      const word = src.slice(i, j).replace(/\$/g, '');
      if (src[j] === '(' && FUNCTIONS.has(word.toUpperCase())) {
        tokens.push({ kind: 'fn', v: word.toUpperCase() });
      } else if (src[j] === '(') {
        throw new Error(`Unsupported function "${word}" in "${src}". Add it to formulaEval.ts.`);
      } else {
        tokens.push({ kind: 'ref', v: word });
      }
      i = j;
      continue;
    }
    if ('+-*/(),='.includes(ch)) {
      if (ch === '<' || ch === '>') throw new Error(`Unsupported operator in "${src}"`);
      tokens.push({ kind: 'op', v: ch });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in "${src}"`);
  }
  return tokens;
}

export function evaluateFormula(formula: string, ctx: FormulaContext): number {
  const tokens = tokenize(formula.replace(/^=/, ''));
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (v: string) => {
    const t = tokens[pos];
    if (!t || t.kind !== 'op' || t.v !== v) throw new Error(`Expected "${v}" in "${formula}"`);
    pos += 1;
  };

  function resolve(name: string): number | string {
    if (name in ctx.names) return ctx.names[name];
    if (name in ctx.cells) return ctx.cells[name] as number | string;
    throw new Error(`Unknown reference "${name}" in "${formula}"`);
  }

  // A value that may be a string, for IF's comparison. Arithmetic coerces to number.
  function primary(): number | string {
    const t = peek();
    if (!t) throw new Error(`Unexpected end of "${formula}"`);
    if (t.kind === 'num') { pos += 1; return t.v; }
    if (t.kind === 'str') { pos += 1; return t.v; }
    if (t.kind === 'ref') { pos += 1; return resolve(t.v); }
    if (t.kind === 'op' && t.v === '-') { pos += 1; return -Number(primary()); }
    if (t.kind === 'op' && t.v === '(') {
      pos += 1;
      const v = comparison();
      eat(')');
      return v;
    }
    if (t.kind === 'fn') {
      const name = t.v;
      pos += 1;
      eat('(');
      const args: Array<number | string> = [];
      if (!(peek()?.kind === 'op' && peek()?.v === ')')) {
        args.push(comparison());
        while (peek()?.kind === 'op' && peek()?.v === ',') { pos += 1; args.push(comparison()); }
      }
      eat(')');
      if (name === 'SUM') return args.reduce((s: number, a) => s + Number(a), 0);
      if (name === 'MAX') return Math.max(...args.map(Number));
      if (name === 'MIN') return Math.min(...args.map(Number));
      if (name === 'IF') return Number(args[0]) === 1 ? Number(args[1]) : Number(args[2]);
      throw new Error(`Unsupported function "${name}"`);
    }
    throw new Error(`Unexpected token in "${formula}"`);
  }

  function term(): number | string {
    let left = primary();
    while (peek()?.kind === 'op' && (peek()!.v === '*' || peek()!.v === '/')) {
      const op = tokens[pos].v; pos += 1;
      const right = Number(primary());
      left = op === '*' ? Number(left) * right : Number(left) / right;
    }
    return left;
  }

  function sum(): number | string {
    let left = term();
    while (peek()?.kind === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = tokens[pos].v; pos += 1;
      const right = Number(term());
      left = op === '+' ? Number(left) + right : Number(left) - right;
    }
    return left;
  }

  /** `=` compares; the result is 1 or 0 so IF's first argument reads as a boolean. */
  function comparison(): number | string {
    const left = sum();
    if (peek()?.kind === 'op' && peek()!.v === '=') {
      pos += 1;
      const right = sum();
      return String(left) === String(right) ? 1 : 0;
    }
    return left;
  }

  const result = comparison();
  if (pos !== tokens.length) throw new Error(`Trailing tokens in "${formula}"`);
  return Number(result);
}

/** Defined names and cell addresses, read out of the sheet spec. */
export function collectFormulaContext(spec: readonly SheetSpec[]): FormulaContext {
  const names: Record<string, number> = {};
  const cells: Record<string, number> = {};
  const colLetter = (c: number): string => {
    let s = '';
    let x = c;
    while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
    return s;
  };
  for (const sheet of spec) {
    sheet.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const address = `${sheet.name}!${colLetter(c + 1)}${r + 1}`;
        if (cell.v !== null) cells[address] = cell.v as number;
        if (cell.name) names[cell.name] = cell.v as number;
      });
    });
  }
  return { names, cells };
}
```

- [ ] **Step 4: Run the evaluator tests**

Run: `npx vitest run src/pitch/model/formulaAgreement.test.ts -t "the formula evaluator"`
Expected: PASS — six tests.

- [ ] **Step 5: Convert the Totals sheet to formulas**

In `src/pitch/model/workbook.ts`, rewrite `totalsSheet()` so every consolidated figure is a formula over the metro sheets, with Adrian's toggle idiom. Cache the value our TypeScript computed alongside.

Replace the body of `totalsSheet()` with:

```ts
function totalsSheet(): SheetSpec {
  const years = rollup();
  const metroIds = years[0].metros.map((m) => m.metroId);
  const cols = ['C', 'D', 'E'];
  const sheetFor = (id: string) => SHEET_BY_METRO[id] ?? 'Metros_4toN';
  // Row of "Total revenue" on each metro sheet, 1-indexed. Metro sheets and the cohort
  // sheet have different layouts, so this is looked up rather than assumed.
  const REVENUE_ROW: Readonly<Record<string, number>> = { hoboken: 16, manhattan: 16, 'palm-beach': 16, cohort: 7 };

  const rows: CellRow[] = [
    [t('Consolidated'), t('Include?'), ...MODEL_YEARS.map((y) => t(String(y)))],
    [blank],
    [t('Revenue by metro')],
  ];

  const firstMetroRow = rows.length + 1;
  metroIds.forEach((id) => {
    const toggleRow = rows.length + 1;
    rows.push([
      t(id),
      t('YES'),
      ...MODEL_YEARS.map((_, i) => {
        const value = years[i].metros.find((m) => m.metroId === id)?.revenue ?? 0;
        const source = `${sheetFor(id)}!${cols[i]}${REVENUE_ROW[id]}`;
        return { v: value, f: `IF(Totals!B${toggleRow}="NO",0,${source})`, fmt: '$#,##0' };
      }),
    ]);
  });
  const lastMetroRow = rows.length;

  rows.push([blank]);
  const totalRow = rows.length + 1;
  rows.push([
    t('Total revenue'),
    blank,
    ...MODEL_YEARS.map((_, i) => ({
      v: years[i].revenue,
      f: `SUM(${cols[i]}${firstMetroRow}:${cols[i]}${lastMetroRow})`,
      fmt: '$#,##0',
    })),
  ]);

  rows.push(
    [t('Metro EBITDA'), blank, ...years.map((y) => n(y.metroEbitda))],
    [t('Shared cost'), blank, ...years.map((y) => n(-y.sharedCost))],
  );
  const ebitdaSourceRows = [rows.length - 1, rows.length];
  rows.push([
    t('EBITDA'),
    blank,
    ...MODEL_YEARS.map((_, i) => ({
      v: years[i].ebitda,
      f: `${cols[i]}${ebitdaSourceRows[0]}+${cols[i]}${ebitdaSourceRows[1]}`,
      fmt: '$#,##0',
    })),
  ]);
  rows.push(
    [t('Metros live'), blank, ...years.map((y) => n(y.metrosLive, '#,##0'))],
    [blank],
    [t('Cross-check — PROJECT_CONTEXT section 3 top-down band')],
    [t('Top-down revenue, low'), blank, ...years.map((y) => n(y.topDownRevenueLow))],
    [t('Top-down revenue, high'), blank, ...years.map((y) => n(y.topDownRevenueHigh))],
  );
  const lowRow = rows.length - 1;
  const highRow = rows.length;
  rows.push([
    t('Bottom-up as a multiple of the band midpoint'),
    blank,
    ...MODEL_YEARS.map((_, i) => ({
      v: years[i].bottomUpVsTopDown,
      f: `${cols[i]}${totalRow}/((${cols[i]}${lowRow}+${cols[i]}${highRow})/2)`,
      fmt: '0.00x',
    })),
  ]);
  rows.push(
    [t('These are expected to disagree. The band was asserted top-down; this model is built')],
    [t('bottom-up from Census venue counts. Neither has been tuned to match the other.')],
  );
  return { name: 'Totals', rows };
}
```

`REVENUE_ROW` must match the actual row index of "Total revenue" on each metro sheet. Count the rows in `metroSheet()` — do not guess. If you move a row in `metroSheet()`, the agreement test in Step 7 catches it.

- [ ] **Step 6: Convert the metro sheets' derived rows to formulas**

In `metroSheet()`, make the rows that are arithmetic over other rows into formulas, caching the computed value:
- `Total revenue` = `Subscription revenue + Take-rate revenue`
- `Total cost of revenue` = `Stripe fees + AI and infrastructure`
- `Gross profit` = `Total revenue + Total cost of revenue` (cost rows are already negative)
- `Metro EBITDA` = `Gross profit + Acquisition marketing`
- `Customers at year end` = `Addressable venues * Penetration of addressable`
- The three KPI ratios = the ratio of their two source rows

Track row indices as you build, the way `totalsSheet()` above does, rather than hardcoding them.

- [ ] **Step 7: Run the agreement test**

Run: `npx vitest run src/pitch/model/formulaAgreement.test.ts`
Expected: PASS, with over 20 formulas found.

A mismatch means a formula points at the wrong row. Fix the row index; never adjust the cached value to match a wrong formula.

- [ ] **Step 8: Add the toggle dropdown and regenerate**

In `scripts/generate-financial-model-xlsx.ts`, after writing each sheet, add data validation to the Totals toggle column so it cannot be mistyped:

```ts
if (sheet.name === 'Totals') {
  sheet.rows.forEach((row, r) => {
    if (row[1]?.v === 'YES') {
      ws.getCell(r + 1, 2).dataValidation = {
        type: 'list', allowBlank: false, formulae: ['"YES,NO"'], showErrorMessage: true,
        error: 'Type YES or NO.',
      };
    }
  });
}
```

Run: `npm run model:xlsx`
Open the workbook, set Hoboken to `NO` on Totals, and confirm Total revenue and EBITDA both fall.

- [ ] **Step 9: Run the whole model suite**

Run: `npx vitest run src/pitch/model/`
Expected: PASS, including `workbookProvenance` (formula cells are skipped by it, so converting rows to formulas can only reduce orphans).

- [ ] **Step 10: Commit**

```bash
git add src/pitch/model/formulaEval.ts src/pitch/model/formulaAgreement.test.ts \
        src/pitch/model/workbook.ts scripts/generate-financial-model-xlsx.ts
git commit -m "Live formulas, with an evaluator that proves each one matches its cached result"
```

---

### Task 8: Rebuild the trajectory slide on the rollup

**Files:**
- Modify: `src/pitch/slides/slides.tsx` (the `SlideTrajectory` component)
- Modify: `src/pitch/slides/notes.ts` (the `trajectory` note)
- Create: `src/pitch/slides/slideTrajectory.test.tsx`

**Interfaces:**
- Consumes: `rollup` from `../model/rollup`.
- Produces: nothing new. Same `SlideId`, same export name, same props.

The slide id does not change, so `src/pitch/slides/index.ts` and the exporter's slide-count guard need no edit.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/slides/slideTrajectory.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlideTrajectory } from './slides';
import { rollup } from '../model/rollup';

describe('the trajectory slide', () => {
  it('labels the three calendar years rather than Y1/Y2/Y3', () => {
    render(<SlideTrajectory index={11} total={15} />);
    for (const year of ['2026', '2027', '2028']) {
      expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
    }
  });

  it('shows how many metros are live', () => {
    render(<SlideTrajectory index={11} total={15} />);
    const live = rollup()[2].metrosLive;
    expect(screen.getByText(new RegExp(`${live}\\s*metro`, 'i'))).toBeInTheDocument();
  });

  // Spec section 10: the slide must not present the bottom-up build as if it agreed with
  // the top-down band it replaced.
  it('names the top-down band as a cross-check', () => {
    render(<SlideTrajectory index={11} total={15} />);
    expect(screen.getByText(/cross-check|top-down/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pitch/slides/slideTrajectory.test.tsx`
Expected: FAIL — the slide still renders `Y1`/`Y2`/`Y3`.

If the run errors on JSX or `document`, this test needs the jsdom environment. Add `// @vitest-environment jsdom` as the first line of the test file (`vite.config.ts` sets `environment: 'node'` globally, and other component tests in this repo use the same override — check `src/pitch/deck/pending.test.tsx` for the established pattern and copy it).

- [ ] **Step 3: Rewrite the slide**

In `src/pitch/slides/slides.tsx`, change `SlideTrajectory`'s data source from `threeYearTrajectory()` to `rollup()`. Keep the bar layout. Replace the `Y{y.year}` label with the calendar year, drive the bar width off `revenue`, draw the cost bar off `revenue - ebitda`, and add two lines below the bars:

```tsx
export function SlideTrajectory({ index, total }: SlideProps) {
  const years = rollup();
  const max = Math.max(...years.map((y) => y.revenue));
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="The trajectory">
      <H2>
        Three years, built from
        <br />
        <GradientText>venue counts up.</GradientText>
      </H2>

      <div className="mt-8 space-y-6">
        {years.map((y) => (
          <div key={y.year} className="flex items-center gap-7">
            <p className="w-24 shrink-0 text-2xl font-extrabold">{y.year}</p>
            <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-white/5">
              <div
                className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-dc-teal-btn to-dc-teal"
                style={{ width: `${(y.revenue / max) * 100}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-lg bg-white/25"
                style={{ width: `${((y.revenue - y.ebitda) / max) * 100}%` }}
              />
            </div>
            <div className="w-[26rem] shrink-0 text-right text-lg tabular-nums">
              <span className="font-bold text-white">{moneyShort(y.revenue)}</span>
              <span className="text-white/45"> revenue · </span>
              <span className={y.ebitda >= 0 ? 'font-bold text-dc-teal' : 'font-bold text-dc-pink'}>
                {moneyShort(y.ebitda)}
              </span>
              <span className="text-white/45"> EBITDA · {y.metrosLive} metros</span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-7 max-w-5xl text-lg text-white/70">
        Built bottom-up: Census venue counts per metro, the share of them we expect to sign, and
        our live pricing. Our earlier top-down plan plotted{' '}
        <b className="text-white">
          {moneyShort(years[2].topDownRevenueLow)}–{moneyShort(years[2].topDownRevenueHigh)}
        </b>{' '}
        by 2028 — we show it as a cross-check rather than tuning this build to match it.
      </p>
    </SlideShell>
  );
}
```

Keep `threeYearTrajectory` imported — `rollup()` uses it for the cross-check band, so removing the import from `derive.ts` is not needed, but remove it from `slides.tsx` if nothing else there uses it (`noUnusedLocals` will say so).

- [ ] **Step 4: Run the slide test**

Run: `npx vitest run src/pitch/slides/slideTrajectory.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rewrite the speaker note**

In `src/pitch/slides/notes.ts`, replace the `trajectory` note. The current one coaches Joe to defend a top-down band he is no longer showing.

```ts
  trajectory: {
    title: 'The trajectory',
    notes:
      'This is built bottom-up, and say so: Census counts the restaurants and bars in each town, we state what share of them we expect to sign, and the revenue falls out of our live pricing. Nothing here is a round number someone picked.\n\nYear 1 is negative. Do not soften that — it is what the raise is for.\n\nIf they ask why it differs from the plan they may have seen: the earlier number was top-down, this one is built from venue counts up, and we did not tune one to match the other. Offer the workbook — every cell traces to its source, and they can change our market-share assumption in the sheet and watch it move.',
  },
```

- [ ] **Step 6: Run the deck suite**

Run: `npx vitest run src/pitch/`
Expected: PASS. If `notes.test.ts` asserts note length or content, update it in this commit.

- [ ] **Step 7: Commit**

```bash
git add src/pitch/slides/slides.tsx src/pitch/slides/notes.ts src/pitch/slides/slideTrajectory.test.tsx
git commit -m "Rebuild the trajectory slide on the bottom-up rollup, top-down band as cross-check"
```

---

### Task 9: Drive upload

**Files:**
- Create: `scripts/upload-model-to-drive.ts`
- Modify: `package.json` (add `model:upload`)

**Interfaces:**
- Consumes: `resolveKeySource`, `parseServiceAccountKey`, `uploadToDrive`, `describeSetup`, `DEFAULT_KEY_PATH` from `./lib/drive-service-account`.
- Produces: nothing importable.

- [ ] **Step 1: Write the uploader**

Create `scripts/upload-model-to-drive.ts`:

```ts
#!/usr/bin/env npx tsx
/**
 * Upload the financial model to the Confidential shared drive.
 *
 *   npm run model:upload
 *
 * The guard is on the MANIFEST, not the filename. `scripts/upload-pitch-to-drive.ts` records
 * why: the redacted deck once reached the Confidential drive under a name promising the
 * opposite, and a filename check is defeated by a rename. The manifest is written by the
 * generator from what it actually emitted, so the name cannot disagree with the contents.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  resolveKeySource,
  parseServiceAccountKey,
  uploadToDrive,
  DEFAULT_KEY_PATH,
} from './lib/drive-service-account';

/** `DragonCandy — Confidential`, and its `11 · Finance` folder. */
const TEAM_DRIVE_ID = '0AGQe4NGwWqV8Uk9PVA';
const FOLDER_ID = '1d0yb3VvRPVBF28s1UBHPfrubwkaOsRvM';
const LOCAL = 'dragoncandy-financial-model.xlsx';
const REMOTE_NAME = 'DragonCandy_Financial_Model.xlsx';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!existsSync(LOCAL)) die(`${LOCAL} not found. Run \`npm run model:xlsx\` first.`);

const manifestPath = `${LOCAL}.manifest.json`;
if (!existsSync(manifestPath)) die(`No manifest beside ${LOCAL}. Regenerate with \`npm run model:xlsx\`.`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  confidential: boolean;
  sheets: string[];
  generatedAt: string;
};

if (!manifest.confidential) {
  die(
    'This is the PUBLIC build. The Confidential drive is for the complete model — uploading a ' +
      'redacted one under a name that promises otherwise is the exact failure the deck uploader ' +
      'records. Run `npm run model:xlsx` without --public.',
  );
}
if (!manifest.sheets.includes('Financing')) {
  die('Manifest says confidential but carries no Financing sheet. Regenerate; do not upload.');
}

// Staleness: a workbook older than the model it claims to be built from is a workbook that
// disagrees with its own premise.
const built = statSync(LOCAL).mtimeMs;
for (const input of ['src/pitch/model', 'scripts/generate-financial-model-xlsx.ts']) {
  if (existsSync(input) && statSync(input).mtimeMs > built) {
    die(`${input} is newer than ${LOCAL}. Re-run \`npm run model:xlsx\` before uploading.`);
  }
}

const bytes = readFileSync(LOCAL);
const localMd5 = createHash('md5').update(bytes).digest('hex');

const source = resolveKeySource(process.env, DEFAULT_KEY_PATH);
if (!source) {
  die(
    `No service-account key found (looked for ${DEFAULT_KEY_PATH} and the environment). ` +
      `Drop the deck-uploader key in, or upload by hand to DragonCandy — Confidential › 11 · Finance.`,
  );
}

const key = parseServiceAccountKey(readFileSync(source.path, 'utf8'), source.path);

const result = await uploadToDrive({
  key,
  driveId: TEAM_DRIVE_ID,
  folderId: FOLDER_ID,
  name: REMOTE_NAME,
  bytes,
  mimeType: MIME,
});

if (result.md5 !== localMd5) {
  die(`Uploaded, but Drive reports md5 ${result.md5} against local ${localMd5}. Do not trust it.`);
}

console.log(
  `Uploaded. DragonCandy — Confidential › 11 · Finance › ${REMOTE_NAME}\n` +
    `https://drive.google.com/drive/folders/${FOLDER_ID}\n` +
    `md5 ${localMd5} verified both ways.`,
);
```

`resolveKeySource` and `UploadResult` have exact shapes in `scripts/lib/drive-service-account.ts` — open it and match them. In particular confirm whether `UploadResult` exposes `md5` under that name, and whether `resolveKeySource` returns a `{ path }` object or a discriminated union with an inline-key variant; adapt the two call sites accordingly.

- [ ] **Step 2: Add the script**

Add to `package.json` `scripts`:

```json
"model:upload": "npx tsx scripts/upload-model-to-drive.ts",
```

- [ ] **Step 3: Prove the public build is refused**

Run: `npm run model:xlsx -- --public`
Then temporarily point `LOCAL` at `dragoncandy-financial-model-public.xlsx` and run `npm run model:upload`.
Expected: exits non-zero with the "This is the PUBLIC build" message.

Restore `LOCAL` afterwards. This is the guard that matters most; exercising it once is worth the two minutes.

- [ ] **Step 4: Upload the real thing**

Run: `npm run model:xlsx && npm run model:upload`
Expected: either an md5-verified success, or the "no service-account key" message naming where to put the key.

If the key is absent, that is a founder action, not a failure — report it and move on.

- [ ] **Step 5: Commit**

```bash
git add scripts/upload-model-to-drive.ts package.json
git commit -m "Upload the model to the Confidential drive, guarded on the manifest not the filename"
```

---

### Task 10: Build, review, ship

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md` (§5 index line, §4 if counts moved)
- Modify: `docs/SHIPPED_LOG.md`
- Modify: `src/pitch/deck/pending.ts` (retire `hobokenRestaurantCount`)
- Create: `docs/wiki/raw/sessions/2026-08-26-investor-financial-model-workbook.md`

- [ ] **Step 1: Retire the answered founder input**

`src/pitch/deck/pending.ts` carries `hobokenRestaurantCount`, asking for the town-wide denominator with a source. Task 1 answered it from Census.

Remove that entry, and run `npx vitest run src/pitch/deck/pending.test.tsx` — that test enumerates the pending set, so it will tell you what else references the key.

- [ ] **Step 2: Full verification**

```bash
npm run typecheck
npm run lint
npx vitest run
npm run build
```

Expected: all four clean. Record the final test count — `OPERATING.tests` and `OPERATING.testFiles` in `assumptions.ts` are MEASURED off `npx vitest run` and this change adds test files, so update both values and their `asOf` to today.

Also re-read `OPERATING.sourceFiles` (`find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l`) — its own note says it moves as the model grows and must be re-run at the end of a work session.

- [ ] **Step 3: Codex second review**

```bash
git fetch origin
git diff origin/main...HEAD --stat
codex review --base origin/main --title "Multi-metro investor financial model workbook"
```

`origin/main`, never `main` — the local ref is frozen at worktree creation. Confirm the diff range is non-empty first; a clean verdict over an empty diff is false assurance.

Check every finding against the file before acting on it, then fix and re-run until clean. Relay the summary verdict.

- [ ] **Step 4: Knowledge sync**

Invoke the `knowledge-sync` skill. It writes the `docs/wiki/raw/sessions/` source, ingests it, prepends the full entry to `docs/SHIPPED_LOG.md`, and adds the one-line §5 index entry to `docs/PROJECT_CONTEXT.md`.

The §5 entry must be one or two lines. The prose goes in `SHIPPED_LOG.md`.

Points the wiki page must carry, because they are the durable findings rather than the feature description:

- Census ZIP Business Patterns answers a founder input that sat pending for days, with no API key, from a bulk file the JSON endpoint now gates behind one.
- Suppressed Census cells (`"N"`) are unknown, not zero, and one suppressed bucket in a row is recoverable as the residual.
- The addressable band is 120 Hoboken venues, not 251 — penetration stated against the wrong denominator is the easiest way to be wrong by 2x.
- The top-down PROJECT_CONTEXT §3 band and this bottom-up build diverge by the factor recorded in the `rollup.test.ts` warning. Neither was tuned.
- `workbookProvenance.test.ts` is what makes "no made-up numbers" enforceable; `formulaAgreement.test.ts` is what stops a live workbook showing one number and computing another.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin worktree-DC-pitchdeck-3
gh pr create --title "Multi-metro investor financial model workbook, on Adrian's architecture" --body "..."
```

The PR body must state the top-down/bottom-up divergence explicitly with the three numbers. That is the finding, and burying it in a diff is how it gets missed.

Verify the push landed: `git log origin/worktree-DC-pitchdeck-3 --oneline -1`. A successful-looking push may not have carried your commits when sessions collide on branch names.

- [ ] **Step 6: After merge**

Refresh the local main checkout with the `refresh-main` skill — the post-merge hook then syncs Donny's RAG automatically.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4 Census TAM, no API key, bulk files | 1 |
| §4.1 geography per metro, Palm Beach ZIP vs county | 1 (registry), 2 (`geography` field) |
| §4.2 addressable band pinned, 120 venues, suppression | 1, 2 |
| §5 row taxonomy, three omissions | 3 (model), 5 (Sources sheet states them) |
| §6.1 model modules, committed snapshot | 1–4 |
| §6.2 generators, Drive destination | 5, 9 |
| §7 live formulas, named cells, cached results | 7 |
| §8 eleven sheets | 5 |
| §8.1 cohort not named metros | 4, 5 |
| §9 all five tests | 1, 2, 4, 6, 7 |
| §10 top-down/bottom-up, reported never closed | 4 (`bottomUpVsTopDown`), 5 (Totals), 8 (slide) |
| §11 slide upgraded not added, note rewritten | 8 |
| §12 confidential build, manifest guard | 5, 9 |
| §13 out of scope | honoured — no SAFE terms, no corporate tax, no overage revenue |
| §15 open inputs | 10 retires `hobokenRestaurantCount`; the others stay |

One spec item has no task: **annual social-marketing spend per venue** (§15), the TAM's dollar multiplier. It is deliberately not a task because the model as planned derives revenue from *our pricing times customers*, not from a share of the venue's marketing budget — so the multiplier is not on the critical path. If the workbook should show a market-size dollar figure rather than a venue count, that is a follow-up: register the benchmark, add a `marketSizeDollars` row to `metroSheet()`, and cite the study on `Sources`.

**Placeholder scan:** two spots deliberately defer to a file the implementer must open — `preSeedRaise()`/`buildFundsAllocation()` return shapes in Task 5 Step 4, and `resolveKeySource`/`UploadResult` in Task 9 Step 1. Both name the exact file and what to check. These are reads, not unspecified decisions.

**Type consistency:** `MetroYear` is produced in Task 3 and consumed unchanged in Tasks 4 and 5. `Cell`/`SheetSpec` are produced in Task 5 and consumed in Tasks 6 and 7. `rollup(mix?, metroIds?)` is called with one argument in Tasks 5 and 8 and with two in `rollup.test.ts` — the second parameter is optional in the signature. `addressableVenues` is defined in Task 2 and used in Tasks 3 and 5.
