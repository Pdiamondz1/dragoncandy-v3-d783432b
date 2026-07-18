#!/usr/bin/env node
// ctx-split-worksheet.mjs — one-shot migration aid for the PROJECT_CONTEXT §5 split.
//
// Reads docs/PROJECT_CONTEXT.md, isolates §5's body (heading-anchored, excluding the
// trailing **Workflow discipline** operating-instruction block), and emits either a
// classification worksheet (--md) or the reversed log body (--emit-log-body).
//
// It does NOT classify — classification is per-bullet judgment (spec §4.1). It removes
// the mechanical part: finding each bullet's name, pointer, refs, and signal hits.
//
// Spec: docs/superpowers/specs/2026-07-18-context-tax-reduction-design.md
// Delete this script once the migration lands (Task 5).

import { readFileSync } from "node:fs";

const SRC = "docs/PROJECT_CONTEXT.md";

// Signal patterns — copied verbatim from spec §6.3 so counts stay reproducible.
const NARROW =
  /founder go-live|go-live pending|founder-run|founder run pending|founder-gated/i;
const BROAD_EXTRA =
  /deploys on merge|founder verifies|founder follow-up|remaining =|\bpending\b/i;
const DEFER = /deferred|designed but deferred|gated on/i;

function section5Body(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^## 5\./.test(l));
  if (start === -1) throw new Error("§5 heading not found");
  const rest = lines.slice(start + 1);
  // Terminate at the Workflow-discipline block OR §6, whichever comes first.
  let end = rest.findIndex(
    (l) => /^\*\*Workflow discipline\*\*/.test(l) || /^## 6\./.test(l),
  );
  if (end === -1) end = rest.length;
  return rest.slice(0, end);
}

function splitBullets(lines) {
  const out = [];
  let cur = null;
  for (const l of lines) {
    if (l.startsWith("- ")) {
      if (cur) out.push(cur);
      cur = [l];
    } else if (cur) {
      cur.push(l);
    }
  }
  if (cur) out.push(cur);
  return out;
}

function nameOf(bullet) {
  // Join the first two lines — many entries wrap mid-title — then cut at the status
  // marker ("— **shipped", "— **built", "(PR #…"), NOT at the first em-dash.
  // Cutting at the first em-dash collapses every AIOS entry to "DragonCandy AIOS".
  const head = (bullet[0] + " " + (bullet[1] || ""))
    .replace(/^- /, "")
    .replace(/\s+/g, " ")
    .trim();
  const cut = head.search(
    /\s*[—–-]\s*\*\*(shipped|built|live|triaged|prepped|deployed)|\s*\(PR #|\s*—\s*\*\*(?:shipped|built)/i,
  );
  const name = (cut > 0 ? head.slice(0, cut) : head).replace(/\*\*/g, "").trim();
  return name.replace(/[—–\-,:;]+$/, "").trim().slice(0, 78);
}

const text = readFileSync(SRC, "utf8");
const bullets = splitBullets(section5Body(text));

// --emit-log-body: print §5's bullets reversed (newest-first, per spec §4.1/§4.4) for
// the SHIPPED_LOG.md body. Order does not affect the §6 gate — it compares SORTED
// lines precisely so a reordering migration still proves byte-level preservation.
if (process.argv.includes("--emit-log-body")) {
  const out = [];
  for (const b of [...bullets].reverse()) {
    const trimmed = [...b];
    while (trimmed.length && trimmed[trimmed.length - 1].trim() === "") trimmed.pop();
    out.push(trimmed.join("\n"), "");
  }
  process.stdout.write(out.join("\n").replace(/\n+$/, "\n"));
  console.error(`emitted ${bullets.length} bullets, newest-first`);
  process.exit(0);
}

const rows = bullets.map((b, i) => {
  const body = b.join("\n");
  const wiki = [
    ...body.matchAll(/docs\/wiki\/(?:concepts|analyses|entities)\/[a-z0-9-]+\.md/g),
  ].map((m) => m[0]);
  const spec = [
    ...body.matchAll(/docs\/(?:superpowers\/specs|runbooks)\/[0-9a-z-]+\.md/g),
  ].map((m) => m[0]);
  // Catch "PR #285", "PRs #146, #148", and bare "#282" in a PR list. Two-to-four
  // digits avoids matching hashtags like #DragonDashed.
  const prs = [...body.matchAll(/#(\d{2,4})\b/g)].map((m) => `#${m[1]}`);
  // \s+ not a literal space — "branch" and its backticked name often straddle a
  // wrapped line, which a single-space match silently misses.
  const branch = (body.match(/branch\s+[`'"]([\w/.-]+)[`'"]/) || [])[1] || "";
  const narrow = NARROW.test(body);
  const broad = narrow || BROAD_EXTRA.test(body);

  // Pointer precedence (spec §4.1): wiki page wins over spec; else SHIPPED_LOG.md.
  const pointer = wiki[0] || spec[0] || "docs/SHIPPED_LOG.md";
  // Refs (spec §4.1): PRs, else branch, else omit entirely.
  const refs = prs.length
    ? [...new Set(prs)].join(", ")
    : branch
      ? `\`${branch}\``
      : "";

  return {
    n: i + 1,
    name: nameOf(b),
    lines: b.length,
    pointer,
    pointerKind: wiki[0] ? "wiki" : spec[0] ? "spec" : "LOG",
    refs,
    narrow,
    broad,
    defer: DEFER.test(body),
  };
});

console.log(
  "| # | Name | Lines | Pointer | Kind | Refs | Narrow | Broad | Defer | Section (FILL IN) |",
);
console.log("|--:|---|--:|---|---|---|:-:|:-:|:-:|---|");
for (const r of rows) {
  console.log(
    `| ${r.n} | ${r.name} | ${r.lines} | \`${r.pointer}\` | ${r.pointerKind} | ${r.refs || "—"} | ${r.narrow ? "Y" : ""} | ${r.broad ? "Y" : ""} | ${r.defer ? "Y" : ""} | |`,
  );
}

console.error(
  "\n" +
    JSON.stringify(
      {
        bullets: rows.length,
        narrow: rows.filter((r) => r.narrow).length,
        broadOnly: rows.filter((r) => r.broad && !r.narrow).length,
        defer: rows.filter((r) => r.defer).length,
        pointerWiki: rows.filter((r) => r.pointerKind === "wiki").length,
        pointerSpec: rows.filter((r) => r.pointerKind === "spec").length,
        pointerLog: rows.filter((r) => r.pointerKind === "LOG").length,
        noRefs: rows.filter((r) => !r.refs).length,
      },
      null,
      2,
    ),
);
