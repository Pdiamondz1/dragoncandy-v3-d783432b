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
  {
    metroId: 'palm-beach',
    geography: { kind: 'county', code: '12099', label: 'Palm Beach County, FL' },
  },
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

/**
 * Split one CSV line respecting quoted fields, because the ZBP file's `name` column
 * ("HOBOKEN, NJ") embeds a comma — a naive `split(',')` misaligns every field after it.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

/**
 * Census pads a NAICS code with trailing `/` (and `-` for the all-industries total row) to
 * a fixed 6 characters, e.g. "722///" for the 722 sector, "7223//" for 7223. Strip the
 * padding so it compares against the plain codes in `NAICS`.
 */
function normalizeNaics(raw: string): string {
  return raw.replace(/[/-]/g, '');
}

/** ZBP detail: zip,name,naics,est,n<5,n5_9,n10_19,n20_49,n50_99,n100_249,n250_499,n500_999,n1000,... */
function parseZbp(text: string, zip: string): NaicsRow[] {
  const out: NaicsRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith(`"${zip}"`)) continue;
    const f = splitCsvLine(line);
    const naics = normalizeNaics(f[2]);
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
    const f = splitCsvLine(line);
    const naics = normalizeNaics(f[2]);
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
