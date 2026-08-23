// rag-eval-report.mjs  (Node 18+, uses global fetch)
//
// Turns one machine-readable evaluation result into an AIOS finding — but only when something
// has actually moved. A clean month files nothing and says nothing.
//
//   RAG_EVAL_JSON=/tmp/rag-eval.json npm run eval:rag
//   RAG_EVAL_JSON=/tmp/rag-eval.json npm run eval:rag:report
//
// WHY IT IS A SEPARATE SCRIPT. rag-eval.mjs measures; this decides what a measurement means. Kept
// apart so that (a) a human running the evaluation to see where things stand can never
// accidentally file a finding against production, and (b) the exit code carrying the verdict
// lives here rather than in the measurement, where it would turn curiosity into a build failure.
//
// REPORT-ONLY, like every other AIOS routine: it writes through `aios-report-ingest`, which is
// structurally incapable of writing anything but a briefing or a finding. Nothing here changes a
// threshold, a baseline, or the query set — a guard that edits its own reference is a thermometer
// reporting room temperature no matter what the room is doing.
//
// Findings are fingerprinted PER METRIC (`rag-eval:<metric>`), so a regression that persists
// across months bumps `occurrences` on one row instead of filing a fresh one each time, and each
// metric can be triaged and resolved on its own.

import { readFileSync } from "node:fs";

const JSON_PATH = process.env.RAG_EVAL_JSON;
if (!JSON_PATH) {
  console.error("Set RAG_EVAL_JSON to the result file written by rag-eval.mjs.");
  process.exit(1);
}

const SYNC = process.env.DONNY_SYNC_URL
  ?? "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-knowledge-sync";
// Same project, sibling function. Derived rather than hardcoded so DONNY_SYNC_URL still points
// the whole pipeline — measurement and reporting — at staging in one move.
const INGEST = process.env.AIOS_INGEST_URL ?? SYNC.replace(/\/[^/]+$/, "/aios-report-ingest");
const KEY = process.env.AIOS_INGEST_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.env.RAG_EVAL_DRY_RUN === "1";

const result = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const verdict = result.baseline?.verdict;

/** Percentages where the metric is a share; plain numbers otherwise. */
const show = (n) => (Number.isInteger(n) ? String(n) : `${(n * 100).toFixed(1)}%`);

/**
 * Context every finding carries, because the numbers alone do not say how much to trust them.
 * The labelled-coverage line is here on purpose: 7 of 53 is a real weakness, and a monthly report
 * that prints a precise recall figure without it reads far more authoritative than it is.
 */
function contextBlock() {
  const d = result.benchmarkDrift;
  return [
    "",
    "**Context for reading these numbers**",
    "",
    `- Index: ${result.index.chunks} chunks across ${result.index.documents} documents ` +
      `(${result.index.located} located in their source files).`,
    `- Relevance labels cover **${result.labelledQueries} of ${result.realQueries}** queries. ` +
      `Recall and precision are direction, not precision — see the Known Issues in the wiki page.`,
    d
      ? `- Benchmark drift: ${d.unseen} of ${d.live} distinct live queries are not in the committed set.`
      : "- Benchmark drift: could not read `donny_tool_executions` this run.",
    `- Controls: ${result.controls.controlsAboveWeakestReal} of ${result.controls.controlCount} ` +
      `scored above the weakest real query.`,
    "",
    "Method, results and limits: `docs/wiki/concepts/rag-retrieval-evaluation.md`. " +
      "Reproduce with `npm run eval:rag`.",
  ].join("\n");
}

const findings = [];

