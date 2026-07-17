import { describe, it, expect, afterEach, vi } from "vitest";
import {
  recencyToTimeRange, buildSearchBody, shapeSearchResults,
  buildExtractBody, shapeExtractResult, truncate,
  startOfUtcDayIso, isOverCap, tavilySearch, tavilyExtract, TavilyError,
} from "./tavily.ts";

describe("recencyToTimeRange", () => {
  it("maps known values 1:1", () => {
    expect(recencyToTimeRange("day")).toBe("day");
    expect(recencyToTimeRange("year")).toBe("year");
  });
  it("returns undefined for any/unknown/missing", () => {
    expect(recencyToTimeRange("any")).toBeUndefined();
    expect(recencyToTimeRange("nonsense")).toBeUndefined();
    expect(recencyToTimeRange(undefined)).toBeUndefined();
  });
});

describe("buildSearchBody", () => {
  it("includes core params and omits time_range for any", () => {
    const b = buildSearchBody("tacos trend", "any");
    expect(b).toMatchObject({ query: "tacos trend", max_results: 5, include_answer: true });
    expect(b.time_range).toBeUndefined();
  });
  it("adds time_range when recency is concrete", () => {
    expect(buildSearchBody("q", "week").time_range).toBe("week");
  });
});

describe("shapeSearchResults", () => {
  it("keeps top 5 and truncates content to 800 chars", () => {
    const long = "x".repeat(2000);
    const json = {
      answer: "the answer",
      results: Array.from({ length: 8 }, (_, i) => ({ title: `t${i}`, url: `u${i}`, content: long })),
    };
    const out = shapeSearchResults(json);
    expect(out.answer).toBe("the answer");
    expect(out.results).toHaveLength(5);
    expect(out.results[0].content.length).toBe(800);
  });
  it("tolerates missing answer/results", () => {
    expect(shapeSearchResults({})).toEqual({ answer: null, results: [] });
  });
});

describe("shapeExtractResult", () => {
  it("truncates raw_content to 5000 chars", () => {
    const json = { results: [{ url: "u", raw_content: "y".repeat(9000) }] };
    const out = shapeExtractResult(json, "u");
    expect(out.content.length).toBe(5000);
  });
  it("returns empty content when nothing extracted", () => {
    expect(shapeExtractResult({ results: [] }, "u")).toEqual({ url: "u", title: null, content: "" });
  });
});

describe("truncate", () => {
  it("caps length and no-ops under the cap", () => {
    expect(truncate("abcdef", 3)).toBe("abc");
    expect(truncate("ab", 5)).toBe("ab");
  });
});

describe("startOfUtcDayIso", () => {
  it("returns UTC midnight of the given instant", () => {
    expect(startOfUtcDayIso(new Date("2026-07-16T14:37:00Z"))).toBe("2026-07-16T00:00:00.000Z");
  });
});

describe("isOverCap", () => {
  it("true when either count reaches its cap", () => {
    expect(isOverCap(10, 3, { perUser: 10, global: 500 })).toBe(true);
    expect(isOverCap(3, 500, { perUser: 10, global: 500 })).toBe(true);
  });
  it("false when both under", () => {
    expect(isOverCap(9, 499, { perUser: 10, global: 500 })).toBe(false);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tavilySearch", () => {
  it("posts to /search with Bearer auth and shapes the response", async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toBe("https://api.tavily.com/search");
      expect(init.headers.Authorization).toBe("Bearer tvly-KEY");
      expect(JSON.parse(init.body).query).toBe("q");
      return { ok: true, status: 200, json: async () => ({ answer: "a", results: [{ title: "t", url: "u", content: "c" }] }) } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await tavilySearch("tvly-KEY", "q", "any");
    expect(out.answer).toBe("a");
    expect(out.results[0].url).toBe("u");
  });

  it("throws TavilyError on non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as any)));
    await expect(tavilySearch("k", "q")).rejects.toBeInstanceOf(TavilyError);
  });

  it("throws TavilyError on transport failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network error"); }));
    await expect(tavilySearch("k", "q")).rejects.toBeInstanceOf(TavilyError);
  });
});

describe("tavilyExtract", () => {
  it("posts to /extract and shapes the first result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      ({ ok: true, status: 200, json: async () => ({ results: [{ url: "u", raw_content: "body" }] }) } as any)));
    const out = await tavilyExtract("k", "u");
    expect(out.content).toBe("body");
  });
});
