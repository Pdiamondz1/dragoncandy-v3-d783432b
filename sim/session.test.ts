import { describe, it, expect } from "vitest";
import {
  assertSessionMintTarget,
  parseRetryAfter,
  backoffDelayMs,
  fetchWithRetry,
} from "./session";

const URL = "https://zocahiffooqdybdhguqv.supabase.co";

/** Minimal Response stand-in exposing only what fetchWithRetry reads. */
function fakeRes(status: number, retryAfter?: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => (k.toLowerCase() === "retry-after" ? retryAfter ?? null : null) },
    body: { cancel: async () => {} },
  } as unknown as Response;
}

describe("assertSessionMintTarget", () => {
  it("accepts a synthetic email against a supabase url", () => {
    expect(assertSessionMintTarget(URL, "bot001@synthetic.dragoncandy.test")).toBe(URL);
  });
  it("refuses a non-synthetic email — never mint a session for a real user", () => {
    expect(() => assertSessionMintTarget(URL, "real@dragoncandy.io")).toThrow();
  });
  it("refuses a missing url", () => {
    expect(() => assertSessionMintTarget(undefined, "bot001@synthetic.dragoncandy.test")).toThrow();
  });
  it("refuses a non-supabase url (no token leak to a foreign host)", () => {
    expect(() =>
      assertSessionMintTarget("https://evil.example.com", "bot001@synthetic.dragoncandy.test"),
    ).toThrow();
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds to ms", () => expect(parseRetryAfter("2")).toBe(2000));
  it("returns null for absent/negative/non-numeric", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("-1")).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("backoffDelayMs", () => {
  it("is exponential and capped", () => {
    expect(backoffDelayMs(0, 500, 8000)).toBe(500);
    expect(backoffDelayMs(1, 500, 8000)).toBe(1000);
    expect(backoffDelayMs(2, 500, 8000)).toBe(2000);
    expect(backoffDelayMs(10, 500, 8000)).toBe(8000); // capped
  });
});

describe("fetchWithRetry", () => {
  it("retries a 429 with exponential backoff, then returns the success", async () => {
    const delays: number[] = [];
    const seq = [fakeRes(429), fakeRes(429), fakeRes(200)];
    let i = 0;
    const res = await fetchWithRetry(() => Promise.resolve(seq[i++]), {
      baseDelayMs: 500,
      maxDelayMs: 8000,
      sleep: async (ms) => void delays.push(ms),
    });
    expect(res.status).toBe(200);
    expect(delays).toEqual([500, 1000]);
  });

  it("honors a Retry-After header over the computed backoff", async () => {
    const delays: number[] = [];
    const seq = [fakeRes(429, "2"), fakeRes(200)];
    let i = 0;
    await fetchWithRetry(() => Promise.resolve(seq[i++]), { sleep: async (ms) => void delays.push(ms) });
    expect(delays).toEqual([2000]);
  });

  it("fails loud (returns the final 429) after exhausting retries", async () => {
    let calls = 0;
    const res = await fetchWithRetry(
      () => {
        calls += 1;
        return Promise.resolve(fakeRes(429));
      },
      { retries: 2, sleep: async () => {} },
    );
    expect(res.status).toBe(429);
    expect(calls).toBe(3); // first + 2 retries
  });

  it("returns success and non-retryable errors immediately (no sleep)", async () => {
    const boom = async () => {
      throw new Error("must not sleep");
    };
    expect((await fetchWithRetry(() => Promise.resolve(fakeRes(200)), { sleep: boom })).status).toBe(200);
    expect((await fetchWithRetry(() => Promise.resolve(fakeRes(400)), { sleep: boom })).status).toBe(400);
  });
});