if (!verdict) {
  // No baseline at all. Worth saying once — a comparison that never happens is not a pass.
  findings.push({
    severity: "low",
    title: "RAG retrieval evaluation ran with no baseline to compare against",
    summary_md:
      "`npm run eval:rag` produced a result but `supabase/scripts/rag-eval/baseline.json` is " +
      "missing, so nothing was compared. The scheduled run is measuring and discarding.\n" +
      contextBlock(),
    fingerprint: "rag-eval:no-baseline",
    source: "rag-eval",
  });
} else if (!verdict.comparable) {
  // The guard has stopped guarding. This MUST be a finding rather than a log line: silence here
  // is indistinguishable from a clean month, and the whole point of this pipeline is that a
  // failure which produces no signal is the one that survives for two months.
  findings.push({
    severity: "medium",
    title: "RAG retrieval evaluation is no longer comparable to its baseline",
    summary_md:
      "The scheduled evaluation ran, but its result cannot be compared to the recorded baseline, " +
      "so **no regression check happened this run**.\n\n" +
      verdict.notes.map((n) => `- ${n}`).join("\n") +
      "\n\nFix by re-recording `supabase/scripts/rag-eval/baseline.json` from a run you trust, in " +
      "a PR — never by loosening the check.\n" +
      contextBlock(),
    fingerprint: "rag-eval:not-comparable",
    source: "rag-eval",
  });
} else {
  // A configured threshold that did not run is a guard silently switched off. Left as a printed
  // note it reads as a clean month — which is the same shape as the defect this pipeline exists
  // to catch, reintroduced one level up. One finding covers all the causes (a renamed metric, a
  // missing baseline figure, a label set that no longer matches), because they have one remedy:
  // re-record the baseline in a PR.
  if (verdict.unchecked?.length) {
    findings.push({
      severity: "medium",
      title: `RAG retrieval evaluation skipped ${verdict.unchecked.length} configured check(s)`,
      summary_md:
        "These thresholds are configured in `supabase/scripts/rag-eval/baseline.json` but did not " +
        "run, so **nothing guarded them this month**:\n\n" +
        verdict.unchecked.map((u) => `- \`${u.key}\` — ${u.reason}`).join("\n") +
        "\n\nFix by re-recording the baseline from a run you trust, in a PR. Removing the " +
        "threshold instead is a decision to stop guarding the metric — fine, but say so.\n" +
        contextBlock(),
      evidence: { unchecked: verdict.unchecked },
      fingerprint: "rag-eval:unchecked-thresholds",
      source: "rag-eval",
    });
  }
  for (const r of verdict.regressions) {
    findings.push({
      severity: r.severity,
      title: `RAG retrieval regression: ${r.key} ${show(r.observed)} (baseline ${show(r.baseline)})`,
      summary_md:
        `\`${r.key}\` moved past its tolerance of ${r.tolerance}.\n\n` +
        `| | value |\n|---|---|\n| baseline (${result.baseline.recordedAt}) | ${show(r.baseline)} |\n` +
        `| this run | ${show(r.observed)} |\n\n${r.summary}\n` +
        contextBlock(),
      evidence: { metric: r.key, baseline: r.baseline, observed: r.observed, tolerance: r.tolerance },
      fingerprint: `rag-eval:${r.key}`,
      source: "rag-eval",
    });
  }
}

if (findings.length === 0) {
  const checked = verdict.checks.map((c) => c.key).join(", ");
  console.log(`no regression — ${verdict.checks.length} check(s) within tolerance (${checked}).`);
  for (const n of verdict.notes) console.log(`note: ${n}`);
  // Reaching here means every configured threshold ran and stayed inside its tolerance. That is
  // the ONLY state in which this script is allowed to be quiet.
  process.exit(0);
}

console.log(`${findings.length} finding(s) to file:`);
for (const f of findings) console.log(`  [${f.severity}] ${f.title}`);

if (DRY) {
  console.log("\nRAG_EVAL_DRY_RUN=1 — nothing filed.");
  process.exit(1);
}
if (!KEY) {
  // Exit non-zero: a reporting step that quietly files nothing is the failure this whole
  // pipeline exists to prevent, so it must not be able to pass.
  console.error("\nNo AIOS_INGEST_KEY / SUPABASE_SECRET_KEY — cannot file. Findings NOT recorded.");
  process.exit(1);
}

const r = await fetch(INGEST, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "findings", payload: { findings } }),
});
const body = await r.text();
if (!r.ok) {
  console.error(`\nfiling failed: ${r.status} ${body.slice(0, 300)}`);
  process.exit(1);
}
console.log(`\nfiled at ${INGEST}: ${body.slice(0, 300)}`);
// Non-zero so the scheduled run goes red. The finding is the durable record; the red run is what
// makes someone look at it this week rather than next quarter.
process.exit(1);
