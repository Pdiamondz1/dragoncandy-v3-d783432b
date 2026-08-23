// supabase/scripts/rag-eval/score.mjs
//
// Pure scoring for the retrieval evaluation. No network, no filesystem — so it is testable, and
// so a change to the metrics can be checked without spending an embedding.

import { createHash } from "node:crypto";
//
// See docs/wiki/concepts/rag-retrieval-evaluation.md for what these numbers meant on 2026-08-23
// and, more importantly, for what they could NOT establish.

/** Cosine similarity. Vectors are 1536-d float arrays from text-embedding-3-small. */
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Rank an index against one query vector, best first. */
export function rank(queryVec, index) {
  return index
    .map((row) => ({ row, sim: cosine(queryVec, row.embedding) }))
    .sort((a, b) => b.sim - a.sim);
}

/**
 * Does similarity discriminate at all?
 *
 * Control queries are about subjects the corpus genuinely does not cover. If they score like real
 * queries, then a high similarity means nothing and every metric below is noise. This is the
 * check that makes the rest of the report readable, so it runs first and its failure is loud.
 *
 * Reported as the overlap COUNT, not a pass/fail on the means: two distributions can have very
 * different means and still overlap completely.
 */
export function controlSeparation(realTop1, controlTop1) {
  const weakestReal = Math.min(...realTop1);
  return {
    realMin: Math.min(...realTop1),
    realMax: Math.max(...realTop1),
    controlMin: Math.min(...controlTop1),
    controlMax: Math.max(...controlTop1),
    controlsAboveWeakestReal: controlTop1.filter((c) => c > weakestReal).length,
    controlCount: controlTop1.length,
  };
}

/**
 * recall@k and precision@k over the LABELLED pool only.
 *
 * `labels` is a Map of document id -> boolean. A retrieved document with no label is neither a
 * hit nor a miss: it is UNKNOWN, and counted separately. Treating unlabelled as irrelevant is the
 * standard way to make a retrieval change look better than it is — the newly-reachable documents
 * are exactly the ones nobody has judged yet.
 *
 * `results` is [{ docs: [documentId, ...] }] in rank order, one entry per CHUNK.
 *
 * k COUNTS CHUNKS, because that is what `search_internal_knowledge` returns — ten rows, not ten
 * distinct documents. An earlier version skipped duplicates and kept scanning until it had k
 * distinct documents, which credited documents sitting at chunk-rank 11, 12, 15… that Donny never
 * receives. That inflation is largest exactly in the chunk-heavy case this evaluator exists to
 * assess, so it flattered the change it was measuring. Duplicates still collapse for CREDIT — one
 * document cannot be found twice — but they consume their slots.
 */
export function recallPrecision(results, labelsByQuery, kMax = 12) {
  const rows = [];
  for (let k = 1; k <= kMax; k++) {
    let relFound = 0, relTotal = 0, judgedInK = 0, unknownInK = 0, covered = 0;
    for (const r of results) {
      const labels = labelsByQuery.get(r.query);
      if (!labels) continue;
      relTotal += [...labels.values()].filter(Boolean).length;
      const seen = new Set();
      let hitsHere = 0;
      for (const doc of r.docs.slice(0, k)) {   // k chunks, exactly as production returns
        if (seen.has(doc)) continue;            // a repeat earns no second credit…
        seen.add(doc);                          // …but it already cost a slot above
        if (!labels.has(doc)) { unknownInK++; continue; }
        judgedInK++;
        if (labels.get(doc)) { relFound++; hitsHere++; }
      }
      if (hitsHere > 0) covered++;
    }
    rows.push({
      k,
      recall: relTotal ? relFound / relTotal : 0,
      // Precision counts only JUDGED slots; unknown ones are reported alongside so a reader can
      // see how much of the answer was never assessed.
      precision: judgedInK ? relFound / judgedInK : 0,
      unknown: unknownInK,
      queriesWithAHit: covered,
    });
  }
  return rows;
}

/**
 * Share of retrieved passages whose text sits beyond `cap` characters into its source document —
 * i.e. text the pre-2026-08-23 truncating sync could not return under any circumstances.
 * Objective: no judgment involved, so it stands even where the labels do not.
 */
export function tailShare(results, cap = 24_000) {
  let beyond = 0, total = 0, queriesTouched = 0;
  for (const r of results) {
    const n = r.offsets.filter((o) => o >= cap).length;
    beyond += n; total += r.offsets.length;
    if (n > 0) queriesTouched++;
  }
  return { beyond, total, share: total ? beyond / total : 0, queriesTouched, queries: results.length };
}

/**
 * A stable identity for a set of strings: sorted, delimited, hashed.
 *
 * COUNTING IS NOT IDENTITY. Swap one query for another and the count is unchanged, so a
 * count-based comparability check declares the run comparable while it is measuring different
 * inputs — producing a clean report, or a regression, about a benchmark nobody recorded. Sorting
 * first is deliberate: reordering queries.json is not a change to what is being measured, and a
 * guard that fires on a diff-only edit gets muted.
 *
 * Truncated to 16 hex chars: this detects an edit, it does not defend against a forged one.
 */
