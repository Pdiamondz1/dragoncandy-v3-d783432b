import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rampSteps,
  parseRamp,
  runPool,
  isKnee,
  foldBreakages,
  classifyError,
  percentile,
  runLoad,
  type HotAction,
  type StepMetrics,
  type BreakageEvent,
  type LoadFindingsArtifact,
} from "./driver";

// ── rampSteps ─────────────────────────────────────────────────────────────────────────────────────
describe("rampSteps", () => {
  it("produces an ascending geometric step list capped at max (no duplicates)", () => {
    expect(rampSteps(50, 1500, 2.5)).toEqual([50, 125, 312, 781, 1500]);
  });
  it("caps the final step exactly at max even when the last multiple overshoots", () => {
    const steps = rampSteps(50, 100, 2.5);
    expect(steps[steps.length - 1]).toBe(100);
    expect(steps).toEqual([50, 100]);
  });
  it("returns a single step when start === max", () => {
    expect(rampSteps(50, 50, 2.5)).toEqual([50]);
  });
  it("never exceeds max and stays strictly ascending", () => {
    for (const s of rampSteps(10, 5000, 1.7)) expect(s).toBeLessThanOrEqual(5000);
    const steps = rampSteps(10, 5000, 1.7);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });
  it("degrades to [start, max] when factor <= 1 (never loops forever)", () => {
    expect(rampSteps(50, 1500, 1)).toEqual([50, 1500]);
    expect(rampSteps(50, 1500, 0.5)).toEqual([50, 1500]);
  });
});

// ── parseRamp ─────────────────────────────────────────────────────────────────────────────────────
describe("parseRamp", () => {
  it("parses the start/max/factor form via rampSteps", () => {
    expect(parseRamp("50/1500/2.5")).toEqual([50, 125, 312, 781, 1500]);
  });
  it("parses an explicit comma list (verbatim, de-duped, ascending)", () => {
    expect(parseRamp("50,200,500,1000,1500")).toEqual([50, 200, 500, 1000, 1500]);
  });
  it("parses a single number as a one-step ramp", () => {
    expect(parseRamp("250")).toEqual([250]);
  });
  it("throws (never silently degrades to [50]) on a malformed 2-part slash form", () => {
    expect(() => parseRamp("50/1500")).toThrow(/malformed --ramp/);
  });
  it("throws on a non-growing factor (≤1) instead of a fake two-step ramp", () => {
    expect(() => parseRamp("50/1500/1")).toThrow(/malformed --ramp/);
    expect(() => parseRamp("50/1500/0")).toThrow(/malformed --ramp/);
    expect(() => parseRamp("50/1500/0.5")).toThrow(/malformed --ramp/);
  });
  it("throws on an inverted or zero-start slash form", () => {
    expect(() => parseRamp("1500/50/2")).toThrow(/malformed --ramp/); // max < start
    expect(() => parseRamp("0/1500/2")).toThrow(/malformed --ramp/); // start < 1
  });
  it("throws on garbage and on empty input rather than running a trivial ramp", () => {
    expect(() => parseRamp("nonsense")).toThrow(/malformed --ramp/);
    expect(() => parseRamp("")).toThrow(/malformed --ramp/);
    expect(() => parseRamp("0")).toThrow(/malformed --ramp/);
  });
  it("throws on an invalid token in a comma list (never silently drops it)", () => {
    expect(() => parseRamp("50,150O")).toThrow(/malformed --ramp/); // letter O typo
    expect(() => parseRamp("50,-200")).toThrow(/malformed --ramp/); // non-positive
    expect(() => parseRamp("50,abc,200")).toThrow(/malformed --ramp/);
  });
  it("tolerates a trailing/double comma (empty tokens dropped, valid values kept)", () => {
    expect(parseRamp("50,200,")).toEqual([50, 200]);
    expect(parseRamp("50,,200")).toEqual([50, 200]);
  });
});

