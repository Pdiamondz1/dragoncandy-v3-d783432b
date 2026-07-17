// supabase/functions/donny-chat/web-tools.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleWebSearch, handleReadUrl, CAPS, resolveCount } from "./web-tools.ts";

describe("resolveCount (fail-closed)", () => {
  it("returns MAX_SAFE_INTEGER when the count query errored (fail closed, not open)", () => {
    expect(resolveCount({ count: null, error: { message: "boom" } })).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("returns the count when there is no error", () => {
    expect(resolveCount({ count: 4, error: null })).toBe(4);
  });
  it("treats a null count with no error as 0", () => {
    expect(resolveCount({ count: null, error: null })).toBe(0);
  });
});

const baseCtx = {
  args: { query: "tacos", url: "https://ex.com" },
  userId: "u1",
  supabaseAdmin: {} as any,
  apiKey: "tvly-KEY",
};

function fakeDeps(over = { user: 0, global: 0 }) {
  const search = vi.fn(async () => ({ answer: "a", results: [{ title: "t", url: "u", content: "c" }] }));
  const extract = vi.fn(async () => ({ url: "u", title: null, content: "body" }));
  const logCost = vi.fn(async () => {});
  const count = vi.fn(async (_admin: any, userId: string | null) => (userId ? over.user : over.global));
  return { search, extract, logCost, count, now: () => new Date("2026-07-16T00:00:00Z") };
}

describe("handleWebSearch", () => {
  it("consumer under cap: searches, logs, returns results", async () => {
    const deps = fakeDeps({ user: 0, global: 0 });
    const out = await handleWebSearch({ ...baseCtx, internal: false }, deps);
    expect(deps.search).toHaveBeenCalledWith("tvly-KEY", "tacos", undefined);
    expect(deps.logCost).toHaveBeenCalledWith(baseCtx.supabaseAdmin, { userId: "u1", kind: "web_search" });
    expect(out.result.answer).toBe("a");
  });

  it("consumer over per-user cap: no search, no log, graceful error", async () => {
    const deps = fakeDeps({ user: CAPS.perUser, global: 0 });
    const out = await handleWebSearch({ ...baseCtx, internal: false }, deps);
    expect(deps.search).not.toHaveBeenCalled();
    expect(deps.logCost).not.toHaveBeenCalled();
    expect(out.result.error).toMatch(/limit/i);
  });

  it("internal: bypasses caps (no count), still logs", async () => {
    const deps = fakeDeps({ user: 9999, global: 9999 });
    const out = await handleWebSearch({ ...baseCtx, internal: true }, deps);
    expect(deps.count).not.toHaveBeenCalled();
    expect(deps.search).toHaveBeenCalled();
    expect(deps.logCost).toHaveBeenCalled();
    expect(out.result.answer).toBe("a");
  });

  it("missing apiKey: graceful, no search", async () => {
    const deps = fakeDeps();
    const out = await handleWebSearch({ ...baseCtx, apiKey: undefined, internal: true }, deps);
    expect(deps.search).not.toHaveBeenCalled();
    expect(out.result.error).toMatch(/configured/i);
  });

  it("tavily failure: graceful error, no throw", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = fakeDeps();
    deps.search = vi.fn(async () => { throw new Error("boom"); });
    const out = await handleWebSearch({ ...baseCtx, internal: true }, deps);
    expect(out.result.error).toMatch(/temporarily unavailable/i);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("handleReadUrl", () => {
  it("consumer under cap: extracts, logs web_extract", async () => {
    const deps = fakeDeps({ user: 0, global: 0 });
    const out = await handleReadUrl({ ...baseCtx, internal: false }, deps);
    expect(deps.extract).toHaveBeenCalledWith("tvly-KEY", "https://ex.com");
    expect(deps.logCost).toHaveBeenCalledWith(baseCtx.supabaseAdmin, { userId: "u1", kind: "web_extract" });
    expect(out.result.content).toBe("body");
  });

  it("global cap reached blocks a consumer", async () => {
    const deps = fakeDeps({ user: 0, global: CAPS.global });
    const out = await handleReadUrl({ ...baseCtx, internal: false }, deps);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(out.result.error).toMatch(/busy|limit/i);
  });
});
