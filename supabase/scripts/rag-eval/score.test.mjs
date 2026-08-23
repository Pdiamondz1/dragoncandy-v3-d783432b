import { describe, it, expect } from "vitest";
import { cosine, rank, controlSeparation, recallPrecision, tailShare, compareToBaseline } from "./score.mjs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(readFileSync(join(HERE, f), "utf8"));

const vec = (...xs) => xs;

describe("cosine", () => {
  it("is 1 for identical direction and 0 for orthogonal", () => {
    expect(cosine(vec(1, 0), vec(2, 0))).toBeCloseTo(1);
    expect(cosine(vec(1, 0), vec(0, 1))).toBeCloseTo(0);
  });
});

describe("rank", () => {
  it("orders best first", () => {
    const index = [
      { id: "far", embedding: vec(0, 1) },
      { id: "near", embedding: vec(1, 0.1) },
      { id: "mid", embedding: vec(1, 1) },
    ];
    expect(rank(vec(1, 0), index).map((r) => r.row.id)).toEqual(["near", "mid", "far"]);
  });
});

describe("controlSeparation", () => {
  it("counts overlap rather than comparing means", () => {
    // Means differ a lot, yet one control beats the weakest real query — which is the thing that
    // matters and which a means comparison would hide.
    const s = controlSeparation([0.9, 0.8, 0.30], [0.4, 0.2, 0.1]);
    expect(s.controlsAboveWeakestReal).toBe(1);
  });

  it("reports zero overlap when the distributions are genuinely apart", () => {
    expect(controlSeparation([0.5, 0.6], [0.2, 0.25]).controlsAboveWeakestReal).toBe(0);
  });
});

describe("recallPrecision", () => {
  const labels = new Map([["q", new Map([["A", true], ["B", true], ["C", false]])]]);

  it("counts an UNLABELLED document as unknown, never as a miss", () => {
    // "Z" has no label. Treating it as irrelevant would understate precision, and treating it as
    // relevant would overstate recall; it is reported separately instead.
    const rows = recallPrecision([{ query: "q", docs: ["A", "Z", "C"] }], labels, 3);
    const k3 = rows[2];
    expect(k3.recall).toBeCloseTo(0.5);      // found A of {A,B}
    expect(k3.precision).toBeCloseTo(0.5);   // 1 relevant of 2 JUDGED (A, C) — Z excluded
    expect(k3.unknown).toBe(1);
  });

  /**
   * This test previously asserted the OPPOSITE — that A's three chunks collapsed to one slot and
   * B was therefore reached at k=2, giving recall 1. That pinned a defect: production returns k
   * CHUNKS, so a document filling the first three slots really does push B out of the top 2, and
   * crediting B inflated recall exactly in the chunk-heavy case this evaluator exists to assess.
   */
  it("spends slots on chunks, so a repeated document pushes others out of the window", () => {
    const rows = recallPrecision([{ query: "q", docs: ["A", "A", "A", "B"] }], labels, 4);
    expect(rows[1].recall).toBeCloseTo(0.5);  // k=2 sees A, A -> only A of {A,B}
    expect(rows[3].recall).toBeCloseTo(1);    // k=4 finally reaches B
  });

  it("gives a repeated document no second credit", () => {
    const rows = recallPrecision([{ query: "q", docs: ["A", "A"] }], labels, 2);
    expect(rows[1].recall).toBeCloseTo(0.5);  // not 1.0 — A found once, B never
  });

  it("recall climbs with k and never falls", () => {
    const rows = recallPrecision([{ query: "q", docs: ["C", "A", "B"] }], labels, 3);
    expect(rows.map((r) => +r.recall.toFixed(2))).toEqual([0, 0.5, 1]);
  });
});

describe("tailShare", () => {
  it("counts only passages beyond the old truncation point", () => {
    const t = tailShare([
      { offsets: [10, 30_000, 24_000] },  // 2 beyond a 24k cap (24000 is not < 24000)
      { offsets: [100, 200] },            // none
    ]);
    expect(t.beyond).toBe(2);
    expect(t.total).toBe(5);
    expect(t.queriesTouched).toBe(1);
  });
});