// ── runPool ───────────────────────────────────────────────────────────────────────────────────────
describe("runPool", () => {
  it("runs ALL tasks and NEVER exceeds `concurrency` in flight (live-counter peak)", async () => {
    let inFlight = 0;
    let peak = 0;
    let ran = 0;
    const worker = async (i: number): Promise<number> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      ran += 1;
      inFlight -= 1;
      return i;
    };
    const results = await runPool(3, 10, worker);
    expect(results).toHaveLength(10);
    expect(ran).toBe(10);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBe(3); // saturates to the ceiling
    // Every task index 0..9 ran exactly once.
    expect([...results].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("handles total === 0 (no work, no throw)", async () => {
    let ran = 0;
    const results = await runPool(4, 0, async () => {
      ran += 1;
      return 1;
    });
    expect(results).toEqual([]);
    expect(ran).toBe(0);
  });

  it("never exceeds concurrency even when concurrency > total", async () => {
    let inFlight = 0;
    let peak = 0;
    await runPool(50, 4, async (i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(4); // bounded by total, never spawns 50
  });
});

// ── isKnee ────────────────────────────────────────────────────────────────────────────────────────
describe("isKnee", () => {
  const base: StepMetrics = {
    concurrency: 50,
    count: 100,
    ok: 100,
    throttled: 0,
    breakage: 0,
    errorRate: 0,
    throttleRate: 0,
    breakageRate: 0,
    p50Ms: 40,
    p95Ms: 80,
  };
  const t = { maxErrorRate: 0.1, p95DegradeFactor: 2, minP95Ms: 50 };

  it("is true when the error rate crosses the threshold", () => {
    expect(isKnee({ ...base, errorRate: 0.2 }, base, t)).toBe(true);
  });
  it("is true when p95 latency degrades past the factor vs the previous step", () => {
    expect(isKnee({ ...base, p95Ms: 200 }, { ...base, p95Ms: 80 }, t)).toBe(true);
  });
  it("is false for a healthy step (low error, stable latency)", () => {
    expect(isKnee({ ...base, p95Ms: 90 }, base, t)).toBe(false);
  });
  it("does not false-trigger on tiny absolute latencies under the floor", () => {
    // 5ms -> 20ms is 4x, but both are below minP95Ms=50 -> noise, not a knee.
    expect(isKnee({ ...base, p95Ms: 20 }, { ...base, p95Ms: 5 }, t)).toBe(false);
  });
  it("has no previous step to compare latency against on the first step", () => {
    expect(isKnee({ ...base, p95Ms: 9999 }, null, t)).toBe(false); // only error-rate can trip step 1
  });
});

// ── foldBreakages ─────────────────────────────────────────────────────────────────────────────────
describe("foldBreakages", () => {
  it("dedupes by (endpoint,status,error), summing counts and keeping the LOWEST first-seen concurrency", () => {
    const events: BreakageEvent[] = [
      { endpoint: "campaign_browse", status: 500, error: "boom", concurrency: 200 },
      { endpoint: "campaign_browse", status: 500, error: "boom", concurrency: 50 },
      { endpoint: "feed", status: null, error: "permission denied", concurrency: 500 },
      { endpoint: "campaign_browse", status: 500, error: "boom", concurrency: 1000 },
    ];
    const sigs = foldBreakages(events);
    expect(sigs).toHaveLength(2);
    const browse = sigs.find((s) => s.endpoint === "campaign_browse");
    expect(browse).toMatchObject({ status: 500, error: "boom", count: 3, firstSeenConcurrency: 50 });
    const feed = sigs.find((s) => s.endpoint === "feed");
    expect(feed).toMatchObject({ status: null, error: "permission denied", count: 1, firstSeenConcurrency: 500 });
  });
  it("folds into an existing seed set (incremental accumulation across steps)", () => {
    const seed = foldBreakages([{ endpoint: "feed", status: 500, error: "x", concurrency: 100 }]);
    const merged = foldBreakages([{ endpoint: "feed", status: 500, error: "x", concurrency: 50 }], seed);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ count: 2, firstSeenConcurrency: 50 });
  });
});

// ── classifyError ───────────────────────────────────────────────────────────────────────────────────
describe("classifyError (saturation vs breakage)", () => {
  it("treats 429/503 and rate-limit wording as THROTTLE (expected saturation)", () => {
    expect(classifyError(new Error("429 Too Many Requests")).kind).toBe("throttle");
    expect(classifyError(new Error("rate limit exceeded")).kind).toBe("throttle");
    expect(classifyError({ status: 503, message: "Service Unavailable" }).kind).toBe("throttle");
    expect(classifyError({ code: "53300", message: "too many connections for role" }).kind).toBe("throttle");
  });
  it("treats everything else as BREAKAGE (a bug to collect)", () => {
    expect(classifyError(new Error("duplicate key value violates unique constraint")).kind).toBe("breakage");
    expect(classifyError({ code: "42501", message: "permission denied for table campaigns" }).kind).toBe("breakage");
  });
  it("extracts a numeric HTTP status when present", () => {
    expect(classifyError({ status: 429, message: "x" }).status).toBe(429);
    expect(classifyError(new Error("nope")).status).toBeNull();
  });
});

// ── percentile ──────────────────────────────────────────────────────────────────────────────────────
describe("percentile", () => {
  it("returns 0 for an empty sample and the max for p95 of a ramp", () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
    // Nearest-rank p50 of 4 samples = ceil(0.5*4)=2nd element = 20.
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
  });
});

// ── runLoad — findings collection (the QA deliverable) ────────────────────────────────────────────────
describe("runLoad — collects breakages across the run (does NOT abort on the first)", () => {
  it("accumulates N breakage events into a signature and WRITES the findings artifact", async () => {
    const N = 5;
    let written: LoadFindingsArtifact | null = null;
    let snapshots = 0;
    const failing: HotAction = {
      name: "campaign_browse",
      weight: 1,
      run: async () => {
        throw new Error("permission denied for table campaigns");
      },
    };
    const result = await runLoad({
      rampSteps: [N], // one step, concurrency N -> one wave of N tasks
      holdMs: 0,
      sampleEveryMs: 1000,
      runLabel: "test",
      botFor: async () => ({}) as unknown as SupabaseClient,
      activeUserIds: ["u1", "u2", "u3"],
      captureSnapshot: async () => {
        snapshots += 1;
      },
      writeFindings: async (a) => {
        written = a;
      },
      actions: [failing],
      now: () => 0,
    });
    // The run RESOLVED (was not aborted on the first error) and collected every breakage.
    expect(result.breakageCount).toBe(N);
    expect(result.breakages).toHaveLength(1);
    expect(result.breakages[0]).toMatchObject({
      endpoint: "campaign_browse",
      count: N,
      firstSeenConcurrency: N,
    });
    // Findings artifact written exactly once, mirroring the in-memory result.
    expect(written).not.toBeNull();
    const artifact = written as unknown as LoadFindingsArtifact;
    expect(artifact.summary.totalBreakages).toBe(N);
    expect(artifact.breakages).toHaveLength(1);
    expect(artifact.runLabel).toBe("test");
    expect(snapshots).toBeGreaterThanOrEqual(1); // sampled at least once
  });
});

describe("runLoad — samples the DB snapshot WHILE the wave is in flight (Codex P1 regression)", () => {
  it("takes the snapshot before any wave task completes (concurrent, not post-drain)", async () => {
    // Every wave task blocks on a gate; the snapshot releases it. So at snapshot time NO task has
    // completed — proving the snapshot runs concurrently with the in-flight wave. If the snapshot were
    // taken after `await runPool` drained the wave (the bug), runPool would block on the gate forever
    // (nothing releases it) → the test would deadlock and time out.
    let completed = 0;
    let completedAtSnapshot = -1;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const gated: HotAction = {
      name: "campaign_browse",
      weight: 1,
      run: async () => {
        await gate;
        completed += 1;
      },
    };
    await runLoad({
      rampSteps: [2],
      holdMs: 0,
      sampleEveryMs: 1000,
      runLabel: "inflight",
      botFor: async () => ({}) as unknown as SupabaseClient,
      activeUserIds: ["u1", "u2"],
      captureSnapshot: async () => {
        completedAtSnapshot = completed; // live completed-count at snapshot time
        release(); // let the gated wave drain
      },
      writeFindings: async () => {},
      actions: [gated],
      now: () => 0,
    });
    expect(completedAtSnapshot).toBe(0); // snapshot fired while the wave was still blocked (in flight)
    expect(completed).toBe(2); // and after release, the wave drained
  });
});
describe("runLoad — stops at the saturation knee (never pushes to outage)", () => {
  it("halts the ramp on the first saturated step and does not run higher concurrency", async () => {
    const sampledConcurrencies: number[] = [];
    const throttling: HotAction = {
      name: "dragonshare_feed",
      weight: 1,
      run: async () => {
        throw new Error("429 Too Many Requests: rate limit");
      },
    };
    const result = await runLoad({
      rampSteps: [2, 4, 8],
      holdMs: 0,
      sampleEveryMs: 1000,
      runLabel: "knee",
      botFor: async () => ({}) as unknown as SupabaseClient,
      activeUserIds: ["u1"],
      captureSnapshot: async (_label, _rate, notes) => {
        sampledConcurrencies.push(notes.concurrency as number);
      },
      writeFindings: async () => {},
      actions: [throttling],
      kneeThresholds: { maxErrorRate: 0.5, p95DegradeFactor: 99, minP95Ms: 0 },
      now: () => 0,
    });
    expect(result.stoppedAtKnee).toBe(true);
    expect(result.kneeConcurrency).toBe(2);
    expect(result.steps).toHaveLength(1); // never advanced to 4 or 8
    expect(result.breakageCount).toBe(0); // 429 is saturation, NOT a breakage
    expect(sampledConcurrencies).toEqual([2]);
  });
});

// ── runLoad — periodic kill-switch re-check (matrix soak-safe drain) ─────────────────────────────────
describe("runLoad — drains gracefully when the kill switch flips mid-soak (isEnabled re-check)", () => {
  const ok: HotAction = { name: "campaign_browse", weight: 1, run: async () => {} };

  it("stops early, flags stoppedByKillSwitch, still writes findings, does not throw", async () => {
    let enabledCalls = 0;
    let written: LoadFindingsArtifact | null = null;
    const result = await runLoad({
      rampSteps: [2, 4, 8],
      holdMs: 0,
      sampleEveryMs: 1000,
      runLabel: "killswitch",
      botFor: async () => ({}) as unknown as SupabaseClient,
      activeUserIds: ["u1"],
      captureSnapshot: async () => {},
      writeFindings: async (a) => {
        written = a;
      },
      actions: [ok],
      // Enabled at step 1's sample, flipped OFF at step 2's sample.
      isEnabled: async () => {
        enabledCalls += 1;
        return enabledCalls < 2;
      },
      now: () => 0,
    });
    expect(result.stoppedByKillSwitch).toBe(true);
    expect(result.stoppedAtKnee).toBe(false);
    expect(result.steps.length).toBeLessThan(3); // never reached the concurrency-8 step
    expect(written).not.toBeNull(); // findings still written (graceful, not a throw)
  });

  it("defaults to enabled — single-runner mode is unaffected (no early stop)", async () => {
    const result = await runLoad({
      rampSteps: [2],
      holdMs: 0,
      sampleEveryMs: 1000,
      runLabel: "noks",
      botFor: async () => ({}) as unknown as SupabaseClient,
      activeUserIds: ["u1"],
      captureSnapshot: async () => {},
      writeFindings: async () => {},
      actions: [ok],
      now: () => 0, // no isEnabled injected → always enabled
    });
    expect(result.stoppedByKillSwitch).toBe(false);
    expect(result.steps).toHaveLength(1);
  });
});
