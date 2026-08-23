import { describe, it, expect } from "vitest";
import { cosine, rank, controlSeparation, recallPrecision, tailShare } from "./score.mjs";

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
