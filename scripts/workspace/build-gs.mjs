#!/usr/bin/env node
/**
 * Prepares scripts/workspace/ for `clasp push`.
 *
 * signature.js is an ES module so Vitest can import and test it. The Apps
 * Script V8 runtime has no module system -- every .gs file shares one global
 * scope and `export` is a syntax error. So we strip the export keywords and
 * emit .gs files.
 *
 * Deliberately a dumb text transform, not a bundler: the input is one file of
 * plain functions with no imports, and a bundler here would be machinery
 * nobody wants to maintain for a 4-person company's email signatures.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
mkdirSync(dist, { recursive: true });

function stripExports(source) {
  return source
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export default /gm, '');
}

for (const [from, to] of [
  ['signature.js', 'Signature.gs'],
  ['Code.gs.js', 'Code.gs'],
]) {
  const source = readFileSync(join(here, from), 'utf8');
  const out = stripExports(source);
  if (/^\s*(export|import)\s/m.test(out)) {
    throw new Error(`${from}: module syntax survived the transform — Apps Script will reject it`);
  }
  writeFileSync(join(dist, to), out);
  console.log(`  ${from} -> dist/${to}`);
}

// appsscript.json is the Apps Script project manifest -- clasp push requires
// one at the root of whatever directory `rootDir` points at. Written here,
// not hand-maintained, so it travels with the two generated .gs files.
const manifest = {
  timeZone: 'America/New_York',
  exceptionLogging: 'STACKDRIVER',
  runtimeVersion: 'V8',
  dependencies: {
    enabledAdvancedServices: [
      {
        userSymbol: 'AdminDirectory',
        serviceId: 'admin',
        version: 'directory_v1',
      },
    ],
  },
  oauthScopes: [
    'https://www.googleapis.com/auth/admin.directory.user.readonly',
    'https://www.googleapis.com/auth/script.external_request',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
};
writeFileSync(join(dist, 'appsscript.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('  (generated) -> dist/appsscript.json');

console.log('Ready for: cd scripts/workspace && clasp push');
