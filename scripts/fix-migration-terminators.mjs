// Detects (and optionally fixes) Lovable-generated migrations where a
// dollar-quoted body close tag (e.g. $function$ / $$) is not terminated by a
// semicolon before the next statement — which breaks `supabase db push` on a
// clean DB. Run with no args to DETECT, or `--apply` to FIX.
//
// Safety: only inserts a `;` immediately after a CLOSING dollar tag when the
// next significant token is a new statement (CREATE/ALTER/etc.) or a comment,
// NOT a function attribute (LANGUAGE, STABLE, SECURITY, SET, ...). Closings at
// EOF or already followed by `;`/attribute are left untouched.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const APPLY = process.argv.includes('--apply');

// Function attributes that can legally follow a closing dollar tag (statement
// continues; the terminating `;` comes later).
const ATTR = /^(language|stable|immutable|volatile|security|strict|set|cost|parallel|leakproof|returns|window|called|external|as)\b/i;

// Statement starters — only these following a close tag indicate a missing `;`.
const STMT = /^(create|alter|drop|insert|update|delete|grant|revoke|comment|do|with|select|truncate|merge|reindex|analyze|vacuum)\b/i;

const TAG = /\$[A-Za-z_]*\$/g; // dollar-quote tag

function findDefects(text) {
  // Walk tags in order, toggling in/out of a dollar-quoted region. Record the
  // end offset of each CLOSING tag.
  const defects = [];
  let m, openTag = null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(text))) {
    const tag = m[0];
    if (openTag === null) {
      openTag = tag; // opening
    } else if (tag === openTag) {
      // closing — inspect what follows
      const after = m.index + tag.length;
      let i = after;
      // skip whitespace and line/block comments
      for (;;) {
        while (i < text.length && /\s/.test(text[i])) i++;
        if (text.startsWith('--', i)) { const nl = text.indexOf('\n', i); i = nl === -1 ? text.length : nl + 1; continue; }
        if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i); i = e === -1 ? text.length : e + 2; continue; }
        break;
      }
      if (i >= text.length) { openTag = null; continue; }      // EOF — fine
      if (text[i] === ';') { openTag = null; continue; }         // already terminated
      const rest = text.slice(i, i + 16);
      if (ATTR.test(rest)) { openTag = null; continue; }         // attribute — statement continues
      // Only a real defect when a NEW statement follows the close tag. If the
      // next token is `,` `)` etc., the dollar-quote was a string literal/arg
      // (e.g. cron.schedule('...', $$...$$) or INSERT VALUES ($$...$$, ...)).
      if (!STMT.test(rest)) { openTag = null; continue; }
      defects.push({ insertAt: after, nextToken: rest.split(/\s/)[0] });
      openTag = null;
    }
  }
  return defects;
}

let files = readdirSync(DIR).filter((f) => f.endsWith('.sql'));
let totalDefects = 0, affected = 0;
for (const f of files) {
  const p = join(DIR, f);
  const text = readFileSync(p, 'utf8');
  const defects = findDefects(text);
  if (!defects.length) continue;
  affected++; totalDefects += defects.length;
  console.log(`${f}: ${defects.length} (next: ${defects.map((d) => d.nextToken).join(', ')})`);
  if (APPLY) {
    let out = text;
    for (const d of defects.sort((a, b) => b.insertAt - a.insertAt)) out = out.slice(0, d.insertAt) + ';' + out.slice(d.insertAt);
    writeFileSync(p, out);
  }
}
console.log(`\n${APPLY ? 'FIXED' : 'DETECTED'}: ${totalDefects} missing terminators across ${affected} files (of ${files.length}).`);
