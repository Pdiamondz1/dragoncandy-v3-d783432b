import { describe, it, expect, vi } from "vitest";
import { search, readUrl } from "./web.ts";

const uc = { user_id: "u1", user_role: "business_client" } as any;
function deps(over = { user: 0, global: 0 }) {
  return {
    search: vi.fn(async () => ({ answer: "a", results: [{ title: "t", url: "https://x.com", content: "c" }] })),
    extract: vi.fn(async () => ({ url: "https://x.com", title: null, content: "body" })),
    logCost: vi.fn(async () => {}),
    count: vi.fn(async (_a: any, uid: string | null) => (uid ? over.user : over.global)),
    now: () => new Date("2026-07-16T00:00:00Z"),
  };
}

describe("web agent search", () => {
  it("under cap: searches, logs web_search, context carries query + source URL", async () => {
    const d = deps();
    const out = await search({} as any, { query: "tacos", tavily_api_key: "k" }, uc, d);
    expect(d.search).toHaveBeenCalledWith("k", "tacos", undefined);
    expect(d.logCost).toHaveBeenCalledWith({}, { userId: "u1", kind: "web_search", edgeFunction: "donny-orchestrator" });
    expect(out.context).toContain("tacos");
    expect(out.context).toContain("https://x.com");
    expect(out.suggested_actions).toBeUndefined();
  });
  it("over per-user cap: no search, graceful context", async () => {
    const d = deps({ user: 10, global: 0 });
    const out = await search({} as any, { query: "x", tavily_api_key: "k" }, uc, d);
    expect(d.search).not.toHaveBeenCalled();
    expect(out.context).toMatch(/limit/i);
  });
  it("missing key: no search, graceful", async () => {
    const d = deps();
    const out = await search({} as any, { query: "x" }, uc, d);
    expect(d.search).not.toHaveBeenCalled();
    expect(out.context).toMatch(/configured|can.?t/i);
  });
  it("tavily failure: graceful, no throw", async () => {
    const d = deps();
    d.search = vi.fn(async () => { throw new Error("boom"); });
    const out = await search({} as any, { query: "x", tavily_api_key: "k" }, uc, d);
    expect(out.context).toMatch(/unavailable|try again/i);
  });
});

describe("web agent readUrl", () => {
  it("under cap: extracts, logs web_extract", async () => {
    const d = deps();
    const out = await readUrl({} as any, { url: "https://x.com", tavily_api_key: "k" }, uc, d);
    expect(d.extract).toHaveBeenCalledWith("k", "https://x.com");
    expect(d.logCost).toHaveBeenCalledWith({}, { userId: "u1", kind: "web_extract", edgeFunction: "donny-orchestrator" });
    expect(out.context).toContain("body");
  });
  it("global cap reached blocks a consumer", async () => {
    const d = deps({ user: 0, global: 500 });
    const out = await readUrl({} as any, { url: "https://x.com", tavily_api_key: "k" }, uc, d);
    expect(d.extract).not.toHaveBeenCalled();
    expect(out.context).toMatch(/busy|later/i);
  });
});