export function hashSet(items) {
  const h = createHash("sha256");
  for (const item of [...items].sort()) h.update(item).update("\u0000");
  return h.digest("hex").slice(0, 16);
}

/** Identity of the query set. Real and control queries are namespaced so moving one between the
 *  two lists — which changes what is being measured — changes the hash. */
export function hashQueries({ real, control }) {
  return hashSet([...real.map((q) => `r:${q}`), ...control.map((q) => `c:${q}`)]);
}

/** Identity of the relevance labels, including each verdict: flipping one judgment from relevant
 *  to not is exactly the kind of change that must invalidate a recall baseline. */
export function hashLabels(rows) {
  return hashSet(rows.map((l) => `${l.query}\u0001${l.doc}\u0001${l.relevant ? 1 : 0}`));
}

/**
 * Compare one run against the committed baseline (rag-eval/baseline.json).
 *
 * The point of automating this evaluation is NOT to re-derive the same numbers every month — it
 * is to notice when they move. So the reference figures and the tolerances both live in the
 * baseline file, beside each other, where a human can retune them without editing code.
 *
 * `baseline.metrics[key]` is the reference value; `baseline.thresholds[key]` says how far it may
 * move and in which direction that is bad. Tolerances are ABSOLUTE in the metric's own units — a
 * mix of absolute and relative ones reads fine and gets misapplied.
 *
 * COMPARABILITY IS CHECKED BEFORE ANYTHING IS COMPARED, and it is checked per metric rather than
 * for the run as a whole:
 *
 *  - Change the query set and every figure shifts for a reason that has nothing to do with
 *    retrieval quality. Nothing is comparable; say so and stop.
 *  - Change the LABEL set and the recall/precision denominators move, but the control separation
 *    and the index size do not depend on labels at all. Those stay comparable. Declaring the whole
 *    run incomparable there would throw away the check that matters most.
 *
 * A silently-wrong comparison is worse than no comparison: it reads as "nothing regressed".
 */
export function compareToBaseline(result, baseline) {
  const out = { comparable: true, notes: [], regressions: [], checks: [], unchecked: [] };

  // Compared by IDENTITY, not by count. Replacing one query while keeping 53 leaves every count
  // intact and changes what is being measured — the count check would have called that comparable.
  if (!baseline.querySetHash) {
    out.comparable = false;
    out.notes.push(
      "baseline.querySetHash is missing, so there is no way to establish that this run used the " +
      "same queries the baseline was recorded from. Re-record baseline.json.",
    );
    return out;
  }
  if (result.querySetHash !== baseline.querySetHash) {
    out.comparable = false;
    out.notes.push(
      `query set changed (${baseline.querySetSize} queries at ${baseline.querySetHash} -> ` +
      `${result.realQueries} at ${result.querySetHash}); every figure shifts with it, so this run ` +
      `cannot be compared. Re-record baseline.json against the new set.`,
    );
    return out;
  }

  // Labels changed => recall/precision denominators changed. Those become incomparable; the
  // label-free checks below are unaffected and still run. Identity again, not count: flipping one
  // judgment from relevant to not leaves the count alone and moves recall.
  const labelsMatch = !!baseline.labelSetHash && result.labelSetHash === baseline.labelSetHash;
  if (!labelsMatch) {
    out.notes.push(
      `label set changed or unverifiable (${baseline.labelledQueries} labelled queries at ` +
      `${baseline.labelSetHash ?? "no hash recorded"} -> ${result.labelledQueries} at ` +
      `${result.labelSetHash}); recall and precision are not comparable this run. The label-free ` +
      `checks still are.`,
    );
  }

  const observedBy = {
    controlsAboveWeakestReal: result.controls.controlsAboveWeakestReal,
    recallAt10: result.recallAt10,
    locatedShare: result.locatedShare,
    indexChunks: result.index.chunks,
  };

  for (const [key, spec] of Object.entries(baseline.thresholds ?? {})) {
    const observed = observedBy[key];
    if (observed === undefined) {
      // A threshold naming a metric this run does not produce would otherwise sit there passing
      // forever — a guard that cannot fire, which is indistinguishable from a guard that passes.
      // Recorded STRUCTURALLY, not just as prose, so the reporter can surface it rather than
      // print it into a log nobody reads at 07:00 on the first of the month.
      out.unchecked.push({ key, reason: "the run does not measure this metric" });
      continue;
    }
    if (spec.needsLabels && !labelsMatch) {
      out.unchecked.push({ key, reason: "the label set no longer matches the baseline" });
      continue;
    }
    const base = baseline.metrics?.[key];
    if (typeof base !== "number") {
      out.unchecked.push({ key, reason: `baseline.metrics.${key} is missing` });
      continue;
    }
    // Direction-aware: a control-overlap COUNT going up is bad, a recall going down is.
    const worseBy = spec.higherIsBetter ? base - observed : observed - base;
    const breached = worseBy > spec.tolerance;
    out.checks.push({ key, baseline: base, observed, worseBy, tolerance: spec.tolerance, breached });
    if (breached) {
      out.regressions.push({
        key, severity: spec.severity, baseline: base, observed,
        tolerance: spec.tolerance, summary: spec.summary,
      });
    }
  }

  return out;
}