describe("compareToBaseline", () => {
  // A minimal baseline with one guard of each direction, so the tests exercise the mechanism
  // rather than the committed numbers (those get their own consistency check further down).
  const baseline = {
    recordedAt: "2026-01-01",
    querySetSize: 53,
    labelledQueries: 7,
    metrics: { controlsAboveWeakestReal: 0, recallAt10: 0.9, indexChunks: 400 },
    thresholds: {
      controlsAboveWeakestReal: { tolerance: 0, higherIsBetter: false, severity: "critical", summary: "c" },
      recallAt10: { tolerance: 0.1, higherIsBetter: true, needsLabels: true, severity: "high", summary: "r" },
      indexChunks: { tolerance: 80, higherIsBetter: true, severity: "high", summary: "i" },
    },
  };
  const run = (over = {}) => ({
    realQueries: 53,
    labelledQueries: 7,
    controls: { controlsAboveWeakestReal: 0 },
    recallAt10: 0.9,
    locatedShare: 0.99,
    index: { chunks: 400 },
    ...over,
  });

  it("passes a run that matches the baseline", () => {
    const v = compareToBaseline(run(), baseline);
    expect(v.comparable).toBe(true);
    expect(v.regressions).toEqual([]);
    expect(v.checks.every((c) => !c.breached)).toBe(true);
  });

  it("flags a control that beats the weakest real query, at critical", () => {
    // The one check that makes every other number readable: if this fires, nothing else means
    // anything, which is why its tolerance is zero rather than "a couple is fine".
    const v = compareToBaseline(run({ controls: { controlsAboveWeakestReal: 1 } }), baseline);
    expect(v.regressions.map((r) => [r.key, r.severity])).toEqual([["controlsAboveWeakestReal", "critical"]]);
  });

  it("is direction-aware: metrics moving the GOOD way are never regressions", () => {
    // Without this, a recall of 1.0 against a baseline of 0.9 reads as a 0.1 move and trips the
    // tolerance — an alert every time the thing being guarded improves.
    const v = compareToBaseline(run({ recallAt10: 1.0, index: { chunks: 900 } }), baseline);
    expect(v.regressions).toEqual([]);
  });

  it("refuses to compare anything when the query set changed", () => {
    // Every figure shifts with the denominator. Reporting "no regressions" here would be a lie
    // told confidently, which is worse than reporting nothing.
    const v = compareToBaseline(run({ realQueries: 60, recallAt10: 0.1 }), baseline);
    expect(v.comparable).toBe(false);
    expect(v.regressions).toEqual([]);
    expect(v.notes.join(" ")).toMatch(/query set changed/);
  });

  it("drops only the label-dependent checks when the label set changed", () => {
    // Labels move recall's denominator; they have nothing to do with control separation. Marking
    // the whole run incomparable would throw away the check that matters most.
    const v = compareToBaseline(
      run({ labelledQueries: 12, recallAt10: 0.1, controls: { controlsAboveWeakestReal: 3 } }),
      baseline,
    );
    expect(v.comparable).toBe(true);
    expect(v.regressions.map((r) => r.key)).toEqual(["controlsAboveWeakestReal"]);
    expect(v.checks.map((c) => c.key)).not.toContain("recallAt10");
  });

  it("says so when a threshold names a metric the run does not measure", () => {
    // A guard over a metric that never arrives sits there passing forever, which is
    // indistinguishable from a guard that is working. Say it is not checked.
    const v = compareToBaseline(run(), {
      ...baseline,
      metrics: { ...baseline.metrics, madeUp: 1 },
      thresholds: { ...baseline.thresholds, madeUp: { tolerance: 0, higherIsBetter: true, severity: "low", summary: "x" } },
    });
    expect(v.notes.join(" ")).toMatch(/madeUp.*does not measure/);
    expect(v.checks.map((c) => c.key)).not.toContain("madeUp");
  });

  it("says so when a threshold has no baseline figure to compare against", () => {
    const v = compareToBaseline(run(), { ...baseline, metrics: { controlsAboveWeakestReal: 0, indexChunks: 400 } });
    expect(v.notes.join(" ")).toMatch(/baseline\.metrics\.recallAt10 is missing/);
    expect(v.checks.map((c) => c.key)).not.toContain("recallAt10");
  });
});

describe("the committed baseline", () => {
  const baseline = readJson("baseline.json");

  it("counts the query set the evaluation will actually run", () => {
    // If these drift apart, every scheduled run comes back NOT COMPARABLE — a guard that has
    // quietly stopped guarding, reported as a note nobody is reading at 3am.
    const { real, control } = readJson("queries.json");
    expect(baseline.querySetSize).toBe(real.length);
    expect(baseline.controlSetSize).toBe(control.length);
  });

  it("counts the labelled queries the evaluation will actually score", () => {
    const labelled = new Set(readJson("labels.json").map((l) => l.query));
    expect(baseline.labelledQueries).toBe(labelled.size);
  });

  it("gives every threshold a baseline figure, a severity and a direction", () => {
    for (const [key, spec] of Object.entries(baseline.thresholds)) {
      expect(typeof baseline.metrics[key], `metrics.${key}`).toBe("number");
      expect(["critical", "high", "medium", "low"], `severity of ${key}`).toContain(spec.severity);
      expect(typeof spec.higherIsBetter, `higherIsBetter of ${key}`).toBe("boolean");
      expect(typeof spec.tolerance, `tolerance of ${key}`).toBe("number");
      expect(spec.summary.length, `summary of ${key}`).toBeGreaterThan(40);
    }
  });
});
